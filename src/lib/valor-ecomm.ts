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
 * This keeps card data off our servers (PCI compliant).
 */

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
 * Defaults to /api/create-valor-checkout (same domain on Vercel).
 * Override with VITE_VALOR_CHECKOUT_URL for custom deployments.
 */
export async function createValorCheckout(
  request: ValorEpageRequest
): Promise<string> {
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
