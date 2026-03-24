import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingBag,
  UtensilsCrossed,
  Package,
  Minus,
  Plus,
  X,
  Trash2,
  CreditCard,
  Loader2,
  Search,
  Hash,
  RotateCcw,
  Banknote,
} from "lucide-react";
import { menuItems, categories, MenuItem } from "@/data/menu";
import { createCheckoutSession } from "@/lib/stripe";
import { toast } from "sonner";
import ModifierSelector, { getModifiersTotal, getSelectedModifierNames, getSelectedModifierDetails } from "@/components/ModifierSelector";

type OrderType = "dine-in" | "take-out";

interface CartItem {
  item: MenuItem;
  qty: number;
  selectedModifiers: Record<string, string[]>;
  modifiersTotal: number;
}

const POSPage = () => {
  const navigate = useNavigate();
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [orderNumber] = useState(() => Math.floor(100 + Math.random() * 900));

  const totalItems = cart.reduce((s, c) => s + c.qty, 0);
  const totalPrice = cart.reduce((s, c) => s + (c.item.price + c.modifiersTotal) * c.qty, 0);

  const addToCart = (item: MenuItem, qty: number, mods: Record<string, string[]>) => {
    const modTotal = item.modifiers ? getModifiersTotal(item.modifiers, mods) : 0;
    const modKey = JSON.stringify(mods);
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id && JSON.stringify(c.selectedModifiers) === modKey);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id && JSON.stringify(c.selectedModifiers) === modKey ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [...prev, { item, qty, selectedModifiers: mods, modifiersTotal: modTotal }];
    });
    // silent add — no toast to avoid obstructing POS buttons
  };

  // Quick add (no modifiers, 1 qty)
  const quickAdd = (item: MenuItem) => {
    addToCart(item, 1, {});
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0));
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const items = cart.flatMap((c) => {
        const lineItems = [{ name: c.item.name, price: c.item.price, quantity: c.qty }];
        if (c.item.modifiers) {
          const modNames = getSelectedModifierNames(c.item.modifiers, c.selectedModifiers);
          const modTotal = c.modifiersTotal;
          if (modTotal > 0 && modNames.length > 0) {
            lineItems.push({ name: `  ↳ ${modNames.join(", ")}`, price: modTotal, quantity: c.qty });
          }
        }
        return lineItems;
      });
      const checkoutUrl = await createCheckoutSession(items, "pickup", {
        name: orderType === "dine-in" ? "Dine-In Customer" : "Take-Out Customer",
        phone: "POS Order",
        email: "",
        address: "",
        notes: `POS ${orderType} order #${orderNumber}`,
      });
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("POS checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
      setIsProcessing(false);
    }
  };

  const resetOrder = () => {
    setCart([]);
    setSelectedItem(null);
    setItemQty(1);
    setSelectedMods({});
    setSearchQuery("");
    toast("Order cleared");
  };

  const filteredItems = searchQuery.trim()
    ? menuItems.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase()))
    : menuItems.filter((m) => m.category === selectedCategory);

  // Item detail modal
  const ItemDetailModal = () => {
    if (!selectedItem) return null;
    const modsTotal = selectedItem.modifiers ? getModifiersTotal(selectedItem.modifiers, selectedMods) : 0;
    const detailTotal = (selectedItem.price + modsTotal) * itemQty;

    return (
      <>
        <div className="fixed inset-0 bg-foreground/40 z-50" onClick={() => { setSelectedItem(null); setSelectedMods({}); setItemQty(1); }} />
        <div className="fixed inset-4 md:inset-x-[15%] md:inset-y-[5%] bg-background border border-border rounded-sm z-50 flex flex-col overflow-hidden shadow-2xl">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="font-serif text-lg font-medium">{selectedItem.name}</h2>
            <button onClick={() => { setSelectedItem(null); setSelectedMods({}); setItemQty(1); }} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all">
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <img src={selectedItem.image} alt={selectedItem.name} className="w-full aspect-[4/3] object-cover rounded-sm mb-4" />
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedItem.desc}</p>
                {selectedItem.tag && (
                  <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-sans font-semibold text-accent bg-accent/10 px-2 py-1 rounded">{selectedItem.tag}</span>
                )}
              </div>
              <div>
                {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
                  <div className="mb-5">
                    <ModifierSelector groups={selectedItem.modifiers} selected={selectedMods} onChange={setSelectedMods} />
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-sans font-bold text-accent">${detailTotal.toFixed(2)}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setItemQty(Math.max(1, itemQty - 1))} className="w-9 h-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-sans font-bold text-lg">{itemQty}</span>
                    <button onClick={() => setItemQty(itemQty + 1)} className="w-9 h-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { addToCart(selectedItem, itemQty, selectedMods); setSelectedItem(null); setSelectedMods({}); setItemQty(1); }}
                  className="w-full py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Add — ${detailTotal.toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="h-screen bg-muted flex flex-col overflow-hidden">
      {/* POS Top Bar */}
      <header className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-xs font-sans font-semibold text-primary-foreground/70 hover:text-primary-foreground active:scale-95 transition-all">
            <ArrowLeft className="w-3.5 h-3.5" />
            Exit
          </button>
          <div className="h-4 w-px bg-primary-foreground/20" />
          <span className="font-serif text-sm font-medium">Fenton Gyro</span>
          <span className="text-[10px] uppercase tracking-wider font-sans font-semibold bg-primary-foreground/15 text-primary-foreground/80 px-2 py-0.5 rounded">POS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-primary-foreground/70">
            <Hash className="w-3 h-3" />
            Order #{orderNumber}
          </span>
          {/* Order type toggle */}
          <div className="flex bg-primary-foreground/10 rounded-sm overflow-hidden">
            <button
              onClick={() => setOrderType("dine-in")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold transition-all ${orderType === "dine-in" ? "bg-primary-foreground text-primary" : "text-primary-foreground/60 hover:text-primary-foreground"}`}
            >
              <UtensilsCrossed className="w-3 h-3" /> Dine In
            </button>
            <button
              onClick={() => setOrderType("take-out")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold transition-all ${orderType === "take-out" ? "bg-primary-foreground text-primary" : "text-primary-foreground/60 hover:text-primary-foreground"}`}
            >
              <Package className="w-3 h-3" /> Take Out
            </button>
          </div>
        </div>
      </header>

      {/* Main split layout: Menu (left) + Cart (right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Menu panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category tabs + search */}
          <div className="bg-background border-b border-border px-3 pt-2 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Quick search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 bg-muted border border-border rounded-sm font-sans text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {!searchQuery.trim() && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 text-sm font-sans font-semibold rounded-sm whitespace-nowrap transition-all active:scale-95 ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items grid — compact for staff speed */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.modifiers && item.modifiers.length > 0) {
                      setSelectedItem(item);
                      setItemQty(1);
                      setSelectedMods({});
                    } else {
                      quickAdd(item);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedItem(item);
                    setItemQty(1);
                    setSelectedMods({});
                  }}
                  className="bg-background border border-border rounded-sm p-2 text-left hover:border-accent/50 hover:shadow-sm active:scale-[0.97] transition-all group relative"
                >
                  <img src={item.image} alt={item.name} className="w-full aspect-square object-cover rounded-sm mb-1.5" />
                  <h3 className="font-sans text-[11px] font-semibold text-foreground leading-tight truncate">{item.name}</h3>
                  <p className="text-[11px] font-sans font-bold text-accent">${item.price.toFixed(2)}</p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" title="Has customizations" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Cart sidebar */}
        <div className="w-72 lg:w-80 bg-background border-l border-border flex flex-col shrink-0">
          {/* Cart header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-accent" />
              <span className="font-sans font-bold text-sm">
                {totalItems} {totalItems === 1 ? "item" : "items"}
              </span>
            </div>
            {cart.length > 0 && (
              <button onClick={resetOrder} className="flex items-center gap-1 text-[10px] font-sans font-semibold text-destructive hover:underline">
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingBag className="w-10 h-10 text-muted-foreground/15 mb-2" />
                <p className="text-xs text-muted-foreground">Tap items to add</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((c, idx) => {
                  const modDetails = c.item.modifiers ? getSelectedModifierDetails(c.item.modifiers, c.selectedModifiers) : [];
                  const linePrice = (c.item.price + c.modifiersTotal) * c.qty;
                  return (
                    <div key={idx} className="bg-muted/50 border border-border rounded-sm p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-sans text-xs font-semibold truncate">{c.item.name}</h4>
                            <button onClick={() => removeFromCart(idx)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {modDetails.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {modDetails.map((mod, mi) => (
                                <div key={mi} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                                    {mod.name}
                                  </span>
                                  {mod.price > 0 && (
                                    <span className="font-semibold text-foreground/60">+${mod.price.toFixed(2)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateCartQty(idx, -1)} className="w-6 h-6 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold">{c.qty}</span>
                          <button onClick={() => updateCartQty(idx, 1)} className="w-6 h-6 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-90 transition-all">
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <span className="text-xs font-sans font-bold text-accent">${linePrice.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart footer / checkout */}
          {cart.length > 0 && (
            <div className="border-t border-border px-4 py-3 space-y-2 shrink-0">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">${totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tax</span>
                <span className="font-semibold text-foreground">${(totalPrice * 0.08).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-sans font-bold text-sm">Total</span>
                <span className="font-sans font-bold text-sm text-accent">${(totalPrice * 1.08).toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  ) : (
                    <><CreditCard className="w-4 h-4" /> Tap to Pay</>
                  )}
                </button>
                <button
                  onClick={() => {
                    toast.success(`Cash order #${orderNumber} confirmed — $${(totalPrice * 1.08).toFixed(2)}`);
                    setCart([]);
                    setSelectedItem(null);
                    setItemQty(1);
                    setSelectedMods({});
                  }}
                  disabled={isProcessing}
                  className="py-3 bg-primary text-primary-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Banknote className="w-4 h-4" /> Pay Cash
                </button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground mt-1">Total: ${(totalPrice * 1.08).toFixed(2)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Item detail modal */}
      {selectedItem && <ItemDetailModal />}
    </div>
  );
};

export default POSPage;
