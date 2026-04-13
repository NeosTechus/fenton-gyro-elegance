import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/valor-webhook
 *
 * Receives payment result callbacks from Valor after ePage checkout completes.
 * Register this URL in the Valor portal as your webhook/callback URL.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;
    console.log("Valor webhook received:", JSON.stringify(body));

    const orderId = body.orderId || body.invoice_no;
    const status = body.status || body.state;
    const rrn = body.rrn;
    const authCode = body.auth_code || body.code;
    const maskedPan = body.card_last4 || body.masked_pan;

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

    // TODO: If using Firestore, update the order document here.
    // For now, we just acknowledge receipt. The /order-success page
    // handles the UI confirmation on the frontend.

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("valorWebhook error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
