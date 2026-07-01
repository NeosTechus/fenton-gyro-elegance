import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";
import { adminDb } from "./_lib/firebase-admin.js";
import { cardBreakdownFromTotal } from "./_lib/pricing.js";

// Strip "-NNNNNN" 6-digit timestamp suffix that we append to invoice_no below
// to keep each Valor session unique. The real Firestore order id is everything
// before that suffix. (Mirrors stripInvoiceSuffix in valor-webhook.ts.)
function stripInvoiceSuffix(raw: string): string {
  if (/-[0-9]{6}$/.test(raw)) {
    return raw.slice(0, raw.lastIndexOf("-"));
  }
  return raw;
}

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
      surcharge,
      phone,
      email,
      customerName,
      invoiceNumber,
      productDescription,
      redirectUrl,
    } = req.body;

    if (!redirectUrl) {
      return res.status(400).json({ error: "redirectUrl is required" });
    }

    // invoiceNumber IS the Firestore order id — required so we can load the
    // order and recompute the charge server-side. The browser is never trusted
    // to dictate the amount.
    if (typeof invoiceNumber !== "string" || invoiceNumber.length < 4 || invoiceNumber.length > 64) {
      return res.status(400).json({ error: "invoiceNumber (orderId) is required" });
    }

    // ── Server-authoritative amount ──────────────────────────────────────
    // Load the stored order and recompute the exact card breakdown from its
    // persisted total. We send ONLY these server-derived money values to
    // Valor; any amount/tax/surcharge the browser supplied is advisory and is
    // rejected if it disagrees by more than a cent.
    const orderId = stripInvoiceSuffix(invoiceNumber);
    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderData = orderSnap.data() || {};

    // Never start a fresh hosted-payment session for an order that is already
    // settled. The browser's stale "already submitted this cart" guard
    // (sessionStorage) can resolve a repeat identical order to a PAID order id;
    // without this the customer would be charged a second time against one paid
    // order doc. Reject paid/voided/cancelled orders so a genuine reorder is
    // forced to create a new order.
    if (
      orderData.payment_status === "paid" ||
      orderData.payment_status === "voided" ||
      orderData.status === "cancelled"
    ) {
      return res.status(409).json({ error: "Order is already completed" });
    }
    const storedTotal = typeof orderData.total === "number" ? orderData.total : NaN;

    const breakdown = cardBreakdownFromTotal(storedTotal);
    if (!breakdown) {
      console.error("[epage] could not derive card breakdown from order total", {
        orderId,
        storedTotal: orderData.total,
      });
      return res.status(400).json({ error: "Order total is invalid for card checkout" });
    }

    // Valor ePage is sent the PRE-surcharge amount (= subtotal) plus tax and
    // surcharge as separate fields; it re-applies the surcharge itself via
    // surchargeIndicator=1. These are the values the customer is actually
    // charged — derived from the stored order, not the request body.
    const serverAmount = breakdown.subtotal.toFixed(2);
    const serverTax = breakdown.tax.toFixed(2);
    const serverSurcharge = breakdown.surcharge.toFixed(2);

    // If the browser supplied money values, reject when they disagree by more
    // than a cent — a sign of tampering or a stale client. We still only ever
    // send the server-derived figures to Valor.
    const within1Cent = (a: unknown, b: number) => {
      const n = parseFloat(String(a));
      return Number.isFinite(n) && Math.abs(n - b) <= 0.01;
    };
    if (amount !== undefined && !within1Cent(amount, breakdown.subtotal)) {
      return res.status(400).json({ error: "Amount mismatch" });
    }
    if (tax !== undefined && !within1Cent(tax, breakdown.tax)) {
      return res.status(400).json({ error: "Tax mismatch" });
    }
    if (surcharge !== undefined && !within1Cent(surcharge, breakdown.surcharge)) {
      return res.status(400).json({ error: "Surcharge mismatch" });
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

    // Build ePage request — matches Valor SDK epage_api_v2.php exactly
    const formParams = new URLSearchParams();
    formParams.append("appid", appId);
    formParams.append("appkey", appKey);
    formParams.append("txn_type", "sale");
    // Server-recomputed values only — never the client-supplied amount.
    formParams.append("amount", serverAmount);
    formParams.append("tax", serverTax);
    // Explicit surcharge amount — Valor ePage won't compute this even with
    // surchargeIndicator=1. We send the exact server-derived $ value so the
    // total on the hosted page matches what the customer agreed to.
    formParams.append("surcharge", serverSurcharge);
    // Required by Valor — "EPI host processor info not found" is returned when
    // the merchant is configured for surcharging but this flag is omitted.
    // https://valorapi.readme.io/reference/troubleshooting
    formParams.append("surchargeIndicator", "1");
    formParams.append("epi", epi);
    formParams.append("epage", "1");
    // Caller is responsible for embedding the real order ID in redirectUrl
    // (e.g. /track/<firestoreId>) so Valor preserves it after payment.
    formParams.append("redirect_url", redirectUrl);
    if (phone) formParams.append("phone", phone);
    // Don't send email — prevents Valor from sending invoice email
    // Customer gets redirected directly to payment page instead
    // Append a short timestamp suffix so every attempt is unique on Valor's
    // side — prevents E22 EPAGE URL GENERATION FAILED when a customer
    // retries checkout while a previous session is still open.
    const baseInvoice = sanitize(orderId);
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
      amount: serverAmount,
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
