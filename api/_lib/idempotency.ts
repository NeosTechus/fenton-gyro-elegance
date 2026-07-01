import { adminDb } from "./firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Server-side idempotency for Valor terminal publishes.
 *
 * A logical sale carries one stable reqTxnId (minted once at sale start on the
 * client, reused on every retry). Before forwarding a vc_publish to Valor we
 * atomically claim the reqTxnId in a durable Firestore collection. If the same
 * reqTxnId was already published, we refuse to re-publish — that prevents the
 * "customer charged twice but POS said failed" double-charge from a retry that
 * races a slow-but-successful capture.
 *
 * Docs live in `valor_txn_idempotency`, keyed by reqTxnId. Each doc records the
 * publish outcome so a duplicate request can return the prior result. `created_at`
 * is written for TTL cleanup — configure a Firestore TTL policy on this field
 * (see humanActionsRequired) so the collection doesn't grow unbounded.
 */

const COLLECTION = "valor_txn_idempotency";

/**
 * Resolve a terminal's secret appKey SERVER-SIDE from an env allow-list, keyed
 * by EPI (device id). The client must NEVER send the appKey — it only sends the
 * non-secret EPI. Set VALOR_TERMINAL_KEYS in Vercel env to a JSON object:
 *   {"<epi>":"<appKey>", ...}
 *
 * Returns the appKey for an allow-listed EPI, or null if the EPI is unknown /
 * the env var is missing or malformed (caller must reject the request).
 */
let _terminalKeys: Record<string, string> | null | undefined;

function loadTerminalKeys(): Record<string, string> | null {
  if (_terminalKeys !== undefined) return _terminalKeys;
  const raw = process.env.VALOR_TERMINAL_KEYS;
  if (!raw) {
    _terminalKeys = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      _terminalKeys = parsed as Record<string, string>;
    } else {
      _terminalKeys = null;
    }
  } catch (err) {
    console.error("[idempotency] VALOR_TERMINAL_KEYS is not valid JSON", err);
    _terminalKeys = null;
  }
  return _terminalKeys;
}

export function resolveAppKeyForEpi(epi: string): string | null {
  const map = loadTerminalKeys();
  if (!map) return null;
  const key = map[epi];
  return typeof key === "string" && key.length >= 16 ? key : null;
}

export type IdempotencyStatus = "pending" | "completed" | "failed";

export interface IdempotencyClaim {
  /** true if this caller won the claim and should forward to Valor */
  claimed: boolean;
  /** the stored record when a prior claim already exists */
  prior?: {
    status: IdempotencyStatus;
    outcome?: unknown;
  };
}

/**
 * Atomically claim a reqTxnId. Returns { claimed: true } only for the first
 * caller; subsequent callers get { claimed: false, prior } with whatever the
 * first publish recorded so far.
 */
export async function claimReqTxnId(
  reqTxnId: string,
  meta: { epi: string },
): Promise<IdempotencyClaim> {
  const ref = adminDb.collection(COLLECTION).doc(reqTxnId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        claimed: false,
        prior: {
          status: (data.status as IdempotencyStatus) || "pending",
          outcome: data.outcome,
        },
      } as IdempotencyClaim;
    }
    tx.set(ref, {
      epi: meta.epi,
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
    });
    return { claimed: true } as IdempotencyClaim;
  });
}

/** Record the final outcome of a claimed publish so duplicates can replay it. */
export async function recordReqTxnOutcome(
  reqTxnId: string,
  status: "completed" | "failed",
  outcome: unknown,
): Promise<void> {
  const ref = adminDb.collection(COLLECTION).doc(reqTxnId);
  try {
    await ref.set(
      { status, outcome: outcome ?? null, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // Non-fatal: the claim doc already prevents a re-publish; failing to record
    // the outcome only means a duplicate request can't replay the exact result.
    console.error("[idempotency] failed to record outcome", err);
  }
}

/**
 * Release a claim when the publish never actually reached Valor (e.g. a
 * validation/network error before the request was sent), so a legitimate retry
 * with the same reqTxnId isn't permanently blocked.
 */
export async function releaseReqTxnId(reqTxnId: string): Promise<void> {
  const ref = adminDb.collection(COLLECTION).doc(reqTxnId);
  try {
    await ref.delete();
  } catch (err) {
    console.error("[idempotency] failed to release claim", err);
  }
}
