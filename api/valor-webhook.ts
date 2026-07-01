import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { cardBreakdownFromTotal } from "./_lib/pricing.js";

/**
 * POST /api/valor-webhook
 *
 * Receives payment result callbacks from Valor after ePage checkout completes.
 * Register this URL in the Valor portal as your webhook/callback URL.
 *
 * This endpoint is the AUTHORITATIVE source of truth for flipping an order to
 * paid. The client redirect after checkout is NOT trusted — it only triggers
 * UI updates. Firestore writes for payment_status happen here.
 */

// Shared secret for webhook verification — REQUIRED. If WEBHOOK_SECRET is not
// set in Vercel env, every request is rejected. The webhook is the only
// untrusted-internet entry point that can flip orders to paid; allowing
// unauthenticated POSTs would let anyone mint a free meal by sending a forged
// payload with a known orderId.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Constant-time comparison so a colocated attacker can't measure the response
// latency to recover the secret one byte at a time.
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Strip "-NNNNNN" 6-digit timestamp suffix that create-valor-checkout.ts
// appends to invoice_no to make each Valor session unique on retry. The real
// Firestore order id is everything before that suffix.
function stripInvoiceSuffix(raw: string): string {
  if (/-[0-9]{6}$/.test(raw)) {
    return raw.slice(0, raw.lastIndexOf("-"));
  }
  return raw;
}

function maskError(message: unknown): string {
  if (typeof message !== "string") return "Internal error";
  // Avoid leaking stack traces / Firestore internals to the caller.
  return message.length > 200 ? "Internal error" : message;
}

// Pull a dollar amount out of whatever field Valor used in the webhook payload.
// Payloads vary (amount / approved_amount / total / authorized_amount); some
// are strings, some include a leading "$". Returns undefined if none parse.
function parseWebhookAmount(body: Record<string, unknown>): number | undefined {
  const candidates = [
    body.amount,
    body.approved_amount,
    body.authorized_amount,
    body.txn_amount,
    body.total,
    body.total_amount,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const n = typeof c === "number" ? c : parseFloat(String(c).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // No CORS headers: this endpoint is server-to-server (Valor POSTs to it with
  // a secret header) and is never called from a browser. A wildcard
  // Access-Control-Allow-Origin would needlessly invite cross-origin probing,
  // so we omit CORS entirely.
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify webhook authenticity. The secret is REQUIRED — if it isn't set,
  // refuse all traffic rather than silently let anyone POST a "payment".
  if (!WEBHOOK_SECRET) {
    console.error("[valor-webhook] refused: WEBHOOK_SECRET env var not set");
    return res.status(503).json({ error: "Webhook not configured" });
  }
  // Accept the secret via the X-Webhook-Secret header OR a ?token= query param.
  // Valor's "URL Notification" can only POST to a fixed URL (no custom headers),
  // so the query-param form is what actually works for Valor; the header form is
  // kept for any caller that can send headers. Either must match (timing-safe).
  const headerVal = req.headers["x-webhook-secret"];
  const headerSecret = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const queryVal = req.query?.token;
  const querySecret = Array.isArray(queryVal) ? queryVal[0] : queryVal;
  const providedSecret =
    typeof headerSecret === "string" && headerSecret.length > 0
      ? headerSecret
      : typeof querySecret === "string"
        ? querySecret
        : undefined;
  if (typeof providedSecret !== "string" || !secretsMatch(providedSecret, WEBHOOK_SECRET)) {
    console.warn("[valor-webhook] rejected — invalid or missing secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const rawOrderId: string | undefined = body.orderId || body.invoice_no;
    const status: string | undefined = body.status || body.state;
    const rrn: string | undefined = body.rrn;
    const authCode: string | undefined = body.auth_code || body.code;
    const maskedPan: string | undefined = body.card_last4 || body.masked_pan;
    const capturedAmount: number | undefined = parseWebhookAmount(body as Record<string, unknown>);

    if (!rawOrderId || typeof rawOrderId !== "string") {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const orderId = stripInvoiceSuffix(rawOrderId);

    const isApproved =
      status === "approved" ||
      status === "0" ||
      status === "success" ||
      status === "APPROVED";

    // Always log a decision line — but with masked PAN only, never the raw
    // body (it can contain PII / card data in some Valor configurations).
    console.log("[valor-webhook]", {
      orderId,
      approved: isApproved,
      status,
      rrn: rrn || null,
      auth_code: authCode || null,
      masked_pan: maskedPan || null,
    });

    const orderRef = adminDb.collection("orders").doc(orderId);

    if (isApproved) {
      // Atomic read-check-write so two near-simultaneous webhook deliveries
      // (Valor sometimes retries) can't both fire side effects, and so we
      // don't clobber a status the chef has already advanced past "received".
      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);

        if (!snap.exists) {
          return { ok: false as const, reason: "not_found" as const };
        }

        const data = snap.data() || {};

        // Idempotency: if already paid, do nothing.
        if (data.payment_status === "paid") {
          return { ok: true as const, already: true as const };
        }

        // Defense-in-depth amount check. We only HOLD an order when we can
        // positively SEE that Valor captured LESS than expected. FAIL OPEN when
        // the captured amount is unknown: webhook payload field names vary, and
        // stranding every paid order as unpaid would stop the kitchen from ever
        // seeing real orders. Overcharge is recorded via paid_amount, never
        // withheld.
        // Compare against the pre-surcharge SUBTOTAL, not the grand total —
        // Valor's webhook may report either the pre-surcharge `amount` or the
        // captured total. Holding only below the bare subtotal catches a real
        // undercharge without false-flagging correctly-charged orders.
        const expected = cardBreakdownFromTotal(
          typeof data.total === "number" ? data.total : NaN,
        );
        const knownUndercharge =
          expected != null &&
          typeof capturedAmount === "number" &&
          capturedAmount + 0.01 < expected.subtotal;

        if (knownUndercharge) {
          tx.update(orderRef, {
            amount_mismatch: true,
            amount_mismatch_at: FieldValue.serverTimestamp(),
            amount_mismatch_detail: {
              captured: capturedAmount ?? null,
              expected: expected?.total ?? null,
              via: "webhook",
            },
          });
          return { ok: true as const, mismatch: true as const };
        }

        const update: Record<string, unknown> = {
          payment_status: "paid",
          paid_at: FieldValue.serverTimestamp(),
          // ?? null — Firestore rejects an `undefined` field value and would
          // throw the whole transaction, leaving a real paid order UNPAID. This
          // is the fail-open case (amount couldn't be parsed), so coalesce.
          paid_amount: capturedAmount ?? null,
        };
        if (rrn) update.rrn = rrn;
        if (authCode) update.auth_code = authCode;
        if (maskedPan) update.masked_pan = maskedPan;

        // Flip status pending -> received. Also UN-EXPIRE: if the orphan cron
        // already marked this order 'expired' (slow customer who paid >30 min
        // after creating the order), a late-arriving payment must re-activate it
        // so the kitchen sees it — otherwise the customer is charged for a meal
        // stuck in 'expired' that no column shows. If the chef already moved it
        // forward (preparing/ready/completed/cancelled), leave it alone.
        if (data.status === "pending" || data.status === "expired") {
          update.status = "received";
          update.expired_at = FieldValue.delete();
        }

        tx.update(orderRef, update);
        return { ok: true as const, already: false as const };
      });

      if (!result.ok) {
        // Approved payment for an order doc that doesn't exist. Durably record
        // an orphan_payments row so finance can reconcile — money may have
        // moved with no order to attach it to. We STILL return 200 so Valor
        // stops retrying (there's no order for us to fix server-side).
        try {
          await adminDb.collection("orphan_payments").add({
            orderId,
            raw_invoice: rawOrderId,
            rrn: rrn || null,
            auth_code: authCode || null,
            masked_pan: maskedPan || null,
            amount: capturedAmount ?? null,
            received_at: FieldValue.serverTimestamp(),
            source: "webhook",
          });
        } catch (orphanErr) {
          console.error(
            "[valor-webhook] FAILED to record orphan_payment",
            { orderId },
            maskError((orphanErr as Error)?.message),
          );
        }
        // ALERT-WORTHY: an approved payment landed with no matching order.
        // Structured so a log-based alert can match on this prefix.
        console.error("[valor-webhook] ORPHAN_PAYMENT approved payment, order not found", {
          orderId,
          rrn: rrn || null,
          auth_code: authCode || null,
          masked_pan: maskedPan || null,
          amount: capturedAmount ?? null,
        });
        return res
          .status(200)
          .json({ received: true, approved: true, orderId, not_found: true, orphan_recorded: true });
      }

      if (result.mismatch) {
        console.error("[valor-webhook] AMOUNT MISMATCH — left unpaid for review", {
          orderId,
          captured: capturedAmount ?? null,
          rrn: rrn || null,
          auth_code: authCode || null,
        });
        return res
          .status(200)
          .json({ received: true, approved: true, orderId, amount_mismatch: true });
      }

      if (result.already) {
        return res
          .status(200)
          .json({ received: true, already: true, approved: true, orderId });
      }

      return res
        .status(200)
        .json({ received: true, approved: true, orderId });
    }

    // Not approved: record failure metadata but DO NOT flip payment_status.
    // The order stays unpaid. Idempotent because update() is harmless on
    // repeated declines (just overwrites timestamp/reason).
    try {
      const snap = await orderRef.get();
      if (snap.exists) {
        // If somehow already paid, don't overwrite the success with a
        // stale decline retry.
        const data = snap.data() || {};
        if (data.payment_status !== "paid") {
          await orderRef.update({
            payment_failed_at: FieldValue.serverTimestamp(),
            decline_reason: body.msg || body.mesg || status || "declined",
          });
        }
      }
    } catch (innerErr) {
      console.error("[valor-webhook] decline write failed", maskError((innerErr as Error)?.message));
    }

    return res
      .status(200)
      .json({ received: true, approved: false, orderId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[valor-webhook] error:", msg);
    return res.status(500).json({ error: maskError(msg) });
  }
}
