import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/valor-webhook
 *
 * Valor ePage / transaction callbacks.
 *
 * Auth (Valor HMAC — preferred once enabled in portal):
 *   Headers: Valor-Timestamp + Valor-Signature
 *   Signature = HMAC-SHA256(JSON.stringify(body) + timestamp, WEBHOOK_SECRET)
 *   Secret comes from Settings → Webhook Configuration (paste into Vercel WEBHOOK_SECRET).
 *
 * Defense in depth: even with a valid signature, claimed approvals are
 * re-checked via Valor transaction_inquiry before flipping payment_status.
 *
 * @see https://valorapi.readme.io/reference/webhook-user-guide
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;
/** Secret key from Valor Settings → Webhook Configuration (Authentication). */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.VALOR_WEBHOOK_SECRET;

const MAX_TIMESTAMP_SKEW_MS = 10 * 60 * 1000; // 10 minutes

// Strip "-NNNNNN" 6-digit timestamp suffix that create-valor-checkout.ts
// appends to invoice_no. Firestore order id is everything before that suffix.
function stripInvoiceSuffix(raw: string): string {
  if (/-[0-9]{6}$/.test(raw)) {
    return raw.slice(0, raw.lastIndexOf("-"));
  }
  return raw;
}

function maskError(message: unknown): string {
  if (typeof message !== "string") return "Internal error";
  return message.length > 200 ? "Internal error" : message;
}

function headerValue(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

/**
 * Verify Valor-Signature / Valor-Timestamp per Valor Webhook User Guide.
 * Returns false if secret is configured but signature is missing/invalid.
 * Returns true if secret is not yet configured (portal not set up) — inquiry
 * verification still protects paid flips.
 */
function verifyValorHmac(req: VercelRequest, body: unknown): { ok: boolean; reason?: string } {
  if (!WEBHOOK_SECRET) {
    return { ok: true, reason: "secret_not_configured" };
  }

  const timestamp = headerValue(req, "valor-timestamp");
  const signature = headerValue(req, "valor-signature");
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_signature_headers" };
  }

  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: "timestamp_skew" };
  }

  // Valor: HMAC-SHA256(json_encode(payload) + timestamp, secret)
  // Node JSON.stringify is compact (matches their PHP json_encode default).
  const payload = JSON.stringify(body) + timestamp;
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "signature_mismatch" };
    }
  } catch {
    return { ok: false, reason: "signature_compare_error" };
  }

  return { ok: true };
}

function isApprovedStatus(status: unknown): boolean {
  const s = String(status ?? "");
  return (
    s === "approved" ||
    s === "APPROVED" ||
    s === "0" ||
    s === "success" ||
    s === "SUCCESS" ||
    s === "S00"
  );
}

async function verifyWithValor(opts: {
  invoiceNo: string;
  rrn?: string;
}): Promise<{
  approved: boolean;
  rrn?: string;
  authCode?: string;
  maskedPan?: string;
}> {
  const appKey = process.env.VALOR_EPAGE_APPKEY || process.env.VALOR_APPKEY;
  const epi = process.env.VALOR_EPAGE_EPI || process.env.VALOR_EPI;
  if (!VALOR_API_URL || !VALOR_APPID || !appKey || !epi) {
    throw new Error("Valor not configured");
  }

  const form = new URLSearchParams();
  form.append("appid", VALOR_APPID);
  form.append("appkey", appKey);
  form.append("epi", epi);
  form.append("txn_type", "transaction_inquiry");
  form.append("invoice_no", opts.invoiceNo);
  if (opts.rrn) form.append("rrn", opts.rrn);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8_000);
  try {
    const r = await fetch(VALOR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    const text = await r.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const approved =
      data.error_no === "S00" ||
      isApprovedStatus(data.status) ||
      isApprovedStatus(data.txn_status) ||
      isApprovedStatus(data.state);

    return {
      approved,
      rrn: (data.rrn as string) || opts.rrn,
      authCode: (data.auth_code as string) || (data.code as string),
      maskedPan: (data.masked_pan as string) || (data.card_last4 as string),
    };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Valor-Timestamp, Valor-Signature",
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const hmac = verifyValorHmac(req, body);
    if (!hmac.ok) {
      console.warn("[valor-webhook] HMAC rejected", { reason: hmac.reason });
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (hmac.reason === "secret_not_configured") {
      console.warn(
        "[valor-webhook] WEBHOOK_SECRET not set — relying on Valor inquiry only. " +
          "Paste Valor Webhook Authentication secret into Vercel WEBHOOK_SECRET when available.",
      );
    }

    const rawInvoice: string | undefined =
      body.invoice_no || body.orderId || body.invoiceNumber || body.invoice;
    const status: string | undefined = body.status || body.state || body.txn_status;
    const rrn: string | undefined = body.rrn;
    const claimedApproved = isApprovedStatus(status) || body.approved === true;

    if (!rawInvoice || typeof rawInvoice !== "string") {
      return res.status(400).json({ error: "Missing invoice_no / orderId" });
    }

    const orderId = stripInvoiceSuffix(rawInvoice);
    const invoiceForInquiry = rawInvoice; // keep suffix for Valor lookup

    console.log("[valor-webhook]", {
      orderId,
      invoice: invoiceForInquiry,
      claimedApproved,
      status: status || null,
      rrn: rrn || null,
    });

    const orderRef = adminDb.collection("orders").doc(orderId);

    // Declines / non-approvals: record metadata only. Never flip to paid.
    if (!claimedApproved) {
      try {
        const snap = await orderRef.get();
        if (snap.exists) {
          const data = snap.data() || {};
          if (data.payment_status !== "paid") {
            await orderRef.update({
              payment_failed_at: FieldValue.serverTimestamp(),
              decline_reason: body.msg || body.mesg || status || "declined",
            });
          }
        }
      } catch (innerErr) {
        console.error(
          "[valor-webhook] decline write failed",
          maskError((innerErr as Error)?.message),
        );
      }
      return res.status(200).json({ received: true, approved: false, orderId });
    }

    // Claimed approval → must verify with Valor before any Firestore flip.
    let verified: Awaited<ReturnType<typeof verifyWithValor>>;
    try {
      verified = await verifyWithValor({
        invoiceNo: invoiceForInquiry,
        rrn,
      });
      // If inquiry with full invoice failed and we had a suffix, retry stripped.
      if (!verified.approved && invoiceForInquiry !== orderId) {
        verified = await verifyWithValor({ invoiceNo: orderId, rrn });
      }
    } catch (err) {
      console.error("[valor-webhook] Valor verify failed", err);
      // 502 so Valor may retry; do not mark paid.
      return res.status(502).json({ error: "Could not verify with Valor" });
    }

    if (!verified.approved) {
      console.warn("[valor-webhook] claimed approved but Valor inquiry not approved", {
        orderId,
        invoice: invoiceForInquiry,
      });
      return res.status(200).json({
        received: true,
        approved: false,
        verified: false,
        orderId,
      });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { ok: false as const, reason: "not_found" as const };
      }
      const data = snap.data() || {};
      if (data.payment_status === "paid") {
        return { ok: true as const, already: true as const };
      }

      const update: Record<string, unknown> = {
        payment_status: "paid",
        paid_at: FieldValue.serverTimestamp(),
        paid_via: "webhook_verified",
      };
      if (verified.rrn) update.rrn = verified.rrn;
      if (verified.authCode) update.auth_code = verified.authCode;
      if (verified.maskedPan) update.masked_pan = verified.maskedPan;
      if (data.status === "pending") {
        update.status = "received";
      }
      tx.update(orderRef, update);
      return { ok: true as const, already: false as const };
    });

    if (!result.ok) {
      console.warn("[valor-webhook] order not found", { orderId });
      return res
        .status(200)
        .json({ received: true, approved: true, orderId, not_found: true });
    }

    if (result.already) {
      return res
        .status(200)
        .json({ received: true, already: true, approved: true, orderId });
    }

    return res.status(200).json({ received: true, approved: true, verified: true, orderId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[valor-webhook] error:", msg);
    return res.status(500).json({ error: maskError(msg) });
  }
}
