/**
 * Valor Connect — REST Wrapper API integration for in-store POS/Kiosk payments.
 *
 * Flow:
 *   1. Publish transaction via /api/valor-terminal-publish (Vercel serverless)
 *   2. Poll /api/valor-terminal-status until terminal completes the sale
 *
 * Requires VALOR_CHANNEL_ID on the server (set in Vercel env vars).
 * The terminal's EPI + APP KEY identify which device gets the transaction.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface ValorSaleRequest {
  TRAN_MODE: string;   // "1"=Credit, "2"=Debit, "6"=Cash
  TRAN_CODE: string;   // "1"=Sale, "2"=Void
  AMOUNT: string;      // cents — e.g. "1000" = $10.00
  TIP_ENTRY?: string;
  TIP_AMOUNT?: string;
  SIGNATURE?: string;
  PAPER_RECEIPT?: string;
  MOBILE_ENTRY?: string;
  MOBILE_NUMBER?: string;
  CANCEL_CONFIRMATION?: string;
  INVOICENUMBER?: string;
  lineItems?: { product_code: string; quantity: string; total: string }[];
}

export interface ValorSuccessResponse {
  STATE: "0";
  AMOUNT: string;
  MASKED_PAN: string;
  ISSUER: string;
  RRN: string;
  CODE: string;
  AUTH_RSP_TEXT: string;
  DATE: string;
  TRAN_NO: string;
  BATCH_NO?: string;
  SERIAL_NO?: string;
  TRAN_TYPE?: string;
  TRAN_METHOD?: string;
  ENTRY_MODE?: string;
  TIP_AMOUNT?: string;
  SURCHARGE_AMOUNT?: string;
  TOTAL_AMOUNT?: string;
  PARTIAL?: string;
  TXN_ID?: string;
  AID?: string;
  TVR?: string;
  TSI?: string;
}

export interface ValorFailureResponse {
  STATE: "-1";
  ERROR_CODE: string;
  ERROR_MSG: string;
}

export type ValorResponse = ValorSuccessResponse | ValorFailureResponse;

// ── Config ───────────────────────────────────────────────────────────────

export const isTestMode = import.meta.env.VITE_TEST_MODE === "true";

export function isValorConfigured(): boolean {
  // In cloud mode, the server holds VALOR_CHANNEL_ID. The client just needs
  // a selected EPI + APP KEY (managed via the Payment Terminals settings page).
  return true;
}

// ── Test mode mock ───────────────────────────────────────────────────────

let testTranCounter = 1000;

function mockCreditSaleResponse(amountCents: string): ValorSuccessResponse {
  testTranCounter++;
  return {
    STATE: "0",
    AMOUNT: amountCents,
    MASKED_PAN: "4111 **** **** 1111",
    ISSUER: "VISA",
    RRN: `TEST${Date.now().toString().slice(-8)}`,
    CODE: `TST${testTranCounter}`,
    AUTH_RSP_TEXT: "APPROVAL",
    DATE: new Date().toLocaleString("en-US", { hour12: false }).replace(",", ""),
    TRAN_NO: testTranCounter.toString(),
    BATCH_NO: "1",
    SERIAL_NO: "TEST000001",
    TRAN_TYPE: "Credit",
    TRAN_METHOD: "Sale",
    ENTRY_MODE: "CHIP",
    TXN_ID: testTranCounter.toString(),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function dollarsToCents(amount: number): string {
  return Math.round(amount * 100).toString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Mint a stable client reqTxnId for a logical sale. Generated ONCE at sale
 * start and reused on every retry so the server-side idempotency guard can
 * recognise a retry and refuse to re-publish (preventing double charges).
 * Format matches the server's /^[A-Z0-9]{5,25}$/ contract.
 */
export function newReqTxnId(): string {
  const rand = Math.random().toString(36).slice(2).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stamp = Date.now().toString(36).toUpperCase();
  return `POS${stamp}${rand}`.slice(0, 25);
}

// ── REST transaction sender ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
// Must be >= the publish lambda's maxDuration (240s) so the client doesn't give
// up while the serverless function may still be capturing the sale. If the
// client timed out first, a "try card again" could re-publish and double-charge.
const POLL_TIMEOUT_MS = 255_000; // 4m15s

/**
 * Sends a transaction to the selected Valor terminal via Valor Connect cloud.
 * Requires the terminal's EPI and APP KEY (from the Payment Terminals settings).
 */
export async function cancelValorTransaction(
  epi: string,
  reqTxnId: string,
): Promise<void> {
  if (!epi || !reqTxnId) return;
  try {
    const res = await fetch("/api/valor-terminal-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // appKey resolved server-side from the EPI allow-list — never sent.
      body: JSON.stringify({ epi, reqTxnId }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[valor-cancel]", { ok: res.ok, status: res.status, data });
  } catch (e) {
    console.error("[valor-cancel] failed", e);
  }
}

/**
 * Warms both Vercel serverless lambdas (publish + status) so the first
 * real transaction doesn't pay a cold-start delay before reaching the
 * terminal. Call on checkout-screen mount. Fire-and-forget.
 */
// Second arg (formerly appkey) is accepted-but-ignored for backward compat —
// the server resolves the appKey from the EPI allow-list.
export function warmupValor(epi: string, _legacyAppKey?: string): void {
  if (!epi) return;
  const opts = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  fetch("/api/valor-terminal-publish", opts({ warmup: true })).catch(() => {});
  // appKey resolved server-side from the EPI allow-list — never sent.
  fetch("/api/valor-terminal-status", opts({ epi, reqTxnId: `PING${Date.now()}` })).catch(() => {});
}

export class ValorCancelledError extends Error {
  constructor(message = "Transaction Cancelled") {
    super(message);
    this.name = "ValorCancelledError";
  }
}

// A DEFINITE decline: the terminal read the card and the processor rejected it
// (STATE=-1, not a cancel). No money was captured, so it is SAFE to retry the
// same order on a fresh transaction id. Distinct from a generic/network error,
// where a capture may have silently happened and a blind retry could double
// charge — callers must only reset/retry on this specific error.
export class ValorDeclinedError extends Error {
  constructor(message = "Card declined") {
    super(message);
    this.name = "ValorDeclinedError";
  }
}

export class ValorTimeoutError extends Error {
  reqTxnId: string;
  constructor(reqTxnId: string, message = "Valor transaction timed out. Check terminal.") {
    super(message);
    this.name = "ValorTimeoutError";
    this.reqTxnId = reqTxnId;
  }
}

// Valor wraps the terminal payload as { error_no, response: {...txn} } or
// { error_no, payload: {...} }. STATE may come back as a number or string.
const extractTxn = (data: any) =>
  data?.response?.response || data?.response?.payload || data?.response;
const stateOf = (p: any) => (p?.STATE !== undefined ? String(p.STATE) : undefined);

// Pull the txn id a frame reports back so we can verify a STATE=0 frame really
// belongs to the reqTxnId we're polling (Valor echoes REQ_TXN_ID / TXN_ID).
const reqIdOf = (p: any): string | undefined => {
  const v = p?.REQ_TXN_ID ?? p?.req_txn_id;
  return v !== undefined && v !== null ? String(v) : undefined;
};

// A response is final when STATE=0 AND it carries a POSITIVE completion signal.
//
// For a CREDIT SALE that means a hard settlement marker — MASKED_PAN present,
// or RRN + TRAN_NO present. We deliberately do NOT accept AUTH_RSP_TEXT
// (/APPROV|OK/) alone: intermediate polling frames can carry STATE=0 with an
// approval text but no settlement fields, and returning early there both (a)
// reports a sale that may not have captured and (b) leaves the txn live on the
// terminal, making the next publish fail with PROCESSING ERROR.
//
// Cash-tender frames (TRAN_TYPE="Cash" / TRAN_MODE="6") are still treated as
// final on STATE=0 — they have no PAN/RRN to wait for.
//
// When `expectedReqId` is supplied, a frame that reports a DIFFERENT txn id is
// rejected (stale/cross-talk), so we never accept another sale's result.
const isFinalSuccess = (p: any, expectedReqId?: string) => {
  if (stateOf(p) !== "0") return false;
  if (expectedReqId) {
    const got = reqIdOf(p);
    if (got && got !== expectedReqId) return false;
  }
  // Cash tender — no card settlement fields to require.
  if (/cash/i.test(String(p?.TRAN_TYPE || ""))) return true;
  if (String(p?.TRAN_MODE || "") === "6") return true;
  // Credit sale — require a positive settlement signal.
  if (p?.MASKED_PAN) return true;
  if (p?.RRN && p?.TRAN_NO) return true;
  return false;
};

async function pollValorUntilDone(
  epi: string,
  reqTxnId: string,
  maxMs: number,
): Promise<ValorSuccessResponse> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch("/api/valor-terminal-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // appKey resolved server-side from the EPI allow-list — never sent.
      body: JSON.stringify({ epi, reqTxnId }),
    });

    const statusData = await statusRes.json();
    if (!statusRes.ok) continue;

    const txn = extractTxn(statusData);
    console.log("[valor-poll]", { reqTxnId, raw: statusData, txn });
    if (!txn) continue;

    const state = stateOf(txn);
    if (isFinalSuccess(txn, reqTxnId)) {
      return txn as ValorSuccessResponse;
    }
    if (state === "-1") {
      const msg = (txn as ValorFailureResponse).ERROR_MSG || "Transaction failed";
      if (/cancel/i.test(msg)) throw new ValorCancelledError(msg);
      // STATE=-1 is a definite decline — the card was read and rejected, nothing
      // captured — so the caller may safely retry on a fresh txn id.
      throw new ValorDeclinedError(msg);
    }
  }

  throw new ValorTimeoutError(reqTxnId);
}

/**
 * One-shot status check for an EXISTING reqTxnId. Used to gate a "try card
 * again" retry: if the prior attempt already approved/captured on the terminal,
 * we must BLOCK the re-publish and surface the existing approval instead of
 * charging the card a second time.
 *
 * Returns the completed sale frame if already final, or null if not yet
 * settled / unknown. Never throws on transport errors — a failed check is
 * treated as "unknown" (caller decides how cautious to be).
 */
export async function checkValorTxnStatus(
  epi: string,
  reqTxnId: string,
): Promise<ValorSuccessResponse | null> {
  if (!epi || !reqTxnId) return null;
  try {
    const res = await fetch("/api/valor-terminal-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epi, reqTxnId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txn = extractTxn(data);
    if (txn && isFinalSuccess(txn, reqTxnId)) {
      return txn as ValorSuccessResponse;
    }
    return null;
  } catch {
    return null;
  }
}

/** Continue polling an in-flight txn — use after a timeout if the terminal may still be processing. */
export function recoverValorTransaction(
  epi: string,
  reqTxnId: string,
  maxMs = 90_000,
) {
  return pollValorUntilDone(epi, reqTxnId, maxMs);
}

export async function sendValorTransaction(
  request: ValorSaleRequest,
  epi: string,
  reqTxnId: string,
  onTxnId?: (reqTxnId: string) => void,
): Promise<ValorSuccessResponse> {
  if (isTestMode) {
    await sleep(2000);
    return mockCreditSaleResponse(request.AMOUNT);
  }

  if (!epi) {
    throw new Error("No terminal selected. Choose a terminal on the Settings page.");
  }
  if (!reqTxnId) {
    throw new Error("Missing transaction id — cannot publish safely.");
  }

  // Surface the stable client reqTxnId immediately so retries/cancels reuse it.
  if (onTxnId) onTxnId(reqTxnId);

  // 1. Publish — send the stable client reqTxnId so the server-side idempotency
  // guard recognises retries and refuses to re-publish (no double charge).
  // appKey is resolved server-side from the EPI allow-list — never sent.
  const publishRes = await fetch("/api/valor-terminal-publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epi, payload: request, reqTxnId }),
  });

  const publishData = await publishRes.json();

  // 409 = the server already published this reqTxnId. Do NOT re-publish; resolve
  // the existing sale from the prior outcome / by polling so we surface the real
  // result instead of charging again.
  if (publishRes.status === 409) {
    const prior = extractTxn(publishData);
    if (isFinalSuccess(prior, reqTxnId)) {
      return prior as ValorSuccessResponse;
    }
    // ONLY a publish-level "failed" is a definite no-capture decline (the
    // server records "failed" exclusively on a Valor error_no != S00, before
    // any capture). Surface that immediately rather than polling a dead txn.
    //
    // "completed" does NOT mean settled — it is recorded the instant the
    // vc_publish ACK returns S00, when the transaction is LIVE on the terminal
    // and the card may be mid-capture or already captured. The settlement frame
    // (MASKED_PAN/RRN) only arrives via the separate vc_status poll. Treating
    // "completed" as a decline here would clear the stable reqTxnId and let a
    // retry RE-CHARGE the card. So "completed" (and "pending") must be RESOLVED
    // BY POLLING — never declared a decline.
    const priorStatus = (publishData as { status?: string }).status;
    if (priorStatus === "failed") {
      const msg = (prior as ValorFailureResponse)?.ERROR_MSG || "Card declined";
      throw new ValorDeclinedError(msg);
    }
    return pollValorUntilDone(epi, reqTxnId, POLL_TIMEOUT_MS);
  }

  if (!publishRes.ok) {
    throw new Error(publishData.error || "Failed to publish transaction");
  }

  // Some publish responses may already include the final result
  const immediate = extractTxn(publishData);
  if (isFinalSuccess(immediate, reqTxnId)) {
    return immediate as ValorSuccessResponse;
  }
  if (stateOf(immediate) === "-1") {
    throw new Error((immediate as ValorFailureResponse).ERROR_MSG || "Transaction failed");
  }

  // 2. Poll for status until done
  return pollValorUntilDone(epi, reqTxnId, POLL_TIMEOUT_MS);
}

// ── Convenience: Credit Card Sale ────────────────────────────────────────

export interface ValorSaleOptions {
  amountCents: string;
  tipEnabled?: boolean;
  tipAmountCents?: string;
  printReceipt?: boolean;
  invoiceNumber?: string;
  lineItems?: { product_code: string; quantity: string; total: string }[];
  epi: string;
  /** Stable reqTxnId for this logical sale. REUSED on every retry so the
   *  server-side idempotency guard can prevent a double charge. When omitted
   *  (single-shot callers like the kiosk) a fresh id is minted per attempt. */
  reqTxnId?: string;
  /** @deprecated ignored — appKey is resolved server-side from the EPI
   *  allow-list and must never be sent from the client. */
  appkey?: string;
  onTxnId?: (reqTxnId: string) => void;
}

export function sendCreditSale(opts: ValorSaleOptions) {
  const request: ValorSaleRequest = {
    TRAN_MODE: "1",
    TRAN_CODE: "1",
    AMOUNT: opts.amountCents,
    TIP_ENTRY: opts.tipEnabled ? "1" : "0",
    SIGNATURE: "1",
    PAPER_RECEIPT: opts.printReceipt ? "2" : "1",
    MOBILE_ENTRY: "0",
    CANCEL_CONFIRMATION: "0",
  };
  if (opts.tipAmountCents) request.TIP_AMOUNT = opts.tipAmountCents;
  if (opts.invoiceNumber) request.INVOICENUMBER = opts.invoiceNumber;
  // NOTE: lineItems intentionally omitted — when sent, Valor's terminal
  // recomputes the total from items and may add its own configured tax
  // on top, causing the terminal display to differ from the POS UI.
  return sendValorTransaction(request, opts.epi, opts.reqTxnId || newReqTxnId(), opts.onTxnId);
}

export function sendVoid(tranNo: string, epi: string, reqTxnId: string = newReqTxnId()) {
  return sendValorTransaction({
    TRAN_MODE: "0",
    TRAN_CODE: "2",
    AMOUNT: "0",
    TRAN_NO: tranNo,
    VOID_CONFIRMATION: "0",
    PAPER_RECEIPT: "2",
    MOBILE_ENTRY: "0",
  } as any, epi, reqTxnId);
}

