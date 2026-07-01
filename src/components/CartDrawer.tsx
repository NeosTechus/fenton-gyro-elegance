import { useEffect, useState } from "react";
import { X, Minus, Plus, Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { createValorCheckout } from "@/lib/valor-ecomm";
import { createOrder } from "@/lib/orders";
import { computeTotals } from "@/lib/pricing";



// Persist the order id created for a given cart so a back-button / bfcache
// restore (which can re-fire handleSubmit) doesn't mint a SECOND unpaid order
// for the same items. Keyed by a stable signature of the cart contents.
const SUBMITTED_ORDER_KEY = "fg_submitted_order";

function cartSignature(items: { item: { id: string; price: number }; qty: number }[]): string {
  return items
    .map(({ item, qty }) => `${item.id}:${qty}:${item.price}`)
    .sort()
    .join("|");
}

// The guard only needs to catch an IMMEDIATE back-button / bfcache re-submit
// (which happens within seconds of leaving for Valor). We TTL it so a later
// genuine reorder of the same items doesn't resolve to a long-since-PAID order
// id (which the server would 409). Keep it short.
const SUBMITTED_ORDER_TTL_MS = 5 * 60 * 1000;

function readSubmittedOrder(sig: string, nowMs: number): string | null {
  try {
    const raw = sessionStorage.getItem(SUBMITTED_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sig?: string; orderId?: string; ts?: number };
    if (!parsed || parsed.sig !== sig || !parsed.orderId) return null;
    // Expired -> ignore so a reorder mints a fresh order rather than reusing a
    // possibly-paid id.
    if (typeof parsed.ts !== "number" || nowMs - parsed.ts > SUBMITTED_ORDER_TTL_MS) {
      return null;
    }
    return parsed.orderId;
  } catch {
    return null;
  }
}

function writeSubmittedOrder(sig: string, orderId: string, nowMs: number): void {
  try {
    sessionStorage.setItem(SUBMITTED_ORDER_KEY, JSON.stringify({ sig, orderId, ts: nowMs }));
  } catch {
    /* sessionStorage unavailable (private mode) — best-effort only */
  }
}

const CartDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { cartItems, totalItems, totalPrice, addItem, removeItem, removeLine, clearCart } = useCart();
  const orderType = "pickup";
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset processing state if the user navigates back from Valor's payment
  // page without completing checkout — bfcache would otherwise restore
  // isProcessing=true and leave the button stuck on "Processing…".
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsProcessing(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (open) setIsProcessing(false);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalItems === 0) {
      toast.error("Please add items to your order");
      return;
    }
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error("Please fill in your name and phone number");
      return;
    }

    setIsProcessing(true);
    try {
      const items = cartItems.map(({ item, qty }) => ({
        name: item.name,
        price: item.price,
        quantity: qty,
      }));
      // Guard against a back-button / bfcache restore re-firing handleSubmit
      // for the SAME cart: if we already minted an unpaid order for exactly
      // these items, reuse it and re-redirect instead of creating a duplicate.
      const sig = cartSignature(cartItems);
      const nowMs = Date.now();
      // Send pre-surcharge amount + tax to Valor; its ePage will apply the
      // 4% surcharge itself via surchargeIndicator=1. Sending the card total
      // would cause double-charging (our 4% + Valor's 4%).
      const { subtotal, tax, surcharge, total: cardTotal } = computeTotals(totalPrice, "card");
      const existingOrderId = readSubmittedOrder(sig, nowMs);
      const orderId =
        existingOrderId ||
        (await createOrder({
          customer_name: formData.name,
          customer_email: formData.email,
          customer_phone: formData.phone,
          items: items.map(({ name, price, quantity }) => ({ name, price, quantity })),
          total: cardTotal,
          order_type: orderType,
          notes: formData.notes,
          source: "web",
          payment: "card",
          payment_status: "unpaid",
        }));

      // Remember this order for the current cart so a re-submit short-circuits
      // to the same order id rather than minting another unpaid duplicate.
      writeSubmittedOrder(sig, orderId, nowMs);

      const checkoutUrl = await createValorCheckout({
        amount: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        surcharge: surcharge.toFixed(2),
        phone: formData.phone,
        email: formData.email,
        customerName: formData.name,
        invoiceNumber: orderId,
        productDescription: items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
      });
      const url = new URL(checkoutUrl);
      url.searchParams.set("orderId", orderId);
      // Clear the cart only when the page ACTUALLY unloads to Valor. If the
      // navigation is blocked/aborted (user hits back before the hosted page
      // loads), the cart stays intact for retry — and the submitted-order guard
      // still reuses this same order id, so no duplicate is created.
      //
      // pagehide also fires when a (mobile) tab is merely frozen into bfcache
      // while still visible — clearing then would wipe a live cart mid-session.
      // So only clear when the page is actually being hidden/unloaded, and if
      // the navigation never commits, drop the leaked listener after a tick.
      const clearOnLeave = () => {
        if (document.visibilityState === "hidden") clearCart();
      };
      window.addEventListener("pagehide", clearOnLeave, { once: true });
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.removeEventListener("pagehide", clearOnLeave);
        }
      }, 2000);
      window.location.href = url.toString();
    } catch (error) {
      console.error("Checkout error:", error);
      // Drop the submitted-order guard so a retry isn't stuck reusing a stale
      // (possibly already-completed) order id — a fresh order will be minted.
      // Worst case is a duplicate UNPAID order, which the orphan cron expires;
      // the server rejects re-paying a completed order, so there is no double
      // charge.
      try {
        sessionStorage.removeItem(SUBMITTED_ORDER_KEY);
      } catch {
        /* sessionStorage unavailable — best effort */
      }
      toast.error(error instanceof Error ? error.message : "Payment failed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-foreground/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-border z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-accent" />
            <h2 className="font-serif text-xl font-medium">Your Order</h2>
            {totalItems > 0 && (
              <span className="text-xs font-sans font-semibold bg-accent text-accent-foreground px-2 py-0.5 rounded-sm">
                {totalItems}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {totalItems === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Your cart is empty.</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Add items from the menu to get started.</p>
            </div>
          ) : (
            <>
              {/* Order type label */}
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-sans font-semibold mb-6">Pickup Order</p>

              {/* Cart items */}
              <div className="space-y-3 mb-6">
                {cartItems.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-14 h-14 rounded-sm object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">{item.name}</p>
                      <p className="text-base text-accent font-semibold">${(item.price * qty).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="min-w-11 min-h-11 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{qty}</span>
                      <button
                        type="button"
                        onClick={() => addItem(item.id)}
                        className="min-w-11 min-h-11 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Remove from cart"
                        onClick={() => removeLine(item.id)}
                        className="min-w-12 min-h-12 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                      >
                        <Trash2 className="w-5 h-5 stroke-[2]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {(() => {
                const c = computeTotals(totalPrice, "card");
                return (
                  <div className="border-t border-border pt-4 mb-6 space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${c.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tax (8.238%)</span>
                      <span>${c.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Card surcharge (4%)</span>
                      <span>${c.surcharge.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-sans font-semibold pt-2 border-t border-border">
                      <span>Total</span>
                      <span className="text-accent">${c.total.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Your name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="tel"
                  placeholder="Phone number *"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <textarea
                  placeholder="Special instructions (optional)"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow resize-none"
                />
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>Checkout — ${computeTotals(totalPrice, "card").total.toFixed(2)}</>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CartDrawer;
