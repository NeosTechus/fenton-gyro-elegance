import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";

/**
 * POST /api/valor-void
 *
 * Voids a Valor ePage sale when a customer cancels within the cancellation
 * window on the order tracking page. Best-effort: if Valor rejects the
 * request (e.g. the rrn is wrong or the batch has already settled so only a
 * refund is possible), the caller falls back to a manual refund prompt.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  if (!rateLimit(req, 10, 60_000)) return errorResponse(res, 429, "Too many requests");

  const appKey = process.env.VALOR_EPAGE_APPKEY || process.env.VALOR_APPKEY;
  const epi = process.env.VALOR_EPAGE_EPI || process.env.VALOR_EPI;
  if (!VALOR_API_URL || !VALOR_APPID || !appKey || !epi) {
    return errorResponse(res, 500, "Valor not configured");
  }

  const { orderId, rrn, authCode, amount } = req.body || {};
  if (typeof orderId !== "string" || orderId.length < 4 || orderId.length > 64) {
    return errorResponse(res, 400, "Invalid orderId");
  }
  if (rrn && (typeof rrn !== "string" || rrn.length > 32)) {
    return errorResponse(res, 400, "Invalid rrn");
  }
  if (amount && !/^\d+(\.\d{1,2})?$/.test(String(amount))) {
    return errorResponse(res, 400, "Invalid amount");
  }

  try {
    const form = new URLSearchParams();
    form.append("appid", VALOR_APPID);
    form.append("appkey", appKey);
    form.append("epi", epi);
    form.append("txn_type", "void");
    form.append("invoice_no", orderId);
    if (rrn) form.append("rrn", rrn);
    if (authCode) form.append("auth_code", authCode);
    if (amount) form.append("amount", String(amount));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let valorResponse: Response;
    try {
      valorResponse = await fetch(VALOR_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await valorResponse.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log("[valor-void] response", { orderId, status: valorResponse.status, data });

    const approved = data.error_no === "S00" || data.status === "approved";
    if (!approved) {
      return res.status(502).json({
        ok: false,
        code: data.error_no || "UNKNOWN",
        message: data.msg || data.mesg || "Valor void failed",
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (error: any) {
    const isTimeout = error?.name === "AbortError";
    return errorResponse(
      res,
      isTimeout ? 504 : 500,
      isTimeout ? "Valor API timed out" : "Internal error",
      error,
    );
  }
}
