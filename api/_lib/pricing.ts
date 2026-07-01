/**
 * Server-side port of src/lib/pricing.ts.
 *
 * Kept byte-for-byte in sync with the client pricing logic so server code
 * (Valor checkout / payment verification) can independently recompute the
 * amount a customer should be charged instead of trusting numbers the
 * browser supplies. If you change rates or rounding here, change them in
 * src/lib/pricing.ts too.
 */

export const TAX_RATE = 0.08238;         // 8.238% sales tax
export const CARD_SURCHARGE_RATE = 0.04; // 4% credit-card surcharge

const round2 = (n: number) => Math.round(n * 100) / 100;

// Rounds tax and surcharge to the nearest cent *before* summing — matches how
// the Valor terminal computes its displayed total, so the server never drifts
// by a penny from what the customer is actually charged.
export function computeTotals(subtotal: number, payment: "card" | "cash") {
  const roundedSubtotal = round2(subtotal);
  const tax = round2(roundedSubtotal * TAX_RATE);
  const taxed = round2(roundedSubtotal + tax);
  const surcharge = payment === "card" ? round2(taxed * CARD_SURCHARGE_RATE) : 0;
  const total = round2(taxed + surcharge);
  return { subtotal: roundedSubtotal, tax, surcharge, total };
}

export interface CardBreakdown {
  subtotal: number;
  tax: number;
  surcharge: number;
  total: number;
}

/**
 * Web checkout stores `order.total` as the full CARD total
 * (subtotal + tax + surcharge) — see CartDrawer.tsx. The Valor ePage, however,
 * is sent the pre-surcharge `amount` (= subtotal) plus `tax` and `surcharge`
 * as separate fields (Valor re-applies the surcharge via surchargeIndicator).
 *
 * To recompute that breakdown SERVER-SIDE we must recover the subtotal from
 * the stored card total. The forward math (computeTotals) rounds at each step,
 * so it isn't perfectly invertible in closed form. We instead derive an
 * estimated subtotal, then search the immediate neighbourhood (±a few cents)
 * for the subtotal whose computeTotals(...,"card").total reproduces the stored
 * card total exactly. Returns null if no penny-exact subtotal reproduces it
 * (e.g. a tampered or legacy order doc) so callers can fail safe.
 */
export function cardBreakdownFromTotal(cardTotal: number): CardBreakdown | null {
  if (!Number.isFinite(cardTotal) || cardTotal <= 0) return null;

  const target = round2(cardTotal);
  // Forward factor: total ≈ subtotal * (1 + TAX_RATE) * (1 + CARD_SURCHARGE_RATE)
  const factor = (1 + TAX_RATE) * (1 + CARD_SURCHARGE_RATE);
  const estCents = Math.round((target / factor) * 100);

  // Search a small window around the estimate to absorb per-step rounding.
  for (let delta = -3; delta <= 3; delta++) {
    const cents = estCents + delta;
    if (cents <= 0) continue;
    const candidate = computeTotals(cents / 100, "card");
    if (Math.abs(candidate.total - target) < 0.005) {
      return candidate;
    }
  }
  return null;
}

/**
 * Compute the expected CARD total for an order whose stored `subtotal` (the
 * pre-tax amount) is known. Convenience wrapper used by payment verification.
 */
export function expectedCardTotalFromSubtotal(subtotal: number): number {
  return computeTotals(subtotal, "card").total;
}
