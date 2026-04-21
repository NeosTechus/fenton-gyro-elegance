import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";

/**
 * POST /api/create-valor-checkout
 *
 * Creates a Valor ePage hosted checkout session for online ordering.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
  if (!rateLimit(req, 10, 60_000)) return errorResponse(res, 429, "Too many requests");

  // Validate config
  if (!VALOR_API_URL) {
    return res.status(500).json({
      error: "VALOR_API_URL not configured. Set it in Vercel env vars.",
    });
  }

  // Validate secrets. VALOR_EPAGE_EPI is the Virtual Terminal / ePage EPI
  // for website orders; distinct from VALOR_EPI which is the physical
  // terminal EPI used by POS/Kiosk. Falls back to VALOR_EPI so older
  // single-EPI deployments keep working.
  const appId = process.env.VALOR_APPID;
  const appKey = process.env.VALOR_EPAGE_APPKEY || process.env.VALOR_APPKEY;
  const epi = process.env.VALOR_EPAGE_EPI || process.env.VALOR_EPI;

  if (!appId || !appKey || !epi) {
    return res.status(500).json({
      error: "Valor credentials not configured. Set VALOR_APPID, VALOR_EPAGE_APPKEY, VALOR_EPAGE_EPI in Vercel env vars.",
    });
  }

  try {
    const {
      amount,
      tax,
      phone,
      email,
      customerName,
      invoiceNumber,
      productDescription,
      redirectUrl,
    } = req.body;

    if (!amount || !redirectUrl) {
      return res.status(400).json({ error: "amount and redirectUrl are required" });
    }

    // Validate amount format (must be a positive number with up to 2 decimal places)
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0 || parseFloat(amount) > 10000) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Validate redirectUrl is from our domain
    try {
      const url = new URL(redirectUrl);
      if (!url.hostname.includes("fentongyro") && !url.hostname.includes("vercel.app") && !url.hostname.includes("localhost")) {
        return res.status(400).json({ error: "Invalid redirect URL" });
      }
    } catch {
      return res.status(400).json({ error: "Invalid redirect URL" });
    }

    // Sanitize text inputs
    const sanitize = (str: string | undefined) => str ? str.replace(/[<>]/g, "").slice(0, 200) : "";

    const orderId = `WEB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build ePage request — matches Valor SDK epage_api_v2.php exactly
    const formParams = new URLSearchParams();
    formParams.append("appid", appId);
    formParams.append("appkey", appKey);
    formParams.append("txn_type", "sale");
    formParams.append("amount", amount);
    formParams.append("tax", tax || "0.00");
    formParams.append("surcharge", "0.00");
    formParams.append("epi", epi);
    formParams.append("epage", "1");
    formParams.append("redirect_url", `${redirectUrl}?orderId=${orderId}`);
    if (phone) formParams.append("phone", phone);
    // Don't send email — prevents Valor from sending invoice email
    // Customer gets redirected directly to payment page instead
    // Append a short timestamp suffix so every attempt is unique on Valor's
    // side — prevents E22 EPAGE URL GENERATION FAILED when a customer
    // retries checkout while a previous session is still open.
    const baseInvoice = sanitize(invoiceNumber) || orderId;
    const uniqueInvoice = `${baseInvoice}-${Date.now().toString().slice(-6)}`;
    formParams.append("invoice_no", uniqueInvoice);
    formParams.append("product", sanitize(productDescription) || "Order");
    formParams.append("descriptor", "Fenton Gyro");
    formParams.append("customer_name", sanitize(customerName));

    // Debug — masked to avoid leaking full key in logs
    const mask = (s: string) => s.length <= 6 ? "***" : `${s.slice(0, 3)}…${s.slice(-3)} (len=${s.length})`;
    console.log("[epage] sending:", {
      url: VALOR_API_URL,
      appid: mask(appId),
      appkey: mask(appKey),
      epi,
      amount,
    });

    const valorResponse = await fetch(VALOR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formParams.toString(),
    });

    const responseText = await valorResponse.text();
    console.log("Valor ePage response:", valorResponse.status, responseText);

    // Parse response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { url: responseText.trim() };
    }

    // Check for Valor error (error_no !== "S00")
    if (data.error_no && data.error_no !== "S00") {
      return res.status(502).json({
        error: data.msg || data.mesg || "Valor request failed",
        code: data.error_no,
        details: data,
      });
    }

    // Extract checkout URL
    const checkoutUrl =
      data.url ||
      data.epage_url ||
      data.redirect_url ||
      data.hosted_url ||
      data.payment_url;

    if (!checkoutUrl) {
      return res.status(502).json({
        error: "Valor did not return a checkout URL",
        details: data,
      });
    }

    return res.status(200).json({ url: checkoutUrl, orderId });
  } catch (error: any) {
    console.error("createValorCheckout error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
