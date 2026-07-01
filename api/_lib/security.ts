import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Shared security helpers for Vercel API routes.
 * — In-memory rate limiting (per serverless instance, best-effort)
 * — Durable Firestore-backed rate limiting (authoritative, for money routes)
 * — Origin validation (basic CSRF protection)
 * — Input validation helpers
 */

// ── Rate limiting ────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const GC_THRESHOLD = 10_000;

function getClientKey(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = typeof fwd === "string" ? fwd.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
  return ip;
}

/**
 * Returns true if the request is within rate limits.
 *
 * NON-AUTHORITATIVE: backed by a module-level in-memory Map that is scoped to a
 * single serverless instance. Under Vercel's autoscaling each concurrent
 * instance keeps its own counter, so a determined caller spread across instances
 * can exceed `limit`. This is a cheap best-effort first line of defence only.
 * For money routes (anything that can move funds or mint orders) ALSO gate on
 * the durable, cross-instance {@link rateLimitDurable} below.
 *
 * limit = max requests per windowMs milliseconds.
 */
export function rateLimit(req: VercelRequest, limit: number, windowMs: number): boolean {
  const key = `${getClientKey(req)}:${req.url}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count++;
    if (bucket.count > limit) return false;
  }

  // Opportunistic GC
  if (buckets.size > GC_THRESHOLD) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }

  return true;
}

/**
 * Durable, cross-instance rate limit backed by Firestore. Use this on money
 * routes where the per-instance {@link rateLimit} Map is insufficient because
 * Vercel runs many concurrent instances that don't share memory.
 *
 * Keyed by ip+route and a fixed time window. Each request atomically increments
 * a counter inside a transaction; if the stored window has expired the counter
 * is reset. Returns true if the request is allowed.
 *
 * Fails OPEN: if Firestore is unreachable we return true so a transient storage
 * outage doesn't take checkout offline. The in-memory `rateLimit` still applies
 * as a backstop, and Valor itself is the final authority on charges.
 */
export async function rateLimitDurable(
  req: VercelRequest,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  // Lazy import so routes that never call this don't pull in firebase-admin
  // (and so this module stays usable in contexts without admin creds).
  let adminDb: import("firebase-admin/firestore").Firestore;
  try {
    ({ adminDb } = await import("./firebase-admin.js"));
  } catch (err) {
    console.error("[rateLimitDurable] firebase-admin unavailable, failing open", err);
    return true;
  }

  const route = (req.url || "unknown").split("?")[0];
  // Sanitize ip+route into a safe Firestore doc id.
  const docId = `${getClientKey(req)}:${route}`.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 256);
  const ref = adminDb.collection("rate_limits").doc(docId);
  const now = Date.now();

  try {
    const allowed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : {};
      const resetAt = typeof data.resetAt === "number" ? data.resetAt : 0;

      if (!snap.exists || resetAt < now) {
        tx.set(ref, { count: 1, resetAt: now + windowMs });
        return true;
      }

      const count = typeof data.count === "number" ? data.count : 0;
      if (count >= limit) return false;

      tx.update(ref, { count: count + 1 });
      return true;
    });
    return allowed;
  } catch (err) {
    console.error("[rateLimitDurable] transaction failed, failing open", err);
    return true;
  }
}

// ── Origin validation ────────────────────────────────────────────────────

const ALLOWED_ORIGIN_HOSTS = ["fentongyro.com", "vercel.app", "localhost"];

export function isAllowedOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return false;
  try {
    const url = new URL(origin as string);
    return ALLOWED_ORIGIN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// ── CORS + preflight ─────────────────────────────────────────────────────

export function setCors(res: VercelResponse, origin: string | undefined) {
  // Echo allowed origin (not *) for better security
  if (origin) {
    try {
      const url = new URL(origin);
      if (ALLOWED_ORIGIN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } catch { /* noop */ }
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

// ── Input validation ─────────────────────────────────────────────────────

export function isString(v: unknown, maxLen = 256): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

export function isEpi(v: unknown): v is string {
  return typeof v === "string" && /^\d{10}$/.test(v);
}

export function isAppKey(v: unknown): v is string {
  return typeof v === "string" && v.length >= 16 && v.length <= 64;
}

export function isAmount(v: unknown): v is string {
  return typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v) && parseFloat(v) > 0 && parseFloat(v) <= 10000;
}

export function isCentsAmount(v: unknown): v is string {
  return typeof v === "string" && /^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) <= 1_000_000;
}

export function isReqTxnId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Z0-9]{5,25}$/.test(v);
}

/**
 * Generic error response — does not leak internal details.
 */
export function errorResponse(res: VercelResponse, status: number, publicMessage: string, internalError?: unknown) {
  if (internalError) console.error(`[API error ${status}]`, internalError);
  return res.status(status).json({ error: publicMessage });
}
