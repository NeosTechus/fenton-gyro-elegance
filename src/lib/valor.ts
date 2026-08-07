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

// ── REST transaction sender ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Sends a transaction to the selected Valor terminal via Valor Connect cloud.
 * Requires the terminal's EPI and APP KEY (from the Payment Terminals settings).
 */
export async function cancelValorTransaction(
  epi: string,
  appkey: string,
  reqTxnId: string,
): Promise<void> {
  if (!epi || !appkey || !reqTxnId) return;
  try {
    const res = await fetch("/api/valor-terminal-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epi, appkey, reqTxnId }),
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
export function warmupValor(epi: string, appkey: string): void {
  if (!epi || !appkey) return;
  const opts = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  fetch("/api/valor-terminal-publish", opts({ warmup: true })).catch(() => {});
  fetch("/api/valor-terminal-status", opts({ epi, appkey, reqTxnId: `PING${Date.now()}` })).catch(() => {});
}

export class ValorCancelledError extends Error {
  constructor(message = "Transaction Cancelled") {
    super(message);
    this.name = "ValorCancelledError";
  }
}

export class ValorTimeoutError extends Error {
  reqTxnId: string;
  constructor(reqTxnId: string, message = "Valor transaction timed out (180s). Check terminal.") {
    super(message);
    this.name = "ValorTimeoutError";
    this.reqTxnId = reqTxnId;
  }
}

// Valor wraps the terminal payload as { error_no, response: {...txn} } or
// { error_no, payload: {...} }. STATE may come back as a number or string.
const extractTxn = (data: any) =>
  data?.response?.response ||
  data?.response?.payload ||
  data?.response?.data ||
  data?.payload ||
  data?.response;

const stateOf = (p: any) => (p?.STATE !== undefined ? String(p.STATE) : undefined);

/**
 * Final success only when STATE=0 AND a real completion signal from the reader.
 * Do not treat bare STATE=0 as done — intermediate polls can look like that and
 * returning early leaves the txn live (next sale → PROCESSING ERROR).
 */
export const isFinalSuccess = (p: any) => {
  if (!p || typeof p !== "object") return false;
  if (stateOf(p) !== "0") return false;
  if (p?.MASKED_PAN) return true;
  if (/cash/i.test(String(p?.TRAN_TYPE || ""))) return true;
  if (String(p?.TRAN_MODE || "") === "6") return true;
  const auth = String(p?.AUTH_RSP_TEXT || p?.AUTH_RESP_TEXT || "");
  if (auth && /APPROV|OK|SUCCESS/i.test(auth) && (p?.CODE || p?.AUTH_CODE || p?.RRN)) return true;
  if (auth && /APPROV|OK|SUCCESS/i.test(auth)) return true;
  return false;
};

/** Persist last terminal approval so a refresh / late status gap doesn't lose card confirmation. */
const APPROVAL_CACHE_PREFIX = "valorApproved:";

export function cacheValorApproval(reqTxnId: string, result: ValorSuccessResponse): void {
  if (!reqTxnId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${APPROVAL_CACHE_PREFIX}${reqTxnId}`,
      JSON.stringify({ ...result, _cachedAt: Date.now() }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function readCachedValorApproval(reqTxnId: string): ValorSuccessResponse | null {
  if (!reqTxnId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${APPROVAL_CACHE_PREFIX}${reqTxnId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed._cachedAt && Date.now() - parsed._cachedAt > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(`${APPROVAL_CACHE_PREFIX}${reqTxnId}`);
      return null;
    }
    delete parsed._cachedAt;
    return parsed as ValorSuccessResponse;
  } catch {
    return null;
  }
}

export function clearCachedValorApproval(reqTxnId: string): void {
  if (!reqTxnId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${APPROVAL_CACHE_PREFIX}${reqTxnId}`);
  } catch {
    /* ignore */
  }
}

async function pollValorUntilDone(
  epi: string,
  appkey: string,
  reqTxnId: string,
  maxMs: number,
): Promise<ValorSuccessResponse> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch("/api/valor-terminal-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epi, appkey, reqTxnId }),
    });

    const statusData = await statusRes.json();
    if (!statusRes.ok) continue;

    const txn = extractTxn(statusData);
    console.log("[valor-poll]", { reqTxnId, raw: statusData, txn });
    if (!txn) continue;

    const state = stateOf(txn);
    if (isFinalSuccess(txn)) {
      const success = txn as ValorSuccessResponse;
      cacheValorApproval(reqTxnId, success);
      return success;
    }
    if (state === "-1") {
      const msg = (txn as ValorFailureResponse).ERROR_MSG || "Transaction failed";
      if (/cancel/i.test(msg)) throw new ValorCancelledError(msg);
      throw new Error(msg);
    }
  }

  throw new ValorTimeoutError(reqTxnId);
}

/** Continue polling an in-flight txn — use after a timeout if the terminal may still be processing.
 *  Note: once a txn is settled, Valor often stops returning a final success payload; callers that
 *  already have staff confirmation should fall back to marking the order paid instead of polling forever.
 */
export function recoverValorTransaction(
  epi: string,
  appkey: string,
  reqTxnId: string,
  maxMs = 20_000,
) {
  return pollValorUntilDone(epi, appkey, reqTxnId, maxMs);
}

export async function sendValorTransaction(
  request: ValorSaleRequest,
  epi: string,
  appkey: string,
  onTxnId?: (reqTxnId: string) => void,
): Promise<ValorSuccessResponse> {
  if (isTestMode) {
    await sleep(2000);
    return mockCreditSaleResponse(request.AMOUNT);
  }

  if (!epi || !appkey) {
    throw new Error("No terminal selected. Choose a terminal on the Settings page.");
  }

  // 1. Publish
  const publishRes = await fetch("/api/valor-terminal-publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epi, appkey, payload: request }),
  });

  const publishData = await publishRes.json();
  if (!publishRes.ok) {
    throw new Error(publishData.error || "Failed to publish transaction");
  }

  const reqTxnId = publishData.reqTxnId;
  if (reqTxnId && onTxnId) onTxnId(reqTxnId);

  // Some publish responses may already include the final result
  const immediate = extractTxn(publishData);
  if (isFinalSuccess(immediate)) {
    const success = immediate as ValorSuccessResponse;
    if (reqTxnId) cacheValorApproval(reqTxnId, success);
    return success;
  }
  if (stateOf(immediate) === "-1") {
    throw new Error((immediate as ValorFailureResponse).ERROR_MSG || "Transaction failed");
  }

  if (!reqTxnId) {
    throw new Error("Failed to publish transaction — no transaction ID returned");
  }

  // 2. Poll for status until done
  return pollValorUntilDone(epi, appkey, reqTxnId, POLL_TIMEOUT_MS);
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
  appkey: string;
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
  return sendValorTransaction(request, opts.epi, opts.appkey, opts.onTxnId);
}

export function sendVoid(tranNo: string, epi: string, appkey: string) {
  return sendValorTransaction({
    TRAN_MODE: "0",
    TRAN_CODE: "2",
    AMOUNT: "0",
    TRAN_NO: tranNo,
    VOID_CONFIRMATION: "0",
    PAPER_RECEIPT: "2",
    MOBILE_ENTRY: "0",
  } as any, epi, appkey);
}

