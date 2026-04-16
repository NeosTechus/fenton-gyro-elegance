import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/valor-webhook
 *
 * Receives payment result callbacks from Valor after ePage checkout completes.
 * Register this URL in the Valor portal as your webhook/callback URL.
 */

// Simple shared secret for webhook verification
// Set WEBHOOK_SECRET in Vercel env vars
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

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

  // Verify webhook authenticity if secret is configured
  if (WEBHOOK_SECRET) {
    const providedSecret = req.headers["x-webhook-secret"];
    if (providedSecret !== WEBHOOK_SECRET) {
      console.warn("Webhook rejected — invalid secret");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    console.log("Valor webhook received:", JSON.stringify(body));

    const orderId = body.orderId || body.invoice_no;
    const status = body.status || body.state;
    const rrn = body.rrn;
    const authCode = body.auth_code || body.code;
    const maskedPan = body.card_last4 || body.masked_pan;

    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const isApproved =
      status === "approved" ||
      status === "0" ||
      status === "success" ||
      status === "APPROVED";

    console.log("Payment result:", {
      orderId,
      approved: isApproved,
      rrn,
      authCode,
      maskedPan,
    });

    return res.status(200).json({ received: true, approved: isApproved });
  } catch (error: any) {
    console.error("valorWebhook error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
