import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

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
  raw: Record<string, unknown>;
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

    const approved =
      data.error_no === "S00" ||
      data.status === "approved" ||
      data.status === "APPROVED" ||
      data.txn_status === "approved";

    return {
      approved,
      rrn: (data.rrn as string) || opts.rrn,
      authCode: (data.auth_code as string) || (data.code as string),
      maskedPan: (data.masked_pan as string) || (data.card_last4 as string),
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

  // Prefer the exact invoice stored at checkout (includes -NNNNNN suffix).
  const storedInvoice =
    typeof initialData.valor_invoice_no === "string" ? initialData.valor_invoice_no : null;
  const inquiryInvoice = storedInvoice || orderId;

  // Verify with Valor
  let valorResult: ValorStatusResult;
  try {
    valorResult = await queryValorStatus({
      appKey,
      epi,
      orderId: inquiryInvoice,
      rrn: rawRrn,
    });
    // Fallback: try bare Firestore id if stored suffix invoice failed.
    if (!valorResult.approved && inquiryInvoice !== orderId) {
      valorResult = await queryValorStatus({
        appKey,
        epi,
        orderId,
        rrn: rawRrn,
      });
    }
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
  // (browser retries) don't double-write.
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (data.payment_status === "paid") return; // idempotent

      const update: Record<string, unknown> = {
        payment_status: "paid",
        paid_at: FieldValue.serverTimestamp(),
        paid_via: "confirm_endpoint",
      };
      if (valorResult.rrn) update.rrn = valorResult.rrn;
      if (valorResult.authCode) update.auth_code = valorResult.authCode;
      if (valorResult.maskedPan) update.masked_pan = valorResult.maskedPan;

      // Only advance status if chef hasn't already touched it.
      if (data.status === "pending") {
        update.status = "received";
      }

      tx.update(orderRef, update);
    });
  } catch (err) {
    console.error("[confirm-payment] firestore write failed", err);
    return res.status(500).json({ ok: false, error: "Could not update order" });
  }

  console.log("[confirm-payment] approved", {
    orderId,
    rrn: valorResult.rrn || null,
    auth_code: valorResult.authCode || null,
    masked_pan: valorResult.maskedPan || null,
  });

  return res.status(200).json({ ok: true, orderId, marked: "paid" });
}
