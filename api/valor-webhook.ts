import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify webhook authenticity. The secret is REQUIRED — if it isn't set,
  // refuse all traffic rather than silently let anyone POST a "payment".
  if (!WEBHOOK_SECRET) {
    console.error("[valor-webhook] refused: WEBHOOK_SECRET env var not set");
    return res.status(503).json({ error: "Webhook not configured" });
  }
  const providedHeader = req.headers["x-webhook-secret"];
  const providedSecret = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;
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

        const update: Record<string, unknown> = {
          payment_status: "paid",
          paid_at: FieldValue.serverTimestamp(),
        };
        if (rrn) update.rrn = rrn;
        if (authCode) update.auth_code = authCode;
        if (maskedPan) update.masked_pan = maskedPan;

        // Only flip status pending -> received. If the chef has already
        // moved it forward (preparing, ready, completed, cancelled), leave
        // it alone.
        if (data.status === "pending") {
          update.status = "received";
        }

        tx.update(orderRef, update);
        return { ok: true as const, already: false as const };
      });

      if (!result.ok) {
        console.warn("[valor-webhook] order not found", { orderId });
        // Still return 200 so Valor doesn't keep retrying — there's nothing
        // we can do server-side if the order doc never existed.
        return res
          .status(200)
          .json({ received: true, approved: true, orderId, not_found: true });
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
