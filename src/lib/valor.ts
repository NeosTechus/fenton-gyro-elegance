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
  TRAN_CODE: string;   // "1"=Sale, "2"=Void, "5"=Refund
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

  // Valor wraps the terminal payload as { error_no, response: {...txn} } or
  // { error_no, payload: {...} }. STATE may come back as a number or string.
  const extractTxn = (data: any) =>
    data?.response?.response || data?.response?.payload || data?.response;
  const stateOf = (p: any) => (p?.STATE !== undefined ? String(p.STATE) : undefined);

  // A response is final when STATE=0 AND it carries a positive completion
  // signal — either MASKED_PAN (card sale) or a cash-tender marker
  // (TRAN_TYPE="Cash" / TRAN_MODE="6"). We avoid looser heuristics because
  // intermediate polling responses can also carry STATE=0 with partial
  // fields, and returning early leaves the txn live on the terminal —
  // which causes the next publish to fail with PROCESSING ERROR.
  const isFinalSuccess = (p: any) => {
    if (stateOf(p) !== "0") return false;
    if (p?.MASKED_PAN) return true;
    if (/cash/i.test(String(p?.TRAN_TYPE || ""))) return true;
    if (String(p?.TRAN_MODE || "") === "6") return true;
    return false;
  };

  // Some publish responses may already include the final result
  const immediate = extractTxn(publishData);
  if (isFinalSuccess(immediate)) {
    return immediate as ValorSuccessResponse;
  }
  if (stateOf(immediate) === "-1") {
    throw new Error((immediate as ValorFailureResponse).ERROR_MSG || "Transaction failed");
  }

  // 2. Poll for status until done
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
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
      return txn as ValorSuccessResponse;
    }
    if (state === "-1") {
      const msg = (txn as ValorFailureResponse).ERROR_MSG || "Transaction failed";
      if (/cancel/i.test(msg)) throw new ValorCancelledError(msg);
      throw new Error(msg);
    }
  }

  throw new Error("Valor transaction timed out (180s). Check terminal.");
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
