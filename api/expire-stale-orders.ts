import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "./_lib/firebase-admin.js";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/expire-stale-orders  (Vercel Cron — see vercel.json "crons")
 *
 * Web checkout creates an order with payment_status:"unpaid" / status:"pending"
 * BEFORE redirecting the customer to Valor's hosted ePage. If the customer
 * abandons checkout (closes the tab, fails payment, never returns) that order
 * is left dangling unpaid forever, cluttering the kitchen display and order
 * history.
 *
 * This cron sweeps such orphans: it finds web orders that are still unpaid and
 * older than ORPHAN_TTL_MS and marks them status:"expired". We MARK rather than
 * DELETE so that a genuinely-late payment (slow webhook, customer who paid and
 * walked away) can still be reconciled — the Valor webhook / confirm endpoint
 * only flip status pending->received, so an expired doc stays distinguishable
 * and its payment_status is untouched here.
 *
 * Endpoint protection: Vercel attaches an Authorization: Bearer <CRON_SECRET>
 * header to cron invocations when CRON_SECRET is set in the project env. We
 * require it so the endpoint can't be triggered by the public internet.
 */

const ORPHAN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BATCH = 400; // stay under Firestore's 500-write batch limit

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorizedCron(req: VercelRequest): boolean {
  if (!CRON_SECRET) return false;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  return header === `Bearer ${CRON_SECRET}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Refuse if the secret isn't configured (fail closed) or the caller can't
  // present it. This is an internal maintenance endpoint, never public.
  if (!CRON_SECRET) {
    console.error("[expire-stale-orders] refused: CRON_SECRET env var not set");
    return res.status(503).json({ error: "Cron not configured" });
  }
  if (!isAuthorizedCron(req)) {
    console.warn("[expire-stale-orders] rejected — missing/invalid cron auth");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const cutoff = Timestamp.fromMillis(Date.now() - ORPHAN_TTL_MS);

  try {
    // Web orders left unpaid past the TTL. Equality filters on payment_status
    // and source plus a range filter on created_at — a single-field range is
    // fine alongside equality filters (composite index may be required; see
    // humanActionsRequired).
    const snap = await adminDb
      .collection("orders")
      .where("payment_status", "==", "unpaid")
      .where("source", "==", "web")
      .where("created_at", "<", cutoff)
      .limit(MAX_BATCH)
      .get();

    if (snap.empty) {
      return res.status(200).json({ ok: true, expired: 0 });
    }

    const batch = adminDb.batch();
    let expired = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      // Defensive: never expire something that has since been paid, and don't
      // re-stamp orders already expired.
      if (data.payment_status === "paid" || data.status === "expired") continue;
      // Skip orders that already carry a Valor reference — a payment has landed
      // or is mid-settlement, so this isn't an abandoned orphan. Belt-and-braces
      // with the un-expire on the paid path (webhook / confirm-payment).
      if (data.rrn || data.auth_code) continue;
      batch.update(docSnap.ref, {
        status: "expired",
        expired_at: Timestamp.now(),
      });
      expired++;
    }

    if (expired > 0) await batch.commit();

    console.log("[expire-stale-orders] swept", { scanned: snap.size, expired });
    return res.status(200).json({ ok: true, expired, scanned: snap.size });
  } catch (err) {
    console.error("[expire-stale-orders] failed", err);
    return res.status(500).json({ ok: false, error: "Sweep failed" });
  }
}
