import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
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
  HandMetal,
  Banknote,
} from "lucide-react";
import { menuItems, categories, MenuItem } from "@/data/menu";
import { toast } from "sonner";
import { sendCreditSale, dollarsToCents } from "@/lib/valor";
import { ValorEPI, getEPIs } from "@/lib/valor-epi";
import { createOrder } from "@/lib/orders";
import heroImage from "@/assets/hero-food.jpg";
import ModifierSelector, { getModifiersTotal, getSelectedModifierNames, getSelectedModifierDetails } from "@/components/ModifierSelector";
import { useAuth } from "@/context/AuthContext";

type KioskStep = "welcome" | "order-type" | "categories" | "items" | "item-detail" | "cart";
type OrderType = "dine-in" | "take-out";

interface CartItem {
  item: MenuItem;
  qty: number;
  selectedModifiers: Record<string, string[]>;
  modifiersTotal: number;
}

const KioskPage = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [step, setStep] = useState<KioskStep>("welcome");
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [epis] = useState<ValorEPI[]>(() => getEPIs());
  const [selectedEpi, setSelectedEpi] = useState<string>(epis[0]?.wsUrl || "");

  const totalItems = cart.reduce((s, c) => s + c.qty, 0);
  const totalPrice = cart.reduce((s, c) => s + (c.item.price + c.modifiersTotal) * c.qty, 0);

  // ── Inactivity timeout: reset to welcome after 2 min of no touch ──
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    // Only start timer if not on welcome screen and not processing payment
    if (step !== "welcome" && !isProcessing) {
      inactivityTimer.current = setTimeout(() => {
        setStep("welcome");
        setOrderType(null);
        setSelectedCategory(null);
        setSelectedItem(null);
        setItemQty(1);
        setCart([]);
        setSearchQuery("");
        setSelectedMods({});
      }, INACTIVITY_MS);
    }
  }, [step, isProcessing]);

  // Reset timer on any touch/click/scroll
  useEffect(() => {
    const events = ["touchstart", "mousedown", "scroll", "keydown"];
    const handler = () => resetInactivityTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivityTimer]);

  const categoryImages: Record<string, string> = {};
  categories.forEach((cat) => {
    const first = menuItems.find((m) => m.category === cat);
    if (first) categoryImages[cat] = first.image;
  });

  const addToCart = (item: MenuItem, qty: number, mods: Record<string, string[]>) => {
    const modTotal = item.modifiers ? getModifiersTotal(item.modifiers, mods) : 0;
    const modKey = JSON.stringify(mods);
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id && JSON.stringify(c.selectedModifiers) === modKey);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id && JSON.stringify(c.selectedModifiers) === modKey
            ? { ...c, qty: c.qty + qty }
            : c
        );
      }
      return [...prev, { item, qty, selectedModifiers: mods, modifiersTotal: modTotal }];
    });
    toast.success(`${qty}× ${item.name} added`, { duration: 1000 });
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev.map((c, i) => (i === index ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const buildOrderItems = () =>
    cart.map((c) => ({
      name: c.item.name,
      quantity: c.qty,
      price: c.item.price + c.modifiersTotal,
    }));

  const saveKioskOrder = async (payment: "card" | "cash", extra?: { auth_code?: string; masked_pan?: string; rrn?: string }) => {
    await createOrder({
      customer_name: orderType === "dine-in" ? "Dine-In Customer" : "Take-Out Customer",
      customer_email: "",
      customer_phone: "Kiosk Order",
      items: buildOrderItems(),
      total: totalPrice * 1.08,
      order_type: orderType || "dine-in",
      notes: `Kiosk ${orderType} order`,
      source: "kiosk",
      payment,
      payment_status: payment === "cash" ? "unpaid" : "paid",
      terminal_epi: selectedEpi || undefined,
      ...extra,
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const totalWithTax = totalPrice * 1.08;
      const lineItems = cart.map((c) => ({
        product_code: c.item.name,
        quantity: c.qty.toString(),
        total: ((c.item.price + c.modifiersTotal) * c.qty).toFixed(2),
      }));

      const result = await sendCreditSale({
        amountCents: dollarsToCents(totalWithTax),
        tipEnabled: false,
        printReceipt: true,
        lineItems,
        wsUrl: selectedEpi || undefined,
      });

      await saveKioskOrder("card", {
        auth_code: result.CODE,
        masked_pan: result.MASKED_PAN,
        rrn: result.RRN,
      });

      toast.success("Payment approved! Thank you.", { duration: 1000 });
      resetOrder();
    } catch (error) {
      console.error("Kiosk checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
      setIsProcessing(false);
    }
  };

  const resetOrder = () => {
    setStep("welcome");
    setOrderType(null);
    setSelectedCategory(null);
    setSelectedItem(null);
    setItemQty(1);
    setCart([]);
    setSearchQuery("");
    setSelectedMods({});
  };

  const FloatingCartButton = () => {
    if (totalItems === 0 || step === "welcome" || step === "order-type" || step === "cart") return null;
    return (
      <button
        onClick={() => setStep("cart")}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 bg-accent text-accent-foreground font-sans font-bold text-base rounded-full shadow-2xl shadow-accent/30 hover:opacity-90 active:scale-[0.95] transition-all animate-fade-up"
      >
        <ShoppingBag className="w-5 h-5" />
        <span>${totalPrice.toFixed(2)}</span>
        <span className="w-7 h-7 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
          {totalItems}
        </span>
      </button>
    );
  };

  const TopBar = ({ backLabel, onBack }: { backLabel: string; onBack: () => void }) => (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-6 py-3">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all">
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
        <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
        <button onClick={() => setStep("cart")} className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-sans font-semibold text-sm rounded-sm hover:opacity-90 active:scale-[0.97] transition-all">
          <ShoppingBag className="w-4 h-4" />
          ${totalPrice.toFixed(2)}
          {totalItems > 0 && (
            <span className="ml-1 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );

  // ===== STEP 1: WELCOME SCREEN =====
  if (step === "welcome") {
    return (
      <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden cursor-pointer select-none" onClick={() => setStep("order-type")}>
        <img src={heroImage} alt="Fenton Gyro" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-primary/70" />
        <div className="relative z-10 flex flex-col items-center text-center px-8">
          <p className="font-serif text-lg font-medium text-primary-foreground/80 mb-4 tracking-wider uppercase">Fenton Gyro</p>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-bold text-primary-foreground leading-tight mb-8 animate-fade-up">
            Order & Pay<br />Here
          </h1>
          <p className="text-primary-foreground/70 font-sans text-lg md:text-xl animate-fade-up" style={{ animationDelay: "200ms" }}>Touch screen to begin</p>
          <HandMetal className="w-10 h-10 text-primary-foreground/50 mt-8 animate-bounce" />
        </div>
        {/* Staff controls — bottom corners */}
        <div className="absolute bottom-4 left-4 z-20" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={async () => { await signOut(); navigate("/auth?redirect=/kiosk"); }}
            className="bg-primary-foreground/10 text-primary-foreground/60 text-xs font-sans px-3 py-1.5 rounded-sm border border-primary-foreground/20 hover:text-primary-foreground/80"
          >
            Sign Out
          </button>
        </div>
        {epis.length > 1 && (
          <div className="absolute bottom-4 right-4 z-20" onClick={(e) => e.stopPropagation()}>
            <select
              value={selectedEpi}
              onChange={(e) => setSelectedEpi(e.target.value)}
              className="bg-primary-foreground/10 text-primary-foreground/60 text-xs font-sans px-2 py-1.5 rounded-sm border border-primary-foreground/20 focus:outline-none"
            >
              {epis.map((epi) => (
                <option key={epi.id} value={epi.wsUrl} className="text-foreground bg-background">
                  {epi.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  // ===== STEP 2: ORDER TYPE =====
  if (step === "order-type") {
    return (
      <div className="h-screen flex flex-col relative overflow-hidden">
        <img src={heroImage} alt="Fenton Gyro" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-primary/70" />
        <header className="relative z-10 flex items-center justify-between px-6 py-3 bg-background/90 backdrop-blur-sm border-b border-border">
          <button onClick={() => setStep("welcome")} className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
          <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground font-sans font-semibold text-sm">
            <ShoppingBag className="w-4 h-4" /> $0.00
          </div>
        </header>
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
          <h2 className="font-serif text-3xl md:text-5xl font-bold text-primary-foreground mb-12 text-center animate-fade-up">Is this for here or to go?</h2>
          <div className="flex gap-6 md:gap-10 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <button onClick={() => { setOrderType("dine-in"); setStep("categories"); }} className="w-40 h-40 md:w-52 md:h-52 bg-background rounded-xl shadow-2xl flex flex-col items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all duration-200">
              <UtensilsCrossed className="w-12 h-12 md:w-16 md:h-16 text-accent" />
              <span className="font-sans font-bold text-lg md:text-xl text-foreground">Eat In</span>
            </button>
            <button onClick={() => { setOrderType("take-out"); setStep("categories"); }} className="w-40 h-40 md:w-52 md:h-52 bg-background rounded-xl shadow-2xl flex flex-col items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all duration-200">
              <Package className="w-12 h-12 md:w-16 md:h-16 text-accent" />
              <span className="font-sans font-bold text-lg md:text-xl text-foreground">Take Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const searchResults = searchQuery.trim()
    ? menuItems.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  // ===== STEP 3: CATEGORIES =====
  if (step === "categories") {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <TopBar backLabel="Dining Option" onBack={() => setStep("order-type")} />
        <div className="px-4 pt-3 pb-1 w-full shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search menu items..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-card border border-border rounded-sm font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <main className="flex-1 p-4 overflow-hidden">
          {searchQuery.trim() ? (
            <div className="h-full flex flex-col">
              <p className="text-xs uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-2 shrink-0">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
              {searchResults.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Search className="w-12 h-12 text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground font-sans">No items found</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-min content-start">
                  {searchResults.map((item) => (
                    <button key={item.id} onClick={() => { setSelectedItem(item); setSelectedCategory(item.category); setItemQty(1); setSelectedMods({}); setStep("item-detail"); setSearchQuery(""); }} className="bg-card border border-border rounded-sm p-3 flex items-center gap-3 text-left hover:shadow-md active:scale-[0.97] transition-all">
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-0.5">{item.category}</p>
                        <h3 className="font-serif text-sm font-medium text-foreground truncate">{item.name}</h3>
                        <p className="text-sm font-sans font-semibold text-accent">${item.price.toFixed(2)}</p>
                      </div>
                      <img src={item.image} alt={item.name} className="w-12 h-12 rounded-sm object-cover shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full grid grid-cols-2 gap-3 auto-rows-fr">
              {categories.map((cat, i) => (
                <button key={cat} onClick={() => { setSelectedCategory(cat); setStep("items"); }} className="relative overflow-hidden rounded-sm group active:scale-[0.97] transition-all duration-200" style={{ animationDelay: `${i * 80}ms` }}>
                  <img src={categoryImages[cat]} alt={cat} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                  <span className="absolute inset-0 flex items-center justify-center font-serif text-xl md:text-2xl font-medium text-primary-foreground drop-shadow-lg">{cat}</span>
                </button>
              ))}
            </div>
          )}
        </main>
        <FloatingCartButton />
      </div>
    );
  }

  // ===== STEP 4: ITEMS =====
  if (step === "items" && selectedCategory) {
    const filteredItems = menuItems.filter((m) => m.category === selectedCategory);
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar backLabel="All Categories" onBack={() => setStep("categories")} />
        <div className="relative h-32 md:h-40 overflow-hidden">
          <img src={categoryImages[selectedCategory]} alt={selectedCategory} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/30 to-transparent" />
          <h2 className="absolute bottom-4 left-6 font-serif text-2xl md:text-3xl font-medium text-primary-foreground drop-shadow-lg">{selectedCategory}</h2>
        </div>
        <main className="flex-1 p-6">
          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-4">
            {filteredItems.map((item, i) => (
              <button key={item.id} onClick={() => { setSelectedItem(item); setItemQty(1); setSelectedMods({}); setStep("item-detail"); }} className="bg-card border border-border rounded-sm p-4 flex items-center gap-4 text-left hover:shadow-md active:scale-[0.97] transition-all animate-fade-up opacity-0" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-base font-medium text-foreground mb-1 truncate">{item.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.desc}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-sm font-sans font-semibold text-accent">${item.price.toFixed(2)}</p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <span className="text-[9px] uppercase tracking-wider font-sans font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Customizable</span>
                    )}
                  </div>
                </div>
                <img src={item.image} alt={item.name} className="w-20 h-20 rounded-sm object-cover shrink-0" />
              </button>
            ))}
          </div>
        </main>
        <FloatingCartButton />
      </div>
    );
  }

  // ===== STEP 5: ITEM DETAIL =====
  if (step === "item-detail" && selectedItem) {
    const modsTotal = selectedItem.modifiers ? getModifiersTotal(selectedItem.modifiers, selectedMods) : 0;
    const detailTotal = (selectedItem.price + modsTotal) * itemQty;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-6 py-3">
            <button onClick={() => setStep("items")} className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all">
              <ArrowLeft className="w-4 h-4" /> Menu
            </button>
            <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
            <div className="w-16" />
          </div>
        </header>
        <main className="flex-1 p-6 animate-fade-up opacity-0">
          <div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-8">
            <div>
              <img src={selectedItem.image} alt={selectedItem.name} className="w-full aspect-square object-cover rounded-sm mb-6" />
              <h2 className="font-serif text-2xl font-medium mb-2">{selectedItem.name}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm mb-6">{selectedItem.desc}</p>

              {/* Modifiers */}
              {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
                <div className="mb-6 pb-6 border-b border-border">
                  <ModifierSelector groups={selectedItem.modifiers} selected={selectedMods} onChange={setSelectedMods} />
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-sans font-bold text-accent">${detailTotal.toFixed(2)}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setItemQty(Math.max(1, itemQty - 1))} className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-sans font-bold text-lg">{itemQty}</span>
                  <button onClick={() => setItemQty(itemQty + 1)} className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => { addToCart(selectedItem, itemQty, selectedMods); setStep("items"); setSelectedMods({}); }}
                className="w-full py-4 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-accent/20"
              >
                <ShoppingBag className="w-4 h-4" />
                Add to Cart — ${detailTotal.toFixed(2)}
              </button>
            </div>
            <div className="hidden md:block">
              {selectedItem.tag && (
                <div className="bg-accent/10 border border-accent/20 rounded-sm p-4 mb-4">
                  <span className="text-xs uppercase tracking-wider font-sans font-semibold text-accent">{selectedItem.tag}</span>
                </div>
              )}
              <div className="bg-card border border-border rounded-sm p-6">
                <h3 className="font-serif text-lg font-medium mb-3">Order Details</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <span className="font-semibold text-foreground">Type:</span> {orderType === "dine-in" ? "Eat In" : "Take Out"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  <span className="font-semibold text-foreground">Category:</span> {selectedCategory}
                </p>
                {cart.length > 0 && (
                  <div className="border-t border-border pt-3 mt-3">
                    <p className="text-xs uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-2">In Your Cart</p>
                    {cart.map((c, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1">
                        <span>{c.qty}× {c.item.name}</span>
                        <span className="font-semibold">${((c.item.price + c.modifiersTotal) * c.qty).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-border mt-2 pt-2 flex justify-between font-sans font-semibold text-accent">
                      <span>Total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
        <FloatingCartButton />
      </div>
    );
  }

  // ===== STEP 6: CART =====
  if (step === "cart") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-6 py-3">
            <button onClick={() => setStep("categories")} className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all">
              <ArrowLeft className="w-4 h-4" /> Continue Shopping
            </button>
            <p className="font-serif text-lg font-medium text-foreground">Your Order</p>
            <button onClick={resetOrder} className="text-xs font-sans font-semibold text-destructive hover:underline">Cancel Order</button>
          </div>
        </header>
        <main className="flex-1 p-6 animate-fade-up opacity-0">
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-sans font-semibold text-xs uppercase tracking-wider rounded-sm">
                {orderType === "dine-in" ? (<><UtensilsCrossed className="w-3.5 h-3.5" /> Eat In</>) : (<><Package className="w-3.5 h-3.5" /> Take Out</>)}
              </span>
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-20">
                <ShoppingBag className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-sans">Your cart is empty</p>
                <button onClick={() => setStep("categories")} className="mt-4 px-6 py-2.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all">Browse Menu</button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  {cart.map((c, idx) => {
                    const modDetails = c.item.modifiers ? getSelectedModifierDetails(c.item.modifiers, c.selectedModifiers) : [];
                    const linePrice = (c.item.price + c.modifiersTotal) * c.qty;
                    return (
                      <div key={idx} className="bg-card border border-border rounded-sm p-4">
                        <div className="flex items-start gap-4">
                          <img src={c.item.image} alt={c.item.name} className="w-16 h-16 rounded-sm object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-serif text-sm font-medium">{c.item.name}</h3>
                              <p className="text-sm text-accent font-sans font-bold shrink-0 ml-2">${linePrice.toFixed(2)}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">${c.item.price.toFixed(2)} each × {c.qty}</p>
                            {modDetails.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                                {modDetails.map((mod, mi) => (
                                  <div key={mi} className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                      <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                                      {mod.name}
                                    </span>
                                    <span className="font-sans font-semibold text-foreground/70 shrink-0">
                                      {mod.price > 0 ? `+$${mod.price.toFixed(2)}` : "Free"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateCartQty(idx, -1)} className="w-8 h-8 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold">{c.qty}</span>
                            <button onClick={() => updateCartQty(idx, 1)} className="w-8 h-8 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-90 transition-all">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button onClick={() => removeFromCart(idx)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-90 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-card border border-border rounded-sm p-5 mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
                    <span className="font-sans font-semibold">${totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-muted-foreground">Tax (estimated)</span>
                    <span className="font-sans font-semibold">${(totalPrice * 0.08).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between">
                    <span className="font-sans font-bold text-lg">Total</span>
                    <span className="font-sans font-bold text-lg text-accent">${(totalPrice * 1.08).toFixed(2)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleCheckout} disabled={isProcessing} className="py-4 bg-accent text-accent-foreground font-sans font-semibold text-base uppercase tracking-wider rounded-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>) : (<><CreditCard className="w-5 h-5" /> Tap to Pay</>)}
                  </button>
                  <button
                    onClick={async () => {
                      await saveKioskOrder("cash");
                      toast.success("Order placed! Please pay at the counter.", { duration: 1000 });
                      resetOrder();
                    }}
                    disabled={isProcessing}
                    className="py-4 bg-primary text-primary-foreground font-sans font-semibold text-base uppercase tracking-wider rounded-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Banknote className="w-5 h-5" /> Pay at Counter
                  </button>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-3">Total: ${(totalPrice * 1.08).toFixed(2)}</p>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return <FloatingCartButton />;
};

const KioskPageWithAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth?redirect=/kiosk" replace />;
  }

  return <KioskPage />;
};

export default KioskPageWithAuth;
