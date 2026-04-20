import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/valor-terminal-publish
 *
 * Sends a transaction to a Valor terminal via Valor Connect Wrapper API.
 * This is the cloud path — works from Vercel (HTTPS) without direct
 * WebSocket to the terminal.
 *
 * Request body: { epi, appkey, payload }
 * Secrets (VALOR_APPID, VALOR_CHANNEL_ID, VALOR_API_URL) come from env.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;
const VALOR_CHANNEL_ID = process.env.VALOR_CHANNEL_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!VALOR_API_URL || !VALOR_APPID || !VALOR_CHANNEL_ID) {
    return res.status(500).json({
      error: "Valor Connect not configured. Set VALOR_API_URL, VALOR_APPID, VALOR_CHANNEL_ID.",
    });
  }

  try {
    const { epi, appkey, payload, reqTxnId } = req.body;

    if (!epi || !appkey || !payload) {
      return res.status(400).json({ error: "epi, appkey, and payload are required" });
    }

    const txnId = reqTxnId || `TXN${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    const body = {
      appid: VALOR_APPID,
      appkey,
      epi,
      channel_id: VALOR_CHANNEL_ID,
      txn_type: "vc_publish",
      req_txn_id: txnId,
      version: "2",
      payload,
    };

    const valorResponse = await fetch(VALOR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await valorResponse.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (data.error_no && data.error_no !== "S00") {
      return res.status(502).json({
        error: data.msg || data.mesg || "Valor publish failed",
        code: data.error_no,
        details: data,
      });
    }

    return res.status(200).json({ reqTxnId: txnId, response: data });
  } catch (error: any) {
    console.error("valor-terminal-publish error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
