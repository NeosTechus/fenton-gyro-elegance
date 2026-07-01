import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rateLimit,
  isAllowedOrigin,
  setCors,
  isEpi,
  isCentsAmount,
  errorResponse,
} from "./_lib/security.js";
import {
  resolveAppKeyForEpi,
  claimReqTxnId,
  recordReqTxnOutcome,
  releaseReqTxnId,
} from "./_lib/idempotency.js";

/**
 * POST /api/valor-terminal-publish
 *
 * Sends a transaction to a Valor terminal via Valor Connect Wrapper API.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;
const VALOR_CHANNEL_ID = process.env.VALOR_CHANNEL_ID;

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  if (!rateLimit(req, 20, 60_000)) return errorResponse(res, 429, "Too many requests");

  if (!VALOR_API_URL || !VALOR_APPID || !VALOR_CHANNEL_ID) {
    return errorResponse(res, 500, "Service unavailable");
  }

  // Warmup ping — keeps the Vercel lambda hot so the first real publish
  // doesn't pay a cold-start delay before the terminal is contacted.
  if (req.body?.warmup === true) {
    return res.status(200).json({ warm: true });
  }

  // NOTE: the client sends only the non-secret EPI (device id). The terminal's
  // secret appKey is resolved SERVER-SIDE from the VALOR_TERMINAL_KEYS env
  // allow-list; never trust an appkey from the request body.
  const { epi, payload, reqTxnId } = req.body || {};

  if (!isEpi(epi)) return errorResponse(res, 400, "Invalid epi");

  const appkey = resolveAppKeyForEpi(epi);
  if (!appkey) return errorResponse(res, 403, "Unknown terminal");

  if (!payload || typeof payload !== "object") return errorResponse(res, 400, "Invalid payload");
  if (!isCentsAmount(payload.AMOUNT)) return errorResponse(res, 400, "Invalid amount");

  const txnId = typeof reqTxnId === "string" && /^[A-Z0-9]{5,25}$/.test(reqTxnId)
    ? reqTxnId
    : `TXN${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Server-side idempotency: atomically claim this reqTxnId before forwarding
  // to Valor. If it was already published (a retry that races a slow capture),
  // refuse to re-publish and replay the prior outcome — this is the core fix
  // for the double-charge bug.
  let claim;
  try {
    claim = await claimReqTxnId(txnId, { epi });
  } catch (err) {
    return errorResponse(res, 500, "Internal error", err);
  }
  if (!claim.claimed) {
    return res.status(409).json({
      error: "already_processed",
      reqTxnId: txnId,
      status: claim.prior?.status || "pending",
      response: claim.prior?.outcome ?? null,
    });
  }

  // Tracks whether the request actually reached Valor (fetch resolved with
  // response headers). Once true, the terminal MAY have captured the card, so
  // an error AFTER this point (e.g. a body-read socket failure) must NOT release
  // the idempotency claim — otherwise a retry would re-charge. Declared outside
  // the try so the catch can read it.
  let fetchReachedValor = false;
  try {
    const body = {
      appid: VALOR_APPID,
      appkey,
      epi,
      channel_id: VALOR_CHANNEL_ID,
      txn_type: "vc_publish",
      version: "2",
      payload: { ...payload, REQ_TXN_ID: txnId },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);
    let valorResponse: Response;
    try {
      valorResponse = await fetch(VALOR_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      fetchReachedValor = true;
    } finally {
      clearTimeout(timeout);
    }

    const text = await valorResponse.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log("[valor-publish]", { status: valorResponse.status, error_no: data.error_no, txnId });

    if (data.error_no && data.error_no !== "S00") {
      await recordReqTxnOutcome(txnId, "failed", { error_no: data.error_no });
      return errorResponse(res, 502, data.msg || data.mesg || "Payment provider error");
    }

    await recordReqTxnOutcome(txnId, "completed", data);
    return res.status(200).json({ reqTxnId: txnId, response: data });
  } catch (error: any) {
    const isTimeout = error?.name === "AbortError";
    // KEEP the claim whenever the request reached Valor — a timeout (still
    // capturing) OR a post-response failure like a body-read socket error
    // (the capture may already have happened). In both cases a retry must NOT
    // re-publish; the client resolves the outcome by polling status. ONLY
    // release the claim when the request never reached Valor (a genuine
    // pre-send transport error), so a legitimate retry can re-attempt.
    if (!isTimeout && !fetchReachedValor) {
      await releaseReqTxnId(txnId);
    }
    // A reached-Valor failure is treated like a timeout (504, "check terminal")
    // rather than a fresh 500: the capture status is unknown and staff must
    // verify before retrying — the claim is intentionally kept above.
    const reachedValor = isTimeout || fetchReachedValor;
    return errorResponse(
      res,
      reachedValor ? 504 : 500,
      reachedValor ? "Valor request unresolved — check terminal before retrying" : "Internal error",
      error,
    );
  }
}
