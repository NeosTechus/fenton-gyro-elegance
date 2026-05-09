import { useState } from "react";
import { useEffect, useRef } from "react";
import { Check, Minus, Plus, ShoppingBag, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import * as Sentry from "@sentry/react";
import { createValorCheckout } from "@/lib/valor-ecomm";
import { createOrder } from "@/lib/orders";
import { isAcceptingOnlineOrders, orderingClosedMessage } from "@/lib/hours";

import { menuItems, categories, ALLERGEN_LABEL } from "@/data/menu";
import ModifierSelector, {
  getDefaultSelectedMods,
  getKitchenModifierLines,
  getModifiersTotal,
  getSelectedModifierDetails,
} from "@/components/ModifierSelector";

type OrderType = "pickup" | "delivery";
interface WebCartLine {
  key: string;
  itemId: string;
  qty: number;
  selectedModifiers: Record<string, string[]>;
  modifiersTotal: number;
}

const OnlineOrder = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<WebCartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("pickup");
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(() => isAcceptingOnlineOrders());
  const [selectedItem, setSelectedItem] = useState<(typeof menuItems)[number] | null>(null);
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [itemQty, setItemQty] = useState(1);

  // Re-check open/closed every 30s so the UI flips at the cutoff without reload
  useEffect(() => {
    const tick = () => setIsOpen(isAcceptingOnlineOrders());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Reset the processing state when the page becomes visible again — the
  // user hit back from Valor checkout (bfcache restore or fresh mount).
  // Unconditional reset is safe: a fresh mount already has isProcessing=false.
  useEffect(() => {
    const reset = () => setIsProcessing(false);
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reset();
    });
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("focus", reset);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("animate-fade-up"); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const createLineKey = (itemId: string, mods: Record<string, string[]>) =>
    `${itemId}::${JSON.stringify(mods)}`;

  const addConfiguredToCart = (
    item: (typeof menuItems)[number],
    qty: number,
    mods: Record<string, string[]>,
  ) => {
    const modTotal = item.modifiers ? getModifiersTotal(item.modifiers, mods) : 0;
    const key = createLineKey(item.id, mods);
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx === -1) {
        return [...prev, { key, itemId: item.id, qty, selectedModifiers: mods, modifiersTotal: modTotal }];
      }
      return prev.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l));
    });
  };

  const updateBaseQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.itemId === itemId && Object.keys(l.selectedModifiers).length === 0);
      if (idx === -1) {
        if (delta <= 0) return prev;
        const key = createLineKey(itemId, {});
        return [...prev, { key, itemId, qty: delta, selectedModifiers: {}, modifiersTotal: 0 }];
      }
      const nextQty = prev[idx].qty + delta;
      if (nextQty <= 0) return prev.filter((_, i) => i !== idx);
      return prev.map((l, i) => (i === idx ? { ...l, qty: nextQty } : l));
    });
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
  };

  const openCustomize = (item: (typeof menuItems)[number]) => {
    setSelectedItem(item);
    setSelectedMods(getDefaultSelectedMods(item));
    setItemQty(1);
  };

  const closeCustomize = () => {
    setSelectedItem(null);
    setSelectedMods({});
    setItemQty(1);
  };

  const addSelectedItemToCart = () => {
    if (!selectedItem) return;
    addConfiguredToCart(selectedItem, itemQty, selectedMods);
    closeCustomize();
  };

  const totalItems = cart.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = cart.reduce((sum, l) => {
    const item = menuItems.find((m) => m.id === l.itemId);
    if (!item) return sum;
    return sum + (item.price + l.modifiersTotal) * l.qty;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAcceptingOnlineOrders()) {
      toast.error(orderingClosedMessage());
      return;
    }
    if (totalItems === 0) {
      toast.error("Please add items to your order");
      return;
    }
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error("Please fill in your name and phone number");
      return;
    }
    if (orderType === "delivery" && !formData.address.trim()) {
      toast.error("Please enter a delivery address");
      return;
    }

    setIsProcessing(true);
    try {
      const items = cart.map((line) => {
        const item = menuItems.find((m) => m.id === line.itemId)!;
        const modifierLines = item.modifiers
          ? getKitchenModifierLines(item.modifiers, line.selectedModifiers)
          : [];
        return {
          name: item.name,
          price: item.price + line.modifiersTotal,
          quantity: line.qty,
          ...(modifierLines.length > 0 ? { modifiers: modifierLines } : {}),
        };
      });

      // Save order to Firestore first
      const orderId = await createOrder({
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        items,
        total: totalPrice,
        order_type: orderType,
        notes: formData.notes,
        source: "web",
        payment: "card",
      });

      const checkoutUrl = await createValorCheckout({
        amount: totalPrice.toFixed(2),
        phone: formData.phone,
        email: formData.email,
        customerName: formData.name,
        invoiceNumber: orderId,
        productDescription: items
          .map((i) => `${i.quantity}x ${i.name}${i.modifiers?.length ? ` (${i.modifiers.join(", ")})` : ""}`)
          .join(", "),
      });
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      Sentry.captureException(error, { tags: { feature: "online-order-checkout" } });
      toast.error(error instanceof Error ? error.message : "Payment failed. Please try again.");
      setIsProcessing(false);
    }
  };

  if (submitted) {
    return (
      <section id="order" className="py-24 md:py-32 bg-card section-padding">
        <div className="max-w-2xl mx-auto text-center animate-fade-up">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-medium mb-4">Order Received!</h2>
          <p className="text-muted-foreground leading-relaxed mb-2">
            Thank you, {formData.name}. Your {orderType === "pickup" ? "pickup" : "delivery"} order of{" "}
            <span className="font-semibold text-foreground">${totalPrice.toFixed(2)}</span> has been placed.
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            We'll call <span className="font-medium text-foreground">{formData.phone}</span> to confirm your order shortly.
          </p>
          <button
            onClick={() => { setSubmitted(false); setCart([]); setFormData({ name: "", phone: "", email: "", address: "", notes: "" }); }}
            className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200"
          >
            Place Another Order
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="order" className="py-24 md:py-32 bg-card section-padding">
      <div ref={ref} className="max-w-5xl mx-auto opacity-0">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
            Order Online
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium text-balance">
            Fresh to Your Door or Ready for Pickup
          </h2>
        </div>

        {/* Order type toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-background rounded-sm p-1 border border-border">
            {(["pickup", "delivery"] as OrderType[]).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`px-6 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-sm transition-all duration-200 active:scale-[0.97] ${
                  orderType === type
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {type === "pickup" ? "Curbside Pickup" : "Delivery"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-sm text-amber-900 text-xs leading-relaxed">
          <strong className="font-semibold">Allergen notice:</strong> The tags shown are a guide based on
          primary ingredients. All items are prepared in a shared kitchen, so cross-contact is possible.
          If you have a severe allergy, please call us at{" "}
          <a href="tel:6366001333" className="underline font-medium">(636) 600-1333</a> before ordering.
        </div>

        <div className="grid lg:grid-cols-5 gap-12">
          {/* Menu items */}
          <div className="lg:col-span-3 space-y-10">
            {categories.map((cat) => (
              <div key={cat}>
                <h3 className="font-serif text-xl font-medium mb-4 pb-2 border-b border-border/60">
                  {cat}
                </h3>
                <div className="space-y-0">
                  {menuItems
                    .filter((i) => i.category === cat)
                    .map((item) => {
                      const baseLine = cart.find((l) => l.itemId === item.id && Object.keys(l.selectedModifiers).length === 0);
                      const qty = baseLine?.qty || 0;
                      const hasModifiers = !!(item.modifiers && item.modifiers.length > 0);
                      const modifierLineCount = cart.filter((l) => l.itemId === item.id && Object.keys(l.selectedModifiers).length > 0).length;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 py-4 border-b border-border/30 group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-sans font-semibold text-[15px] group-hover:text-accent transition-colors duration-200">
                                {item.name}
                              </span>
                              <span className="font-sans font-semibold text-sm text-foreground">
                                ${item.price.toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                            {(item.allergens?.length || item.vegetarian) && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {item.vegetarian && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-sans font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Vegetarian
                                  </span>
                                )}
                                {item.allergens?.map((a) => (
                                  <span
                                    key={a}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-sans font-medium bg-amber-50 text-amber-800 border border-amber-200"
                                    title={`Contains ${ALLERGEN_LABEL[a]}`}
                                  >
                                    {ALLERGEN_LABEL[a]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!hasModifiers && qty > 0 ? (
                              <>
                                <button
                                  onClick={() => updateBaseQty(item.id, -1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-95 transition-all"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-8 text-center text-sm font-semibold font-sans">
                                  {qty}
                                </span>
                                <button
                                  onClick={() => updateBaseQty(item.id, 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-sm bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => (hasModifiers ? openCustomize(item) : updateBaseQty(item.id, 1))}
                                className="px-4 py-1.5 text-xs font-sans font-semibold uppercase tracking-wider border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-95 transition-all"
                              >
                                {hasModifiers ? "Customize" : "Add"}
                              </button>
                            )}
                          </div>
                          {hasModifiers && modifierLineCount > 0 && (
                            <div className="text-[10px] text-muted-foreground mt-1.5">
                              {modifierLineCount} custom {modifierLineCount === 1 ? "selection" : "selections"} in cart
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          {/* Order summary & form */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 bg-background rounded-sm border border-border p-6 shadow-sm shadow-foreground/3">
              <div className="flex items-center gap-2 mb-6">
                <ShoppingBag className="w-5 h-5 text-accent" />
                <h3 className="font-serif text-lg font-medium">Your Order</h3>
                {totalItems > 0 && (
                  <span className="ml-auto text-xs font-sans font-semibold bg-accent text-accent-foreground px-2 py-0.5 rounded-sm">
                    {totalItems} {totalItems === 1 ? "item" : "items"}
                  </span>
                )}
              </div>

              {totalItems === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Add items from the menu to start your order.
                </p>
              ) : (
                <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                  {cart.map((line) => {
                    const item = menuItems.find((m) => m.id === line.itemId)!;
                    const selectedDetails = item.modifiers
                      ? getSelectedModifierDetails(item.modifiers, line.selectedModifiers)
                      : [];
                    const linePrice = (item.price + line.modifiersTotal) * line.qty;
                    return (
                      <div key={line.key} className="py-1.5 border-b border-border/30 last:border-b-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">
                            {line.qty}× {item.name}
                          </span>
                          <span className="font-semibold">${linePrice.toFixed(2)}</span>
                        </div>
                        {selectedDetails.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {selectedDetails.map((d) => `${d.name}${d.price > 0 ? ` +$${d.price.toFixed(2)}` : ""}`).join(" · ")}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  <div className="border-t border-border pt-3 mt-3 flex justify-between font-sans font-semibold">
                    <span>Total</span>
                    <span className="text-accent">${totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3 mt-6">
                <input
                  type="text"
                  placeholder="Your name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="tel"
                  placeholder="Phone number *"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                {orderType === "delivery" && (
                  <input
                    type="text"
                    placeholder="Delivery address *"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2.5 bg-card border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                  />
                )}
                <textarea
                  placeholder="Special instructions (optional)"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow resize-none"
                />
                {!isOpen && (
                  <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-sm text-amber-900 text-sm text-center">
                    {orderingClosedMessage()}
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  disabled={totalItems === 0 || isProcessing || !isOpen}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </>
                  ) : !isOpen ? (
                    <>Online Ordering Closed</>
                  ) : (
                    <>Pay & Place {orderType === "pickup" ? "Pickup" : "Delivery"} Order — ${totalPrice.toFixed(2)}</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      {selectedItem && (
        <>
          <div className="fixed inset-0 bg-foreground/40 z-50" onClick={closeCustomize} />
          <div className="fixed inset-2 sm:inset-6 md:inset-x-[20%] md:inset-y-[10%] max-h-[92dvh] bg-background border border-border rounded-sm z-50 flex flex-col overflow-hidden shadow-2xl">
            <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <h3 className="font-serif text-lg font-medium pr-2">{selectedItem.name}</h3>
              <button onClick={closeCustomize} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="px-3 py-2 border-b border-border/70 bg-muted/20">
              <p className="text-sm text-muted-foreground">{selectedItem.desc}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {selectedItem.modifiers && (
                <ModifierSelector
                  groups={selectedItem.modifiers}
                  selected={selectedMods}
                  onChange={setSelectedMods}
                />
              )}
            </div>
            <footer className="border-t border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-accent">
                  $
                  {(
                    (selectedItem.price +
                      (selectedItem.modifiers ? getModifiersTotal(selectedItem.modifiers, selectedMods) : 0)) *
                    itemQty
                  ).toFixed(2)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setItemQty(Math.max(1, itemQty - 1))}
                    className="w-9 h-9 rounded-sm border border-border flex items-center justify-center"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-semibold">{itemQty}</span>
                  <button
                    type="button"
                    onClick={() => setItemQty(itemQty + 1)}
                    className="w-9 h-9 rounded-sm border border-border flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={addSelectedItemToCart}
                className="w-full py-2.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90"
              >
                Add to Order
              </button>
            </footer>
          </div>
        </>
      )}
    </section>
  );
};

export default OnlineOrder;
