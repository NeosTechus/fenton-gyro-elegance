import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Shared security helpers for Vercel API routes.
 * — Simple in-memory rate limiting (per serverless instance)
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
