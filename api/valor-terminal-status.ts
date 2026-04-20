import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/valor-terminal-status
 *
 * Polls the status of a previously published Valor Connect transaction.
 * Frontend calls this repeatedly until the transaction completes.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!VALOR_API_URL || !VALOR_APPID) {
    return res.status(500).json({ error: "Valor not configured." });
  }

  try {
    const { epi, appkey, reqTxnId } = req.body;

    if (!epi || !appkey || !reqTxnId) {
      return res.status(400).json({ error: "epi, appkey, and reqTxnId are required" });
    }

    const body = {
      appid: VALOR_APPID,
      appkey,
      epi,
      txn_type: "vc_status",
      req_txn_id: reqTxnId,
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

    return res.status(200).json({ response: data });
  } catch (error: any) {
    console.error("valor-terminal-status error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
