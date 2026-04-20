import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rateLimit,
  isAllowedOrigin,
  setCors,
  isEpi,
  isAppKey,
  isReqTxnId,
  errorResponse,
} from "./_lib/security.js";

/**
 * POST /api/valor-terminal-status
 *
 * Polls the status of a published Valor Connect transaction.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  // Higher limit for status — frontend polls every 2s during a txn
  if (!rateLimit(req, 200, 60_000)) return errorResponse(res, 429, "Too many requests");

  if (!VALOR_API_URL || !VALOR_APPID) return errorResponse(res, 500, "Service unavailable");

  const { epi, appkey, reqTxnId } = req.body || {};

  if (!isEpi(epi)) return errorResponse(res, 400, "Invalid epi");
  if (!isAppKey(appkey)) return errorResponse(res, 400, "Invalid appkey");
  if (!isReqTxnId(reqTxnId) && !/^PING\d+$/.test(String(reqTxnId))) return errorResponse(res, 400, "Invalid reqTxnId");

  try {
    const body = {
      appid: VALOR_APPID,
      appkey,
      epi,
      txn_type: "vc_status",
      req_txn_id: reqTxnId,
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

    return res.status(200).json({ response: data });
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
