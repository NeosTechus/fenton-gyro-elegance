/**
 * Valor Connect — WebSocket integration for in-store POS/Kiosk payments.
 *
 * Connection modes:
 *   - Valor Connect (cloud): wss://<vc-server>  (uses Channel ID + certs)
 *   - Local WebSocket:       ws://<terminal-ip>:5000
 *
 * The env var VITE_VALOR_WS_URL should point to whichever mode you use.
 * The env var VITE_VALOR_EPI is the terminal Endpoint Identifier.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface ValorSaleRequest {
  TRAN_MODE: string;   // "1"=Credit, "2"=Debit, "6"=Cash
  TRAN_CODE: string;   // "1"=Sale, "2"=Void, "5"=Refund
  AMOUNT: string;      // cents — e.g. "1000" = $10.00
  TIP_ENTRY?: string;  // "1"=enable, "0"=disable
  TIP_AMOUNT?: string;
  SIGNATURE?: string;  // "1"=enable, "0"=disable
  PAPER_RECEIPT?: string; // "0"=TMS, "1"=none, "2"=print, "3"=TMS
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

export interface ValorAckResponse {
  STATE: "0";
  MSG: "ACK";
}

export type ValorResponse = ValorSuccessResponse | ValorFailureResponse | ValorAckResponse;

// ── Config ───────────────────────────────────────────────────────────────

export function getValorConfig() {
  return {
    wsUrl: import.meta.env.VITE_VALOR_WS_URL || "",
    epi: import.meta.env.VITE_VALOR_EPI || "",
  };
}

export function isValorConfigured(): boolean {
  return !!import.meta.env.VITE_VALOR_WS_URL;
}

// ── Helper: convert dollar amount to cents string ────────────────────────

export function dollarsToCents(amount: number): string {
  return Math.round(amount * 100).toString();
}

// ── WebSocket transaction sender ─────────────────────────────────────────

function isAck(data: ValorResponse): data is ValorAckResponse {
  return data.STATE === "0" && "MSG" in data && data.MSG === "ACK";
}

/**
 * Opens a WebSocket to the Valor terminal, sends the request JSON,
 * and waits for the final (non-ACK) response.
 *
 * Timeout: 180 s (Valor Connect recommendation).
 */
export function sendValorTransaction(
  request: ValorSaleRequest,
  overrideWsUrl?: string
): Promise<ValorSuccessResponse | ValorFailureResponse> {
  const wsUrl = overrideWsUrl || getValorConfig().wsUrl;
  if (!wsUrl) {
    return Promise.reject(new Error("No terminal URL configured. Select a terminal or set VITE_VALOR_WS_URL."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("Valor transaction timed out (180s). Check terminal."));
      }
    }, 180_000);

    const cleanup = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch { /* already closed */ }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify(request));
    };

    ws.onmessage = (event) => {
      try {
        const data: ValorResponse = JSON.parse(event.data);

        // Skip ACK — wait for the real response
        if (isAck(data)) return;

        settled = true;
        cleanup();

        if (data.STATE === "0") {
          resolve(data as ValorSuccessResponse);
        } else {
          reject(new Error((data as ValorFailureResponse).ERROR_MSG || "Transaction failed"));
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = (event) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("WebSocket connection failed. Is the terminal online?"));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Connection closed before response received."));
      }
    };
  });
}

// ── Convenience: Credit Card Sale ────────────────────────────────────────

export interface ValorSaleOptions {
  amountCents: string;
  tipEnabled?: boolean;
  tipAmountCents?: string;
  printReceipt?: boolean;
  invoiceNumber?: string;
  lineItems?: { product_code: string; quantity: string; total: string }[];
  wsUrl?: string; // override terminal URL (from EPI selection)
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
  if (opts.lineItems) request.lineItems = opts.lineItems;
  return sendValorTransaction(request, opts.wsUrl);
}

export function sendVoid(tranNo: string, wsUrl?: string) {
  return sendValorTransaction({
    TRAN_MODE: "0",
    TRAN_CODE: "2",
    AMOUNT: "0",
    TRAN_NO: tranNo,
    VOID_CONFIRMATION: "0",
    PAPER_RECEIPT: "2",
    MOBILE_ENTRY: "0",
  } as any, wsUrl);
}
