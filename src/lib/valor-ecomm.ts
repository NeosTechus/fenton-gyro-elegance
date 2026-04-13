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
  if (isTestMode) {
    // Simulate a 1-second delay then redirect to success
    // Use invoiceNumber as orderId (it's the Firestore doc ID)
    await new Promise((r) => setTimeout(r, 1000));
    return `${window.location.origin}/order-success?orderId=${request.invoiceNumber || "test"}`;
  }

  const functionUrl =
    import.meta.env.VITE_VALOR_CHECKOUT_URL || "/api/create-valor-checkout";

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...request,
      redirectUrl: `${window.location.origin}/order-success`,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create Valor checkout session");
  }

  return data.url;
}
