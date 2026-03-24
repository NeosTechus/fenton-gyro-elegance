import { useState } from "react";
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
} from "lucide-react";
import { menuItems, categories, MenuItem } from "@/data/menu";
import { createCheckoutSession } from "@/lib/stripe";
import { toast } from "sonner";

type PosStep = "categories" | "items" | "item-detail" | "cart";
type OrderType = "dine-in" | "take-out";

interface CartItem {
  item: MenuItem;
  qty: number;
}

const POSPage = () => {
  const [step, setStep] = useState<PosStep>("categories");
  const [orderType, setOrderType] = useState<OrderType | null>("dine-in");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const totalItems = cart.reduce((s, c) => s + c.qty, 0);
  const totalPrice = cart.reduce((s, c) => s + c.item.price * c.qty, 0);

  // Category images: pick first item image per category
  const categoryImages: Record<string, string> = {};
  categories.forEach((cat) => {
    const first = menuItems.find((m) => m.category === cat);
    if (first) categoryImages[cat] = first.image;
  });

  const addToCart = (item: MenuItem, qty: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [...prev, { item, qty }];
    });
    toast.success(`${qty}× ${item.name} added`);
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const items = cart.map((c) => ({
        name: c.item.name,
        price: c.item.price,
        quantity: c.qty,
      }));
      const checkoutUrl = await createCheckoutSession(items, "pickup", {
        name: orderType === "dine-in" ? "Dine-In Customer" : "Take-Out Customer",
        phone: "POS Order",
        email: "",
        address: "",
        notes: `POS ${orderType} order`,
      });
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("POS checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
      setIsProcessing(false);
    }
  };

  const resetOrder = () => {
    setStep("categories");
    setOrderType("dine-in");
    setSelectedCategory(null);
    setSelectedItem(null);
    setItemQty(1);
    setCart([]);
  };

  // --- SCREENS ---

  // Top bar (shared across steps)
  const TopBar = ({ backLabel, onBack }: { backLabel: string; onBack: () => void }) => (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-6 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
        <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
        <button
          onClick={() => setStep("cart")}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-sans font-semibold text-sm rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
        >
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

  // Filtered items for search
  const searchResults = searchQuery.trim()
    ? menuItems.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Categories Screen
  if (step === "categories") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar backLabel="Home" onBack={() => window.history.back()} />

        {/* Search Bar */}
        <div className="px-6 pt-4 pb-2 max-w-3xl mx-auto w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-card border border-border rounded-sm font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <main className="flex-1 p-6">
          {searchQuery.trim() ? (
            <div className="max-w-3xl mx-auto">
              <p className="text-xs uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-3">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </p>
              {searchResults.length === 0 ? (
                <div className="text-center py-16">
                  <Search className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground font-sans">No items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {searchResults.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item);
                        setSelectedCategory(item.category);
                        setItemQty(1);
                        setStep("item-detail");
                        setSearchQuery("");
                      }}
                      className="bg-card border border-border rounded-sm p-4 flex items-center gap-4 text-left hover-lift active:scale-[0.97] transition-all animate-fade-up opacity-0"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-1">
                          {item.category}
                        </p>
                        <h3 className="font-serif text-base font-medium text-foreground mb-1 truncate">
                          {item.name}
                        </h3>
                        <p className="text-sm font-sans font-semibold text-accent">
                          ${item.price.toFixed(2)}
                        </p>
                      </div>
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-16 h-16 rounded-sm object-cover shrink-0"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto animate-fade-up opacity-0">
              {categories.map((cat, i) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setStep("items");
                  }}
                  className="relative overflow-hidden rounded-sm aspect-[16/10] group active:scale-[0.97] transition-all duration-200"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <img
                    src={categoryImages[cat]}
                    alt={cat}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                  <span className="absolute inset-0 flex items-center justify-center font-serif text-xl md:text-2xl font-medium text-primary-foreground drop-shadow-lg">
                    {cat}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Items Screen
  if (step === "items" && selectedCategory) {
    const filteredItems = menuItems.filter((m) => m.category === selectedCategory);
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar backLabel="All Categories" onBack={() => setStep("categories")} />

        {/* Category hero banner */}
        <div className="relative h-32 md:h-40 overflow-hidden">
          <img
            src={categoryImages[selectedCategory]}
            alt={selectedCategory}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/30 to-transparent" />
          <h2 className="absolute bottom-4 left-6 font-serif text-2xl md:text-3xl font-medium text-primary-foreground drop-shadow-lg">
            {selectedCategory}
          </h2>
        </div>

        <main className="flex-1 p-6">
          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-4">
            {filteredItems.map((item, i) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedItem(item);
                  setItemQty(1);
                  setStep("item-detail");
                }}
                className="bg-card border border-border rounded-sm p-4 flex items-center gap-4 text-left hover-lift active:scale-[0.97] transition-all animate-fade-up opacity-0"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-base font-medium text-foreground mb-1 truncate">
                    {item.name}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.desc}
                  </p>
                  <p className="text-sm font-sans font-semibold text-accent mt-2">
                    ${item.price.toFixed(2)}
                  </p>
                </div>
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-sm object-cover shrink-0"
                />
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Item Detail Screen
  if (step === "item-detail" && selectedItem) {
    const detailTotal = selectedItem.price * itemQty;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-6 py-3">
            <button
              onClick={() => setStep("items")}
              className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Menu
            </button>
            <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
            <div className="w-16" />
          </div>
        </header>

        <main className="flex-1 p-6 animate-fade-up opacity-0">
          <div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-8">
            {/* Left: Image & Info */}
            <div>
              <img
                src={selectedItem.image}
                alt={selectedItem.name}
                className="w-full aspect-square object-cover rounded-sm mb-6"
              />
              <h2 className="font-serif text-2xl font-medium mb-2">{selectedItem.name}</h2>
              <p className="text-muted-foreground leading-relaxed text-sm mb-6">
                {selectedItem.desc}
              </p>

              {/* Price & Quantity */}
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-sans font-bold text-accent">
                  ${detailTotal.toFixed(2)}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setItemQty(Math.max(1, itemQty - 1))}
                    className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-sans font-bold text-lg">{itemQty}</span>
                  <button
                    onClick={() => setItemQty(itemQty + 1)}
                    className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Add to Cart */}
              <button
                onClick={() => {
                  addToCart(selectedItem, itemQty);
                  setStep("items");
                }}
                className="w-full py-4 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-accent/20"
              >
                <ShoppingBag className="w-4 h-4" />
                Add to Cart — ${detailTotal.toFixed(2)}
              </button>
            </div>

            {/* Right: Additional info placeholder */}
            <div className="hidden md:block">
              {selectedItem.tag && (
                <div className="bg-accent/10 border border-accent/20 rounded-sm p-4 mb-4">
                  <span className="text-xs uppercase tracking-wider font-sans font-semibold text-accent">
                    {selectedItem.tag}
                  </span>
                </div>
              )}
              <div className="bg-card border border-border rounded-sm p-6">
                <h3 className="font-serif text-lg font-medium mb-3">Order Details</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <span className="font-semibold text-foreground">Type:</span>{" "}
                  {orderType === "dine-in" ? "Dine In" : "Take Out"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  <span className="font-semibold text-foreground">Category:</span>{" "}
                  {selectedCategory}
                </p>
                {cart.length > 0 && (
                  <>
                    <div className="border-t border-border pt-3 mt-3">
                      <p className="text-xs uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-2">
                        In Your Cart
                      </p>
                      {cart.map((c) => (
                        <div key={c.item.id} className="flex justify-between text-sm py-1">
                          <span>{c.qty}× {c.item.name}</span>
                          <span className="font-semibold">${(c.item.price * c.qty).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t border-border mt-2 pt-2 flex justify-between font-sans font-semibold text-accent">
                        <span>Total</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Cart / Checkout Screen
  if (step === "cart") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-6 py-3">
            <button
              onClick={() => setStep("categories")}
              className="flex items-center gap-2 text-sm font-sans font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Continue Shopping
            </button>
            <p className="font-serif text-lg font-medium text-foreground">Your Order</p>
            <button
              onClick={resetOrder}
              className="text-xs font-sans font-semibold text-destructive hover:underline"
            >
              Cancel Order
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 animate-fade-up opacity-0">
          <div className="max-w-xl mx-auto">
            {/* Order type badge */}
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-sans font-semibold text-xs uppercase tracking-wider rounded-sm">
                {orderType === "dine-in" ? (
                  <><UtensilsCrossed className="w-3.5 h-3.5" /> Dine In</>
                ) : (
                  <><Package className="w-3.5 h-3.5" /> Take Out</>
                )}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-20">
                <ShoppingBag className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-sans">Your cart is empty</p>
                <button
                  onClick={() => setStep("categories")}
                  className="mt-4 px-6 py-2.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <>
                {/* Cart items */}
                <div className="space-y-3 mb-6">
                  {cart.map((c) => (
                    <div key={c.item.id} className="bg-card border border-border rounded-sm p-4 flex items-center gap-4">
                      <img
                        src={c.item.image}
                        alt={c.item.name}
                        className="w-16 h-16 rounded-sm object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-serif text-sm font-medium truncate">{c.item.name}</h3>
                        <p className="text-sm text-accent font-sans font-semibold">
                          ${(c.item.price * c.qty).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => updateCartQty(c.item.id, -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{c.qty}</span>
                        <button
                          onClick={() => updateCartQty(c.item.id, 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-90 transition-all"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(c.item.id)}
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-90 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Totals */}
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
                    <span className="font-sans font-bold text-lg text-accent">
                      ${(totalPrice * 1.08).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Pay button */}
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full py-4 bg-accent text-accent-foreground font-sans font-semibold text-base uppercase tracking-wider rounded-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.97] transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Tap to Pay — ${(totalPrice * 1.08).toFixed(2)}
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-muted-foreground mt-3">
                  Payments securely processed via Stripe
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Fallback
  return null;
};

export default POSPage;
