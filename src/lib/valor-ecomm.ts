/**
 * Valor eCommerce — ePage (hosted payment page) for online ordering.
 *
 * The ePage flow:
 *   1. Frontend sends order details to /api/create-valor-checkout (Vercel serverless)
 *   2. API route calls Valor ePage API with appid/appkey (env secrets)
 *   3. Valor returns a hosted payment page URL
 *   4. Customer is redirected to Valor's page to enter card details
 *   5. After payment, customer is redirected back to /order-success
 *
 * In TEST MODE: skips the API call and redirects straight to /order-success.
 */

const isTestMode = import.meta.env.VITE_TEST_MODE === "true";

export interface ValorEpageRequest {
  amount: string;       // e.g. "12.50"
  tax?: string;         // e.g. "1.00"
  surcharge?: string;   // e.g. "0.50" — card surcharge, shown separately on Valor's ePage
  phone?: string;
  email?: string;
  invoiceNumber?: string;
  productDescription?: string;
  customerName?: string;
}

/**
 * Calls our Vercel API route to create a Valor ePage checkout session.
 * In test mode, returns a direct URL to /order-success.
 */
export async function createValorCheckout(
  request: ValorEpageRequest
): Promise<string> {
  // invoiceNumber is the Firestore order ID — use it as the path segment so
  // Valor preserves it on redirect back (query params can get stripped).
  const trackUrl = request.invoiceNumber
    ? `${window.location.origin}/track/${request.invoiceNumber}`
    : `${window.location.origin}/order-success`;

  if (isTestMode) {
    await new Promise((r) => setTimeout(r, 1000));
    return trackUrl;
  }

  const functionUrl =
    import.meta.env.VITE_VALOR_CHECKOUT_URL || "/api/create-valor-checkout";

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...request,
      redirectUrl: trackUrl,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const parts = [data.error || "Failed to create Valor checkout session"];
    if (data.code) parts.push(`(${data.code})`);
    throw new Error(parts.join(" "));
  }

  return data.url;
}
