import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { rateLimit, isAllowedOrigin, setCors, errorResponse } from "./_lib/security.js";
import { adminDb } from "./_lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/valor-void
 *
 * Voids a Valor ePage sale when a customer cancels within the cancellation
 * window on the order tracking page.
 *
 * SECURITY: the browser does NOT drive the void. The client only supplies the
 * orderId (and, optionally, rrn/auth_code which we treat as an assertion to
 * cross-check, never as the source of truth). The server:
 *   1. Loads the order from Firestore (Admin SDK).
 *   2. Confirms the order is genuinely cancellable — payment captured, status
 *      still 'pending' (chef hasn't accepted), and within the cancel window.
 *   3. Confirms any client-supplied rrn/auth_code MATCH what's stored on the
 *      order doc — a hostile client cannot void some other charge by passing
 *      arbitrary refs.
 *   4. Uses the STORED rrn/auth_code/amount for the actual Valor void call.
 *   5. On success, atomically (runTransaction) flips payment_status:'voided'
 *      and status:'cancelled', idempotently (no-op if already voided).
 *
 * Optionally an operator/automation may bypass the window/status checks by
 * presenting a server secret in `X-Void-Secret` (or `Authorization`) compared
 * with timingSafeEqual against process.env.VOID_SECRET. Ownership of the order
 * doc (matching refs) is still required.
 */

const VALOR_API_URL = process.env.VALOR_API_URL;
const VALOR_APPID = process.env.VALOR_APPID;

// Must mirror CANCEL_WINDOW_SECONDS on the /track page. Customers can only
// self-cancel while the order is still 'pending' AND within this window after
// creation. A small grace margin absorbs clock skew between client and server.
const CANCEL_WINDOW_SECONDS = 15;
const CANCEL_WINDOW_GRACE_SECONDS = 10;

// Optional shared secret for privileged/operator voids. When present, a caller
// who proves knowledge of it may void even outside the normal customer window.
// Absent => only the customer self-cancel path is available. Never hardcoded.
const VOID_SECRET = process.env.VOID_SECRET;

// Constant-time comparison so an attacker can't recover the secret byte-by-byte
// from response latency.
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hasValidVoidSecret(req: VercelRequest): boolean {
  if (!VOID_SECRET) return false;
  const headerVal = req.headers["x-void-secret"];
  let provided = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!provided) {
    const auth = req.headers["authorization"];
    const authVal = Array.isArray(auth) ? auth[0] : auth;
    if (typeof authVal === "string") {
      provided = authVal.startsWith("Bearer ") ? authVal.slice(7) : authVal;
    }
  }
  return typeof provided === "string" && provided.length > 0 && secretsMatch(provided, VOID_SECRET);
}

function toCreatedAtMillis(value: unknown): number | null {
  if (value == null) return null;
  // Firestore Admin Timestamp
  if (typeof value === "object" && value !== null && typeof (value as any).toMillis === "function") {
    try {
      return (value as any).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number") return value;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return errorResponse(res, 405, "Method not allowed");

  const privileged = hasValidVoidSecret(req);

  // A privileged operator may call from automation without a browser Origin.
  // Customer self-cancel still requires a same-site Origin + rate limit.
  if (!privileged) {
    if (!isAllowedOrigin(req)) return errorResponse(res, 403, "Forbidden origin");
    if (!rateLimit(req, 10, 60_000)) return errorResponse(res, 429, "Too many requests");
  }

  const appKey = process.env.VALOR_EPAGE_APPKEY || process.env.VALOR_APPKEY;
  const epi = process.env.VALOR_EPAGE_EPI || process.env.VALOR_EPI;
  if (!VALOR_API_URL || !VALOR_APPID || !appKey || !epi) {
    return errorResponse(res, 500, "Valor not configured");
  }

  const { orderId, rrn: clientRrn, authCode: clientAuthCode } = req.body || {};
  if (typeof orderId !== "string" || orderId.length < 4 || orderId.length > 64) {
    return errorResponse(res, 400, "Invalid orderId");
  }
  // Client-supplied refs are OPTIONAL assertions only. We never use them to
  // drive the void — but if present they must match the stored values.
  if (clientRrn !== undefined && (typeof clientRrn !== "string" || clientRrn.length > 32)) {
    return errorResponse(res, 400, "Invalid rrn");
  }
  if (clientAuthCode !== undefined && (typeof clientAuthCode !== "string" || clientAuthCode.length > 32)) {
    return errorResponse(res, 400, "Invalid auth_code");
  }

  const orderRef = adminDb.collection("orders").doc(orderId);

  // ── Authorize against the authoritative order doc ──────────────────────
  let snap;
  try {
    snap = await orderRef.get();
  } catch (err) {
    return errorResponse(res, 500, "Internal error", err);
  }
  if (!snap.exists) {
    return errorResponse(res, 404, "Order not found");
  }
  const order = snap.data() || {};

  // Idempotency: already voided -> success no-op, no second Valor call.
  if (order.payment_status === "voided") {
    return res.status(200).json({ ok: true, alreadyVoided: true, orderId });
  }

  const storedRrn: string | undefined =
    typeof order.rrn === "string" ? order.rrn : undefined;
  const storedAuthCode: string | undefined =
    typeof order.auth_code === "string" ? order.auth_code : undefined;
  const storedAmount: number | undefined =
    typeof order.total === "number" ? order.total : undefined;

  // The order must actually have a captured payment to void.
  if (order.payment_status !== "paid") {
    return errorResponse(res, 409, "Order has no captured payment to void");
  }
  if (!storedRrn && !storedAuthCode) {
    return errorResponse(res, 409, "Order has no Valor reference to void");
  }

  // Cross-check any client-supplied refs against the stored values. A
  // mismatch means the caller is trying to void something they don't own.
  if (clientRrn !== undefined && storedRrn !== undefined && clientRrn !== storedRrn) {
    return errorResponse(res, 403, "Reference mismatch");
  }
  if (clientAuthCode !== undefined && storedAuthCode !== undefined && clientAuthCode !== storedAuthCode) {
    return errorResponse(res, 403, "Reference mismatch");
  }

  // Window + status gate (skipped only for a verified privileged operator).
  if (!privileged) {
    if (order.status !== "pending") {
      return errorResponse(res, 409, "Order is no longer cancellable");
    }
    const createdMs = toCreatedAtMillis(order.created_at);
    if (createdMs == null) {
      return errorResponse(res, 409, "Order is no longer cancellable");
    }
    const deadline =
      createdMs + (CANCEL_WINDOW_SECONDS + CANCEL_WINDOW_GRACE_SECONDS) * 1000;
    if (Date.now() > deadline) {
      return errorResponse(res, 409, "Cancellation window has closed");
    }
  }

  // ── Perform the Valor void using STORED refs (never client values) ─────
  try {
    const form = new URLSearchParams();
    form.append("appid", VALOR_APPID);
    form.append("appkey", appKey);
    form.append("epi", epi);
    form.append("txn_type", "void");
    form.append("invoice_no", orderId);
    if (storedRrn) form.append("rrn", storedRrn);
    if (storedAuthCode) form.append("auth_code", storedAuthCode);
    if (storedAmount !== undefined) form.append("amount", storedAmount.toFixed(2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let valorResponse: Response;
    try {
      valorResponse = await fetch(VALOR_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await valorResponse.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log("[valor-void] response", { orderId, status: valorResponse.status, data });

    const approved = data.error_no === "S00" || data.status === "approved";
    if (!approved) {
      return res.status(502).json({
        ok: false,
        code: data.error_no || "UNKNOWN",
        message: data.msg || data.mesg || "Valor void failed",
      });
    }

    // ── Authoritative server-side Firestore sync (idempotent) ────────────
    // Mirror the webhook/confirm-payment runTransaction pattern: flip
    // payment_status:'voided' + status:'cancelled' atomically so the server
    // is the source of truth and a concurrent retry is a no-op.
    let cancelled = false;
    try {
      await adminDb.runTransaction(async (tx) => {
        const txSnap = await tx.get(orderRef);
        if (!txSnap.exists) return;
        const txData = txSnap.data() || {};
        if (txData.payment_status === "voided") return; // idempotent

        const update: Record<string, unknown> = {
          payment_status: "voided",
          voided_at: FieldValue.serverTimestamp(),
          status: "cancelled",
        };
        if (storedRrn) update.void_rrn = storedRrn;

        tx.update(orderRef, update);
      });
      cancelled = true;
    } catch (err) {
      // The charge IS voided at Valor but the Firestore sync failed — the order
      // still shows payment_status:'paid' / active, so the kitchen could make a
      // meal for a refunded order. Write a DURABLE reconciliation record (and
      // log loudly) so finance can fix it, and report cancelled:false so the
      // client does NOT tell the customer it's fully cancelled.
      console.error("[valor-void] VOID_SYNC_FAILED firestore sync failed after successful void", { orderId, err });
      try {
        await adminDb.collection("orphan_payments").add({
          orderId,
          kind: "void_sync_failed",
          rrn: storedRrn || null,
          auth_code: storedAuthCode || null,
          voided_at_valor: true,
          created_at: FieldValue.serverTimestamp(),
        });
      } catch (recErr) {
        console.error("[valor-void] failed to record void_sync_failed orphan", { orderId, recErr });
      }
    }

    return res.status(200).json({ ok: true, voided: true, cancelled, orderId, data });
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
