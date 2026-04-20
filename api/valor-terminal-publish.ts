import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rateLimit,
  isAllowedOrigin,
  setCors,
  isEpi,
  isAppKey,
  isCentsAmount,
  errorResponse,
} from "./_lib/security.js";

/**
 * POST /api/valor-terminal-publish
 *
 * Sends a transaction to a Valor terminal via Valor Connect Wrapper API.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;
const VALOR_CHANNEL_ID = process.env.VALOR_CHANNEL_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  if (!rateLimit(req, 20, 60_000)) return errorResponse(res, 429, "Too many requests");

  if (!VALOR_API_URL || !VALOR_APPID || !VALOR_CHANNEL_ID) {
    return errorResponse(res, 500, "Service unavailable");
  }

  const { epi, appkey, payload, reqTxnId } = req.body || {};

  if (!isEpi(epi)) return errorResponse(res, 400, "Invalid epi");
  if (!isAppKey(appkey)) return errorResponse(res, 400, "Invalid appkey");
  if (!payload || typeof payload !== "object") return errorResponse(res, 400, "Invalid payload");
  if (!isCentsAmount(payload.AMOUNT)) return errorResponse(res, 400, "Invalid amount");

  const txnId = typeof reqTxnId === "string" && /^[A-Z0-9]{5,25}$/.test(reqTxnId)
    ? reqTxnId
    : `TXN${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    // Valor Connect expects req_txn_id both at top level AND inside payload
    // (error VC06 "REQUEST TXN ID REQUIRED" when only at top level)
    const body = {
      appid: VALOR_APPID,
      appkey,
      epi,
      channel_id: VALOR_CHANNEL_ID,
      txn_type: "vc_publish",
      req_txn_id: txnId,
      version: "2",
      payload: { ...payload, req_txn_id: txnId },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let valorResponse: Response;
    try {
      valorResponse = await fetch(VALOR_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await valorResponse.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log("[valor-publish]", { status: valorResponse.status, error_no: data.error_no, txnId });

    if (data.error_no && data.error_no !== "S00") {
      return errorResponse(res, 502, data.msg || data.mesg || "Payment provider error");
    }

    return res.status(200).json({ reqTxnId: txnId, response: data });
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
