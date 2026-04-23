/**
 * Shared pricing helpers — keeps kiosk, POS, and website in sync with
 * the rates configured on the Valor terminal. Adjust here and every
 * screen updates.
 */

export const TAX_RATE = 0.08238;         // 8.238% sales tax
export const CARD_SURCHARGE_RATE = 0.04; // 4% credit-card surcharge

const round2 = (n: number) => Math.round(n * 100) / 100;

// Rounds tax and surcharge to the nearest cent *before* summing —
// matches how the Valor terminal computes its displayed total, so the
// UI never drifts by a penny from what the customer is actually charged.
// Example: $1.99 → tax $0.16, taxed $2.15, surcharge $0.09, total $2.24.
export function computeTotals(subtotal: number, payment: "card" | "cash") {
  const roundedSubtotal = round2(subtotal);
  const tax = round2(roundedSubtotal * TAX_RATE);
  const taxed = round2(roundedSubtotal + tax);
  const surcharge = payment === "card" ? round2(taxed * CARD_SURCHARGE_RATE) : 0;
  const total = round2(taxed + surcharge);
  return { subtotal: roundedSubtotal, tax, surcharge, total };
}
