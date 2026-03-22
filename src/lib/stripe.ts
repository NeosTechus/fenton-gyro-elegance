interface CheckoutItem {
  name: string;
  price: number;
  quantity: number;
}

interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export async function createCheckoutSession(
  items: CheckoutItem[],
  orderType: "pickup" | "delivery",
  customerInfo: CustomerInfo
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("VITE_SUPABASE_URL is not configured. Add it to your .env file.");
  }

  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    throw new Error("VITE_SUPABASE_ANON_KEY is not configured. Add it to your .env file.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      items,
      orderType,
      customerInfo,
      origin: window.location.origin,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create checkout session");
  }

  return data.url;
}
