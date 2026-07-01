import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { cardBreakdownFromTotal } from "./_lib/pricing.js";

/**
 * POST /api/valor-confirm-payment
 *
 * Called by TrackOrder after Valor's ePage redirects the customer back. The
 * URL contains rrn / auth_code as query params — but those are CUSTOMER-
 * CONTROLLED and untrusted. This endpoint calls Valor's transaction-status
 * API to independently verify the transaction succeeded, then flips the
 * order to paid via the Admin SDK.
 *
 * This is the synchronous fallback for the asynchronous Valor webhook. The
 * webhook (if registered in Valor's portal) is still the preferred path —
 * this endpoint is here so web checkout works even when the webhook isn't
 * configured. Both paths use the same idempotency check.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;

// Strip "-NNNNNN" 6-digit timestamp suffix that create-valor-checkout.ts
// appends to invoice_no to keep each Valor session unique.
function stripInvoiceSuffix(raw: string): string {
  if (/-[0-9]{6}$/.test(raw)) {
    return raw.slice(0, raw.lastIndexOf("-"));
  }
  return raw;
}

interface ValorStatusResult {
  approved: boolean;
  rrn?: string;
  authCode?: string;
  maskedPan?: string;
  // The amount Valor reports as captured/approved for this transaction, in
  // dollars. Used to verify the customer was charged the expected card total.
  amount?: number;
  raw: Record<string, unknown>;
}

// Pull a dollar amount out of whatever field Valor used. ePage responses vary
// (amount / approved_amount / total / authorized_amount / txn_amount); some are
// strings, some include a leading "$". Returns undefined if none parse.
function parseValorAmount(data: Record<string, unknown>): number | undefined {
  const candidates = [
    data.amount,
    data.approved_amount,
    data.authorized_amount,
    data.txn_amount,
    data.total,
    data.total_amount,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const n = typeof c === "number" ? c : parseFloat(String(c).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

// Query Valor for the ePage transaction status by invoice number. We pass
// `txn_type: "transaction_inquiry"` which is Valor's standard lookup; if a
// merchant's API uses a different code, surface that here.
async function queryValorStatus(opts: {
  appKey: string;
  epi: string;
  orderId: string;
  rrn?: string;
}): Promise<ValorStatusResult> {
  const form = new URLSearchParams();
  form.append("appid", VALOR_APPID!);
  form.append("appkey", opts.appKey);
  form.append("epi", opts.epi);
  form.append("txn_type", "transaction_inquiry");
  form.append("invoice_no", opts.orderId);
  if (opts.rrn) form.append("rrn", opts.rrn);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8_000);
  try {
    const r = await fetch(VALOR_API_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    const text = await r.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    const rrn = (data.rrn as string) || opts.rrn;
    const authCode = (data.auth_code as string) || (data.code as string);

    // error_no === "S00" only means the inquiry API CALL succeeded — NOT that a
    // transaction was captured. Require an explicit transaction-level approved
    // status AND a real transaction reference (rrn or auth_code). Without this,
    // an empty/"no transaction found" S00 envelope would be treated as a
    // successful payment and mint a free meal.
    const statusStr = String(data.status ?? "").toLowerCase();
    const txnStatusStr = String(data.txn_status ?? "").toLowerCase();
    const txnApprovedSignal =
      statusStr === "approved" ||
      statusStr === "success" ||
      txnStatusStr === "approved" ||
      txnStatusStr === "success";
    const hasTxnRef = Boolean(rrn) || Boolean(authCode);
    const approved = txnApprovedSignal && hasTxnRef;

    return {
      approved,
      rrn,
      authCode,
      maskedPan: (data.masked_pan as string) || (data.card_last4 as string),
      amount: parseValorAmount(data),
      raw: data,
    };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  // Customers may retry a few times if Valor is slow; allow that but not abuse.
  if (!rateLimit(req, 30, 60_000)) return errorResponse(res, 429, "Too many requests");

  const appKey = process.env.VALOR_EPAGE_APPKEY || process.env.VALOR_APPKEY;
  const epi = process.env.VALOR_EPAGE_EPI || process.env.VALOR_EPI;
  if (!VALOR_API_URL || !VALOR_APPID || !appKey || !epi) {
    return errorResponse(res, 500, "Valor not configured");
  }

  const { orderId: rawOrderId, rrn: rawRrn, auth_code: rawAuthCode } = req.body || {};

  if (typeof rawOrderId !== "string" || rawOrderId.length < 4 || rawOrderId.length > 64) {
    return errorResponse(res, 400, "Invalid orderId");
  }
  if (rawRrn !== undefined && (typeof rawRrn !== "string" || rawRrn.length > 32)) {
    return errorResponse(res, 400, "Invalid rrn");
  }
  if (rawAuthCode !== undefined && (typeof rawAuthCode !== "string" || rawAuthCode.length > 32)) {
    return errorResponse(res, 400, "Invalid auth_code");
  }

  const orderId = stripInvoiceSuffix(rawOrderId);
  const orderRef = adminDb.collection("orders").doc(orderId);

  // Pre-check: if already paid, return success without re-verifying.
  const initialSnap = await orderRef.get();
  if (!initialSnap.exists) {
    return res.status(404).json({ ok: false, error: "Order not found" });
  }
  const initialData = initialSnap.data() || {};
  if (initialData.payment_status === "paid") {
    return res.status(200).json({ ok: true, alreadyPaid: true, orderId });
  }

  // Verify with Valor
  let valorResult: ValorStatusResult;
  try {
    valorResult = await queryValorStatus({
      appKey,
      epi,
      orderId,
      rrn: rawRrn,
    });
  } catch (err) {
    console.error("[confirm-payment] valor query failed", err);
    return res.status(502).json({ ok: false, error: "Could not reach Valor" });
  }

  if (!valorResult.approved) {
    console.warn("[confirm-payment] not approved", {
      orderId,
      raw: valorResult.raw,
    });
    return res.status(200).json({
      ok: false,
      pending: true,
      message: "Payment not yet confirmed by Valor",
    });
  }

  // Mark paid atomically. Mirror the webhook's transaction so duplicate calls
  // (browser retries) don't double-write. The amount comparison happens INSIDE
  // the transaction against the freshly-read order total so we never flip an
  // order to paid for less than it costs.
  let txnOutcome: "paid" | "already" | "amount_mismatch" | "not_found" = "not_found";
  try {
    txnOutcome = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return "not_found" as const;
      const data = snap.data() || {};
      if (data.payment_status === "paid") return "already" as const;

      // Defense-in-depth amount check. The PRIMARY control against undercharge
      // is create-valor-checkout, which already recomputes the charged amount
      // server-side from this order's stored total (the browser can't dictate
      // it). Here we only HOLD an order when we can positively SEE that Valor
      // captured LESS than expected. Crucially we FAIL OPEN when the captured
      // amount is unknown: Valor's status payload field names vary, and if we
      // can't parse an amount we must NOT strand every paid order as unpaid
      // (kitchen would never see real orders). Overcharge (customer paid more)
      // is logged via paid_amount but never withholds fulfillment.
      // Compare against the pre-surcharge SUBTOTAL, not the grand total: Valor's
      // payload may echo back either the pre-surcharge `amount` (= subtotal, what
      // the ePage request carried) or the captured grand total, and the two
      // parsers can pick up either. Holding only when the captured figure is
      // below even the bare subtotal still catches a real undercharge (e.g. the
      // $0.01-for-$50 attack) while never false-flagging a correctly-charged
      // order just because Valor reported the subtotal field.
      const expected = cardBreakdownFromTotal(
        typeof data.total === "number" ? data.total : NaN,
      );
      const capturedAmount = valorResult.amount;
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
            via: "confirm_endpoint",
          },
        });
        return "amount_mismatch" as const;
      }

      const update: Record<string, unknown> = {
        payment_status: "paid",
        paid_at: FieldValue.serverTimestamp(),
        paid_via: "confirm_endpoint",
        // ?? null — an undefined field throws the whole transaction (Firestore
        // rejects undefined), which would strand a real paid order as unpaid.
        // This is the fail-open path, so coalesce to null.
        paid_amount: capturedAmount ?? null,
      };
      if (valorResult.rrn) update.rrn = valorResult.rrn;
      if (valorResult.authCode) update.auth_code = valorResult.authCode;
      if (valorResult.maskedPan) update.masked_pan = valorResult.maskedPan;

      // Advance status if chef hasn't already touched it. Also UN-EXPIRE a
      // late-paid order the orphan cron marked 'expired', so a slow-but-real
      // payment re-activates it for the kitchen instead of being stranded.
      if (data.status === "pending" || data.status === "expired") {
        update.status = "received";
        update.expired_at = FieldValue.delete();
      }

      tx.update(orderRef, update);
      return "paid" as const;
    });
  } catch (err) {
    console.error("[confirm-payment] firestore write failed", err);
    return res.status(500).json({ ok: false, error: "Could not update order" });
  }

  if (txnOutcome === "amount_mismatch") {
    console.error("[confirm-payment] AMOUNT MISMATCH — left unpaid for review", {
      orderId,
      captured: valorResult.amount ?? null,
      rrn: valorResult.rrn || null,
      auth_code: valorResult.authCode || null,
    });
    return res.status(200).json({
      ok: false,
      amount_mismatch: true,
      message: "Payment amount could not be verified; order held for review",
    });
  }

  console.log("[confirm-payment] approved", {
    orderId,
    rrn: valorResult.rrn || null,
    auth_code: valorResult.authCode || null,
    masked_pan: valorResult.maskedPan || null,
  });

  return res.status(200).json({ ok: true, orderId, marked: "paid" });
}
