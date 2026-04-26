import { useState, useEffect, useRef } from "react";
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
  Hash,
  RotateCcw,
  Banknote,
} from "lucide-react";
import { menuItems, categories, MenuItem } from "@/data/menu";
import { toast } from "sonner";
import ModifierSelector, { getModifiersTotal, getSelectedModifierNames, getSelectedModifierDetails } from "@/components/ModifierSelector";
import { useAuth } from "@/context/AuthContext";
import { LogOut, ClipboardList } from "lucide-react";
import { sendCreditSale, dollarsToCents, cancelValorTransaction, ValorCancelledError, warmupValor } from "@/lib/valor";
import { computeTotals } from "@/lib/pricing";
import { ValorEPI, getEPIs } from "@/lib/valor-epi";
import { createOrder, subscribeToOrders, markOrderPaid, updateOrderStatus } from "@/lib/orders";
import { Order, OrderStatus } from "@/data/orders";
import { DollarSign, ChevronDown, BarChart3 } from "lucide-react";

type OrderType = "dine-in" | "take-out";

interface CartItem {
  item: MenuItem;
  qty: number;
  selectedModifiers: Record<string, string[]>;
  modifiersTotal: number;
}

const POSPage = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [orderNumber] = useState(() => Math.floor(100 + Math.random() * 900));
  const [epis] = useState<ValorEPI[]>(() => getEPIs());
  const [selectedEpiId, setSelectedEpiId] = useState<string>(epis[0]?.id || "");
  const selectedTerminal = epis.find((e) => e.id === selectedEpiId);
  const selectedEpi = selectedTerminal?.id || "";
  const selectedAppKey = selectedTerminal?.appKey || "";
  const [showHistory, setShowHistory] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState<"today" | "month" | "3months">("today");
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState("today");
  const [historySourceFilter, setHistorySourceFilter] = useState("all");

  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [showPendingPayments, setShowPendingPayments] = useState(false);
  const [expandedUnpaidOrder, setExpandedUnpaidOrder] = useState<string | null>(null);
  const [splitPayment, setSplitPayment] = useState<{ orderId: string; cashAmount: string } | null>(null);
  const [posSplitMode, setPosSplitMode] = useState(false);
  const [posSplitCash, setPosSplitCash] = useState("");
  const [inFlightTxnId, setInFlightTxnId] = useState<string | null>(null);
  const [cashFallbackOpen, setCashFallbackOpen] = useState(false);
  const switchedToCashRef = useRef(false);
  const [unpaidInFlight, setUnpaidInFlight] = useState<{ orderId: string; txnId: string | null } | null>(null);
  const [unpaidCashFallback, setUnpaidCashFallback] = useState<{ orderId: string; tag: string; total: number } | null>(null);
  const [cashCollectConfirm, setCashCollectConfirm] = useState<{ orderId: string; tag: string; total: number } | null>(null);
  const [newOrderCashConfirm, setNewOrderCashConfirm] = useState(false);
  const [cashTendered, setCashTendered] = useState("");
  const [switchToCashConfirm, setSwitchToCashConfirm] = useState(false);
  const unpaidSwitchedRef = useRef<Set<string>>(new Set());

  // Real-time order history — all sources
  useEffect(() => {
    const unsubscribe = subscribeToOrders((orders) => {
      setOrderHistory(orders);
      setUnpaidOrders(orders.filter((o) => o.payment_status === "unpaid" && o.status !== "cancelled"));
    });
    return () => unsubscribe();
  }, []);

  // Warm Valor lambdas on mount + every 4 min so first sale after idle
  // doesn't pay a Vercel cold-start delay before the terminal is reached.
  useEffect(() => {
    if (!selectedEpi || !selectedAppKey) return;
    warmupValor(selectedEpi, selectedAppKey);
    const id = setInterval(() => warmupValor(selectedEpi, selectedAppKey), 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [selectedEpi, selectedAppKey]);

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

  const buildOrderItems = () =>
    cart.map((c) => {
      const mods = c.item.modifiers ? getSelectedModifierNames(c.item.modifiers, c.selectedModifiers) : [];
      return {
        name: c.item.name,
        quantity: c.qty,
        price: c.item.price + c.modifiersTotal,
        ...(mods.length > 0 ? { modifiers: mods } : {}),
      };
    });

  const saveOrder = async (payment: "card" | "cash", extra?: { auth_code?: string; masked_pan?: string; rrn?: string }) => {
    const { total } = computeTotals(totalPrice, payment);
    await createOrder({
      customer_name: orderType === "dine-in" ? "Dine-In Customer" : "Take-Out Customer",
      customer_email: "",
      customer_phone: "",
      items: buildOrderItems(),
      total,
      order_type: orderType,
      notes: `POS Order #${orderNumber}`,
      source: "pos",
      payment,
      terminal_epi: selectedEpi || undefined,
      ...extra,
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    switchedToCashRef.current = false;
    setIsProcessing(true);
    try {
      // Send pre-surcharge amount; the Valor terminal applies its own
      // card surcharge on top. Sending the card total would double-charge.
      const { total: totalWithTax } = computeTotals(totalPrice, "cash");
      const lineItems = cart.map((c) => ({
        product_code: c.item.name,
        quantity: c.qty.toString(),
        total: ((c.item.price + c.modifiersTotal) * c.qty).toFixed(2),
      }));

      const result = await sendCreditSale({
        amountCents: dollarsToCents(totalWithTax),
        tipEnabled: true,
        printReceipt: true,
        invoiceNumber: orderNumber.toString(),
        lineItems,
        epi: selectedEpi,
        appkey: selectedAppKey,
        onTxnId: (id) => setInFlightTxnId(id),
      });

      const tenderedCash = /cash/i.test(String(result.TRAN_TYPE || "")) || !result.MASKED_PAN;
      if (tenderedCash) {
        await saveOrder("cash");
        toast.success(`Cash collected at terminal — $${computeTotals(totalPrice, "cash").total.toFixed(2)}`, { duration: 2000 });
      } else {
        await saveOrder("card", {
          auth_code: result.CODE,
          masked_pan: result.MASKED_PAN,
          rrn: result.RRN,
        });
        toast.success(
          `Payment approved — ${result.ISSUER} ${result.MASKED_PAN} | Auth: ${result.CODE}`,
          { duration: 2000 }
        );
      }
      resetOrder();
    } catch (error) {
      if (switchedToCashRef.current) return; // user already chose cash; ignore late cancel
      if (error instanceof ValorCancelledError) {
        setCashFallbackOpen(true);
        return;
      }
      console.error("POS checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      if (!switchedToCashRef.current) {
        setIsProcessing(false);
        setInFlightTxnId(null);
      }
    }
  };

  const handleSwitchToCash = async () => {
    switchedToCashRef.current = true;
    const toCancel = inFlightTxnId;
    setInFlightTxnId(null);
    setIsProcessing(false);
    if (toCancel) {
      // Fire-and-forget cancel; terminal will abort. Don't block the UI.
      cancelValorTransaction(selectedEpi, selectedAppKey, toCancel);
    }
    try {
      await saveOrder("cash");
      toast.success("Order saved as cash payment", { duration: 2000 });
      resetOrder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  };

  const handleUnpaidCardPay = async (order: Order, tag: string) => {
    setUnpaidInFlight({ orderId: order.id, txnId: null });
    try {
      const result = await sendCreditSale({
        amountCents: dollarsToCents(order.total),
        tipEnabled: true,
        printReceipt: true,
        invoiceNumber: order.id,
        epi: selectedEpi,
        appkey: selectedAppKey,
        onTxnId: (id) => setUnpaidInFlight({ orderId: order.id, txnId: id }),
      });
      await markOrderPaid(order.id);
      const tenderedCash = /cash/i.test(String(result.TRAN_TYPE || "")) || !result.MASKED_PAN;
      if (tenderedCash) {
        toast.success(`Cash collected at terminal for ${tag}`, { duration: 2000 });
      } else {
        toast.success(`Card payment for ${tag} — ${result.ISSUER} ${result.MASKED_PAN}`, { duration: 2000 });
      }
      setExpandedUnpaidOrder(null);
    } catch (err) {
      if (unpaidSwitchedRef.current.has(order.id)) {
        unpaidSwitchedRef.current.delete(order.id);
        return;
      }
      if (err instanceof ValorCancelledError) {
        setUnpaidCashFallback({ orderId: order.id, tag, total: order.total });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Card payment failed");
    } finally {
      if (!unpaidSwitchedRef.current.has(order.id)) {
        setUnpaidInFlight((cur) => (cur?.orderId === order.id ? null : cur));
      }
    }
  };

  const handleUnpaidSwitchToCash = async (orderId: string, tag: string) => {
    unpaidSwitchedRef.current.add(orderId);
    const txnId = unpaidInFlight?.orderId === orderId ? unpaidInFlight.txnId : null;
    setUnpaidInFlight(null);
    if (txnId) cancelValorTransaction(selectedEpi, selectedAppKey, txnId);
    try {
      await markOrderPaid(orderId);
      toast.success(`Cash payment for ${tag}`, { duration: 2000 });
      setExpandedUnpaidOrder(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark paid");
    }
  };

  const handleConfirmUnpaidCashFallback = async () => {
    if (!unpaidCashFallback) return;
    const { orderId, tag } = unpaidCashFallback;
    setUnpaidCashFallback(null);
    try {
      await markOrderPaid(orderId);
      toast.success(`Cash payment for ${tag}`, { duration: 2000 });
      setExpandedUnpaidOrder(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark paid");
    }
  };

  const handleConfirmCashFallback = async () => {
    setCashFallbackOpen(false);
    try {
      await saveOrder("cash");
      toast.success("Order saved as cash payment", { duration: 2000 });
      resetOrder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  };

  const resetOrder = () => {
    setCart([]);
    setSelectedItem(null);
    setItemQty(1);
    setSelectedMods({});
    setSearchQuery("");
    
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
                {selectedItem.image && <img src={selectedItem.image} alt={selectedItem.name} className="w-full aspect-[4/3] object-cover rounded-sm mb-4" />}
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
          <button onClick={async () => { await signOut(); navigate("/auth?redirect=/pos"); }} className="flex items-center gap-1.5 text-xs font-sans font-semibold text-primary-foreground/70 hover:text-primary-foreground active:scale-95 transition-all">
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
          <div className="h-4 w-px bg-primary-foreground/20" />
          <span className="font-serif text-sm font-medium">Fenton Gyro</span>
          <span className="text-[10px] uppercase tracking-wider font-sans font-semibold bg-primary-foreground/15 text-primary-foreground/80 px-2 py-0.5 rounded">POS</span>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-sm transition-all ${
              showHistory
                ? "bg-primary-foreground text-primary"
                : "bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Orders ({orderHistory.length})
          </button>
          <button
            onClick={() => { setShowAnalytics(!showAnalytics); setShowHistory(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-sm transition-all ${
              showAnalytics
                ? "bg-primary-foreground text-primary"
                : "bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Analytics
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-primary-foreground/70">
            <Hash className="w-3 h-3" />
            Order #{orderNumber}
          </span>
          {/* Terminal selector */}
          {epis.length > 0 && (
            <select
              value={selectedEpiId}
              onChange={(e) => setSelectedEpiId(e.target.value)}
              className="bg-primary-foreground/10 text-primary-foreground text-xs font-sans font-semibold px-2 py-1.5 rounded-sm border-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {epis.map((epi) => (
                <option key={epi.id} value={epi.id} className="text-foreground bg-background">
                  {epi.label}
                </option>
              ))}
            </select>
          )}
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

      {/* Pending Cash Payments from Kiosk — collapsible dropdown */}
      {unpaidOrders.length > 0 && (
        <div className="shrink-0 relative">
          <button
            onClick={() => setShowPendingPayments(!showPendingPayments)}
            className="w-full bg-amber-50 border-b-2 border-amber-200 px-4 py-2 flex items-center justify-between hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-sans font-bold text-amber-800">
                {unpaidOrders.length} Pending Payment{unpaidOrders.length > 1 ? "s" : ""}
              </span>
              <span className="text-xs font-bold text-amber-700">
                — ${unpaidOrders.reduce((s, o) => s + o.total, 0).toFixed(2)} total
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform ${showPendingPayments ? "rotate-180" : ""}`} />
          </button>

          {showPendingPayments && (
            <div className="absolute top-full left-0 right-0 z-40 bg-amber-50 border-b-2 border-amber-200 shadow-lg max-h-[50vh] overflow-y-auto">
              <div className="p-3 space-y-2">
                {unpaidOrders.map((order) => {
                  const isExpanded = expandedUnpaidOrder === order.id;
                  const tag = `#${order.id.slice(0, 6).toUpperCase()}`;
                  const timeAgo = () => {
                    const diff = Date.now() - new Date(order.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    return `${Math.floor(mins / 60)}h ago`;
                  };

                  return (
                    <div key={order.id} className="bg-white border border-amber-200 rounded-sm overflow-hidden">
                      {/* Order summary row — tap to expand */}
                      <button
                        onClick={() => setExpandedUnpaidOrder(isExpanded ? null : order.id)}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-amber-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-amber-700">{tag}</span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-700">KIOSK</span>
                          <span className="text-sm font-bold text-amber-900">{order.customer_name}</span>
                          <span className="text-[10px] text-amber-600">
                            · {order.items.length} item{order.items.length > 1 ? "s" : ""}
                          </span>
                          <span className="text-[10px] text-muted-foreground">· {timeAgo()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-amber-800">${order.total.toFixed(2)}</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-amber-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-amber-100">
                          {/* Items */}
                          <div className="px-3 py-2 space-y-1">
                            {order.items.map((item, i) => (
                              <div key={i} className="text-xs">
                                <div className="flex justify-between">
                                  <span>
                                    <span className="text-muted-foreground">{item.quantity}x</span>{" "}
                                    {item.name}
                                  </span>
                                  <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="ml-4 text-[10px] text-muted-foreground">+ {item.modifiers.join(", ")}</div>
                                )}
                              </div>
                            ))}
                            <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-amber-100 mt-1.5">
                              <span>Total</span>
                              <span className="text-amber-800">${order.total.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-2 text-[10px] text-muted-foreground pt-1">
                              <span className="capitalize">{order.order_type}</span>
                              {order.notes && <span>· {order.notes}</span>}
                            </div>
                          </div>

                          {/* Action buttons */}
                          {splitPayment?.orderId === order.id ? (
                            <div className="px-3 py-3 bg-blue-50 space-y-2">
                              <p className="text-[10px] font-sans font-bold text-blue-800 uppercase tracking-wider">Split Payment — ${order.total.toFixed(2)}</p>
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <label className="text-[9px] text-blue-600 font-semibold uppercase">Cash Amount</label>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-blue-400">$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={order.total}
                                      value={splitPayment.cashAmount}
                                      onChange={(e) => setSplitPayment({ ...splitPayment, cashAmount: e.target.value })}
                                      className="w-full pl-5 pr-2 py-2 bg-white border border-blue-200 rounded-sm text-sm font-bold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      autoFocus
                                    />
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <label className="text-[9px] text-blue-600 font-semibold uppercase">Card Amount</label>
                                  <div className="py-2 px-2 bg-blue-100 border border-blue-200 rounded-sm text-sm font-bold text-blue-800 text-center">
                                    ${Math.max(0, order.total - (parseFloat(splitPayment.cashAmount) || 0)).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  onClick={async () => {
                                    const cashAmt = parseFloat(splitPayment.cashAmount) || 0;
                                    const cardAmt = Math.max(0, order.total - cashAmt);
                                    if (cardAmt > 0) {
                                      try {
                                        await sendCreditSale({
                                          amountCents: dollarsToCents(cardAmt),
                                          tipEnabled: false,
                                          printReceipt: true,
                                          invoiceNumber: order.id,
                                          epi: selectedEpi,
        appkey: selectedAppKey,
                                        });
                                      } catch (err) {
                                        toast.error(err instanceof Error ? err.message : "Card payment failed");
                                        return;
                                      }
                                    }
                                    await markOrderPaid(order.id);
                                    toast.success(`Split payment: $${cashAmt.toFixed(2)} cash + $${cardAmt.toFixed(2)} card`, { duration: 3000 });
                                    setSplitPayment(null);
                                    setExpandedUnpaidOrder(null);
                                  }}
                                  className="py-2.5 bg-emerald-600 text-white text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.95] transition-all"
                                >
                                  Confirm Split
                                </button>
                                <button
                                  onClick={() => setSplitPayment(null)}
                                  className="py-2.5 bg-muted text-muted-foreground text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.95] transition-all"
                                >
                                  Back
                                </button>
                              </div>
                            </div>
                          ) : (
                          <div className="grid grid-cols-4 gap-1.5 px-3 py-2 bg-amber-50/50">
                            <button
                              onClick={() => setCashCollectConfirm({ orderId: order.id, tag, total: order.total })}
                              className="py-2.5 bg-emerald-600 text-white text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.95] transition-all"
                            >
                              💵 Cash
                            </button>
                            {unpaidInFlight?.orderId === order.id ? (
                              <button
                                onClick={() => handleUnpaidSwitchToCash(order.id, tag)}
                                className="py-2.5 bg-primary text-primary-foreground text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.95] transition-all flex items-center justify-center gap-1"
                              >
                                <Banknote className="w-3 h-3" /> Pay Cash Instead
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUnpaidCardPay(order, tag)}
                                disabled={!!unpaidInFlight}
                                className="py-2.5 bg-blue-600 text-white text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-blue-700 active:scale-[0.95] transition-all disabled:opacity-50"
                              >
                                💳 Card
                              </button>
                            )}
                            <button
                              onClick={() => setSplitPayment({ orderId: order.id, cashAmount: (order.total / 2).toFixed(2) })}
                              className="py-2.5 bg-violet-600 text-white text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-violet-700 active:scale-[0.95] transition-all"
                            >
                              ✂️ Split
                            </button>
                            <button
                              onClick={async () => {
                                // Abort any in-flight Valor txn for this order
                                if (unpaidInFlight?.orderId === order.id) {
                                  unpaidSwitchedRef.current.add(order.id);
                                  const txnId = unpaidInFlight.txnId;
                                  setUnpaidInFlight(null);
                                  if (txnId) cancelValorTransaction(selectedEpi, selectedAppKey, txnId);
                                }
                                // Clear any split-payment input state for this order
                                if (splitPayment?.orderId === order.id) {
                                  setSplitPayment(null);
                                }
                                // Clear any pending cash-fallback for this order
                                if (unpaidCashFallback?.orderId === order.id) {
                                  setUnpaidCashFallback(null);
                                }
                                try {
                                  await updateOrderStatus(order.id, "cancelled");
                                  toast.success(`Order ${tag} cancelled`, { duration: 2000 });
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed to cancel order");
                                } finally {
                                  unpaidSwitchedRef.current.delete(order.id);
                                  setExpandedUnpaidOrder(null);
                                }
                              }}
                              className="py-2.5 bg-red-600 text-white text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-red-700 active:scale-[0.95] transition-all"
                            >
                              ❌ Cancel
                            </button>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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

          {/* Items grid — large touch targets */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
                  className="bg-background border-2 border-border rounded-md p-3 text-left hover:border-accent/50 hover:shadow-md active:scale-[0.96] transition-all group relative"
                >
                  {item.image && <img src={item.image} alt={item.name} className="w-full aspect-[4/3] object-cover rounded-sm mb-2" />}
                  <h3 className="font-sans text-sm font-bold text-foreground leading-snug truncate">{item.name}</h3>
                  <p className="text-sm font-sans font-bold text-accent mt-0.5">${item.price.toFixed(2)}</p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <span className="absolute top-2 right-2 w-3 h-3 rounded-full bg-accent" title="Has customizations" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Cart sidebar */}
        <div className="w-80 lg:w-96 bg-background border-l border-border flex flex-col shrink-0">
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
              {(() => {
                const card = computeTotals(totalPrice, "card");
                const cash = computeTotals(totalPrice, "cash");
                return (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-semibold text-foreground">${card.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Tax (8.238%)</span>
                      <span className="font-semibold text-foreground">${card.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Card surcharge (4%)</span>
                      <span>${card.surcharge.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="font-sans font-bold text-sm">Card total</span>
                      <span className="font-sans font-bold text-sm text-accent">${card.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Cash total</span>
                      <span>${cash.total.toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
              {posSplitMode ? (
                <div className="space-y-2 bg-violet-50 border border-violet-200 rounded-md p-3">
                  <p className="text-[10px] font-sans font-bold text-violet-800 uppercase tracking-wider">Split Payment — ${computeTotals(totalPrice, "card").total.toFixed(2)} (surcharge auto-applied to card portion)</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-violet-600 font-semibold uppercase">Cash</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-violet-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={computeTotals(totalPrice, "cash").total}
                          value={posSplitCash}
                          onChange={(e) => setPosSplitCash(e.target.value)}
                          className="w-full pl-5 pr-2 py-2 bg-white border border-violet-200 rounded-sm text-sm font-bold text-violet-800 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-violet-600 font-semibold uppercase">Card</label>
                      <div className="py-2 px-2 bg-violet-100 border border-violet-200 rounded-sm text-sm font-bold text-violet-800 text-center">
                        ${Math.max(0, computeTotals(totalPrice, "cash").total - (parseFloat(posSplitCash) || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        const total = computeTotals(totalPrice, "cash").total;
                        const cashAmt = parseFloat(posSplitCash) || 0;
                        const cardAmt = Math.max(0, total - cashAmt);
                        setIsProcessing(true);
                        try {
                          if (cardAmt > 0) {
                            await sendCreditSale({
                              amountCents: dollarsToCents(cardAmt),
                              tipEnabled: false,
                              printReceipt: true,
                              invoiceNumber: orderNumber.toString(),
                              epi: selectedEpi,
        appkey: selectedAppKey,
                            });
                          }
                          await saveOrder("card", {});
                          toast.success(`Split: $${cashAmt.toFixed(2)} cash + $${cardAmt.toFixed(2)} card`, { duration: 3000 });
                          setPosSplitMode(false);
                          setPosSplitCash("");
                          resetOrder();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Card payment failed");
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      disabled={isProcessing}
                      className="py-3 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.95] transition-all disabled:opacity-50"
                    >
                      {isProcessing ? "Processing…" : "Confirm Split"}
                    </button>
                    <button
                      onClick={() => { setPosSplitMode(false); setPosSplitCash(""); }}
                      className="py-3 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.95] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isProcessing ? (
                <div className="space-y-2">
                  <div className="py-3 px-3 rounded-md bg-accent/15 border border-accent/40 flex items-center gap-2 text-xs font-sans font-semibold text-accent-foreground">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Waiting for terminal — total ${computeTotals(totalPrice, "card").total.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSwitchToCashConfirm(true)}
                      className="py-3 bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all shadow-md"
                    >
                      <Banknote className="w-4 h-4" /> Pay Cash Instead
                    </button>
                    <button
                      onClick={() => {
                        switchedToCashRef.current = true; // stop the in-flight handler from firing error toast
                        const toCancel = inFlightTxnId;
                        setInFlightTxnId(null);
                        setIsProcessing(false);
                        if (toCancel) cancelValorTransaction(selectedEpi, selectedAppKey, toCancel);
                        setPosSplitMode(true);
                        setPosSplitCash((computeTotals(totalPrice, "cash").total / 2).toFixed(2));
                      }}
                      className="py-3 bg-violet-600 text-white font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all shadow-md"
                    >
                      ✂️ Split Instead
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleCheckout}
                      disabled={isProcessing}
                      className="py-4 bg-accent text-accent-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      <CreditCard className="w-4 h-4" /> Card
                    </button>
                    <button
                      onClick={() => { setCashTendered(""); setNewOrderCashConfirm(true); }}
                      disabled={isProcessing}
                      className="py-4 bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      <Banknote className="w-4 h-4" /> Cash
                    </button>
                    <button
                      onClick={() => { setPosSplitMode(true); setPosSplitCash((computeTotals(totalPrice, "cash").total / 2).toFixed(2)); }}
                      disabled={isProcessing}
                      className="py-4 bg-violet-600 text-white font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      ✂️ Split
                    </button>
                  </div>
                  <p className="text-center text-xs text-muted-foreground mt-1">Card total: ${computeTotals(totalPrice, "card").total.toFixed(2)} · Cash total: ${computeTotals(totalPrice, "cash").total.toFixed(2)}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item detail modal */}
      {selectedItem && <ItemDetailModal />}

      {/* Confirm switching a live terminal txn to cash */}
      {switchToCashConfirm && (
        <div className="fixed inset-0 bg-foreground/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">Cash collected?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cancel the terminal transaction and save order #{orderNumber} as cash for <strong>${computeTotals(totalPrice, "cash").total.toFixed(2)}</strong>?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSwitchToCashConfirm(false);
                  handleSwitchToCash();
                }}
                className="py-2.5 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96]"
              >
                Yes — collected
              </button>
              <button
                onClick={() => setSwitchToCashConfirm(false)}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm cash collection for a new POS order — with change calculator */}
      {newOrderCashConfirm && (() => {
        const cashTotal = computeTotals(totalPrice, "cash").total;
        const tendered = parseFloat(cashTendered) || 0;
        const change = Math.max(0, tendered - cashTotal);
        const insufficient = tendered > 0 && tendered < cashTotal;
        const canConfirm = tendered >= cashTotal;
        const quickBills = [cashTotal, 20, 50, 100];
        return (
          <div className="fixed inset-0 bg-foreground/40 z-[60] flex items-center justify-center p-4">
            <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
              <h3 className="font-display text-lg font-bold text-foreground mb-1">Cash payment — Order #{orderNumber}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Total due: <strong className="text-foreground">${cashTotal.toFixed(2)}</strong>
              </p>

              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Cash received</label>
              <div className="relative mt-1 mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full pl-7 pr-3 py-2.5 bg-muted/40 border border-border rounded-sm text-lg font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {quickBills.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => setCashTendered(b.toFixed(2))}
                    className="py-1.5 text-xs font-sans font-bold bg-muted hover:bg-muted/70 rounded-sm active:scale-95 transition-all"
                  >
                    {i === 0 ? "Exact" : `$${b}`}
                  </button>
                ))}
              </div>

              <div className={`rounded-sm p-3 mb-3 ${insufficient ? "bg-destructive/10 border border-destructive/30" : "bg-emerald-50 border border-emerald-200"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-sans font-semibold uppercase tracking-wider ${insufficient ? "text-destructive" : "text-emerald-700"}`}>
                    {insufficient ? "Short by" : "Change due"}
                  </span>
                  <span className={`text-xl font-sans font-bold ${insufficient ? "text-destructive" : "text-emerald-700"}`}>
                    ${(insufficient ? cashTotal - tendered : change).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!canConfirm}
                  onClick={async () => {
                    setNewOrderCashConfirm(false);
                    const changeGiven = change;
                    const cashIn = tendered;
                    try {
                      await saveOrder("cash");
                      toast.success(
                        changeGiven > 0
                          ? `Cash $${cashIn.toFixed(2)} · Change $${changeGiven.toFixed(2)}`
                          : `Cash order #${orderNumber} — $${cashTotal.toFixed(2)}`,
                        { duration: 2500 }
                      );
                      resetOrder();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to save order");
                    }
                  }}
                  className="py-2.5 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm & Save
                </button>
                <button
                  onClick={() => setNewOrderCashConfirm(false)}
                  className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm cash collection for pending kiosk/unpaid cash order */}
      {cashCollectConfirm && (
        <div className="fixed inset-0 bg-foreground/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">Cash collected?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Confirm you received <strong>${cashCollectConfirm.total.toFixed(2)}</strong> in cash for order <strong>{cashCollectConfirm.tag}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const { orderId, tag } = cashCollectConfirm;
                  setCashCollectConfirm(null);
                  try {
                    await markOrderPaid(orderId);
                    toast.success(`Cash collected for ${tag}`, { duration: 2000 });
                    setExpandedUnpaidOrder(null);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to mark paid");
                  }
                }}
                className="py-2.5 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96]"
              >
                Yes — collected
              </button>
              <button
                onClick={() => setCashCollectConfirm(null)}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash fallback for unpaid order card payment */}
      {unpaidCashFallback && (
        <div className="fixed inset-0 bg-foreground/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">Card payment cancelled</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Order <strong>{unpaidCashFallback.tag}</strong> — did the customer pay <strong>${unpaidCashFallback.total.toFixed(2)}</strong> in cash instead?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleConfirmUnpaidCashFallback}
                className="py-2.5 bg-primary text-primary-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.96]"
              >
                Yes — save as cash
              </button>
              <button
                onClick={() => setUnpaidCashFallback(null)}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
              >
                No — keep unpaid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash fallback dialog — shown when terminal txn cancels */}
      {cashFallbackOpen && (
        <div className="fixed inset-0 bg-foreground/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">Card payment cancelled</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Did the customer pay <strong>${computeTotals(totalPrice, "cash").total.toFixed(2)}</strong> in cash instead?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleConfirmCashFallback}
                className="py-2.5 bg-primary text-primary-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.96]"
              >
                Yes — save as cash
              </button>
              <button
                onClick={() => setCashFallbackOpen(false)}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
              >
                No — discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order history slide-over */}
      {showHistory && (
        <>
          <div className="fixed inset-0 bg-foreground/30 z-50" onClick={() => setShowHistory(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-96 bg-background border-l border-border z-50 flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-accent" />
                <h2 className="font-sans font-bold text-sm">Order History</h2>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Filters */}
            <div className="px-3 py-2 border-b border-border space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, ID, or phone..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-muted border border-border rounded-sm text-xs font-sans focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-muted border border-border rounded-sm text-xs font-sans focus:outline-none"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="all">All Time</option>
                </select>
                <select
                  value={historySourceFilter}
                  onChange={(e) => setHistorySourceFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-muted border border-border rounded-sm text-xs font-sans focus:outline-none"
                >
                  <option value="all">All Sources</option>
                  <option value="pos">POS</option>
                  <option value="kiosk">Kiosk</option>
                  <option value="web">Web</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {(() => {
                const now = new Date();
                const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0,0,0,0);

                const filtered = orderHistory.filter((order) => {
                  // Date filter
                  const orderDate = new Date(order.created_at);
                  if (historyDateFilter === "today" && orderDate < todayStart) return false;
                  if (historyDateFilter === "week" && orderDate < weekStart) return false;

                  // Source filter
                  if (historySourceFilter !== "all" && order.source !== historySourceFilter) return false;

                  // Search filter
                  if (historySearch.trim()) {
                    const q = historySearch.toLowerCase();
                    const matchName = order.customer_name.toLowerCase().includes(q);
                    const matchPhone = order.customer_phone.toLowerCase().includes(q);
                    const matchId = order.id.toLowerCase().includes(q);
                    const matchItems = order.items.some((i) => i.name.toLowerCase().includes(q));
                    if (!matchName && !matchPhone && !matchId && !matchItems) return false;
                  }

                  return true;
                });

                if (filtered.length === 0) return (
                  <div className="text-center py-12">
                    <ClipboardList className="w-10 h-10 text-muted-foreground/15 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No orders found</p>
                  </div>
                );

                return filtered.map((order) => {
                  const statusColors: Record<string, string> = {
                    pending: "bg-yellow-100 text-yellow-800",
                    received: "bg-blue-100 text-blue-700",
                    preparing: "bg-orange-100 text-orange-700",
                    ready: "bg-emerald-100 text-emerald-700",
                    completed: "bg-primary/10 text-primary",
                    cancelled: "bg-red-100 text-red-700",
                  };
                  const timeAgo = () => {
                    const diff = Date.now() - new Date(order.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    return `${hrs}h ago`;
                  };
                  return (
                    <div key={order.id} className="bg-card border border-border rounded-sm p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-accent">
                            #{order.id.slice(0, 6).toUpperCase()}
                          </span>
                          {order.source && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-sans font-bold tracking-wider ${
                              order.source === "pos" ? "bg-blue-100 text-blue-700" :
                              order.source === "kiosk" ? "bg-purple-100 text-purple-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>
                              {order.source.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold ${statusColors[order.status] || ""}`}>
                            {order.status.toUpperCase()}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{timeAgo()}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1 space-y-0.5">
                        {order.items.map((i, idx) => (
                          <div key={idx}>
                            <div>{i.quantity}x {i.name}</div>
                            {i.modifiers && i.modifiers.length > 0 && (
                              <div className="ml-4 text-[10px] opacity-80">+ {i.modifiers.join(", ")}</div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-border/50">
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {order.order_type} · {order.payment || "card"}
                        </span>
                        <span className="font-sans font-bold text-xs text-accent">${order.total.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}

      {/* Analytics slide-over */}
      {showAnalytics && (
        <>
          <div className="fixed inset-0 bg-foreground/30 z-50" onClick={() => setShowAnalytics(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" />
                <h2 className="font-sans font-bold text-sm">Sales Analytics</h2>
              </div>
              <button onClick={() => setShowAnalytics(false)} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Time range filter */}
            <div className="px-4 py-2 border-b border-border shrink-0">
              <div className="flex bg-muted rounded-sm p-0.5">
                {([
                  { key: "today", label: "Today" },
                  { key: "month", label: "This Month" },
                  { key: "3months", label: "3 Months" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setAnalyticsRange(opt.key)}
                    className={`flex-1 py-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                      analyticsRange === opt.key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(() => {
                const now = new Date();
                const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);

                const rangeStart = analyticsRange === "today" ? todayStart
                  : analyticsRange === "month" ? monthStart
                  : threeMonthsStart;

                const filteredOrders = orderHistory.filter((o) => new Date(o.created_at) >= rangeStart);
                const activeOrders = filteredOrders.filter((o) => o.status !== "cancelled");
                const totalRevenue = activeOrders.reduce((s, o) => s + o.total, 0);
                const totalOrders = activeOrders.length;
                const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

                // Item sales
                const itemCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
                activeOrders.forEach((order) => {
                  order.items.forEach((item) => {
                    if (!itemCounts[item.name]) itemCounts[item.name] = { name: item.name, qty: 0, revenue: 0 };
                    itemCounts[item.name].qty += item.quantity;
                    itemCounts[item.name].revenue += item.price * item.quantity;
                  });
                });
                const topItems = Object.values(itemCounts).sort((a, b) => b.qty - a.qty);

                // Source breakdown
                const bySource = { pos: 0, kiosk: 0, web: 0 };
                const revenueBySource = { pos: 0, kiosk: 0, web: 0 };
                activeOrders.forEach((o) => {
                  const src = (o.source || "pos") as keyof typeof bySource;
                  bySource[src] = (bySource[src] || 0) + 1;
                  revenueBySource[src] = (revenueBySource[src] || 0) + o.total;
                });

                // Payment breakdown
                const byPayment = { card: 0, cash: 0 };
                activeOrders.forEach((o) => {
                  const pay = (o.payment || "card") as keyof typeof byPayment;
                  byPayment[pay] = (byPayment[pay] || 0) + 1;
                });

                // Hourly breakdown
                const hourly: Record<number, number> = {};
                activeOrders.forEach((o) => {
                  const hr = new Date(o.created_at).getHours();
                  hourly[hr] = (hourly[hr] || 0) + 1;
                });
                const peakHour = Object.entries(hourly).sort(([,a], [,b]) => b - a)[0];

                return (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-accent/10 border border-accent/20 rounded-sm p-3 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Revenue</p>
                        <p className="text-lg font-sans font-bold text-accent">${totalRevenue.toFixed(2)}</p>
                      </div>
                      <div className="bg-primary/10 border border-primary/20 rounded-sm p-3 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Orders</p>
                        <p className="text-lg font-sans font-bold text-primary">{totalOrders}</p>
                      </div>
                      <div className="bg-muted border border-border rounded-sm p-3 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Avg Order</p>
                        <p className="text-lg font-sans font-bold">${avgOrderValue.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Source breakdown */}
                    <div className="bg-card border border-border rounded-sm p-3">
                      <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-2">By Source</h3>
                      <div className="space-y-2">
                        {[
                          { label: "POS", count: bySource.pos, revenue: revenueBySource.pos, color: "bg-blue-500" },
                          { label: "Kiosk", count: bySource.kiosk, revenue: revenueBySource.kiosk, color: "bg-purple-500" },
                          { label: "Website", count: bySource.web, revenue: revenueBySource.web, color: "bg-amber-500" },
                        ].map((src) => (
                          <div key={src.label} className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${src.color} shrink-0`} />
                            <span className="text-xs font-medium w-14">{src.label}</span>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className={`h-2 rounded-full ${src.color}`} style={{ width: `${totalOrders > 0 ? (src.count / totalOrders) * 100 : 0}%` }} />
                            </div>
                            <span className="text-xs font-semibold w-8 text-right">{src.count}</span>
                            <span className="text-xs font-semibold text-accent w-16 text-right">${src.revenue.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payment breakdown */}
                    <div className="bg-card border border-border rounded-sm p-3">
                      <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-2">Payment Method</h3>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-blue-50 border border-blue-200 rounded-sm p-3 text-center">
                          <p className="text-xl font-bold text-blue-700">{byPayment.card}</p>
                          <p className="text-[10px] text-blue-600 uppercase">Card</p>
                        </div>
                        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-sm p-3 text-center">
                          <p className="text-xl font-bold text-emerald-700">{byPayment.cash}</p>
                          <p className="text-[10px] text-emerald-600 uppercase">Cash</p>
                        </div>
                      </div>
                    </div>

                    {/* Peak hour */}
                    {peakHour && (
                      <div className="bg-card border border-border rounded-sm p-3">
                        <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-1">Peak Hour</h3>
                        <p className="text-sm font-semibold">{parseInt(peakHour[0]) > 12 ? `${parseInt(peakHour[0]) - 12} PM` : `${peakHour[0]} AM`} — {peakHour[1]} orders</p>
                      </div>
                    )}

                    {/* Top selling items */}
                    <div className="bg-card border border-border rounded-sm p-3">
                      <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-2">Top Selling Items</h3>
                      {topItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
                      ) : (
                        <div className="space-y-1.5">
                          {topItems.slice(0, 15).map((item, i) => (
                            <div key={item.name} className="flex items-center gap-2 text-xs">
                              <span className="w-4 text-muted-foreground text-right">{i + 1}.</span>
                              <span className="flex-1 font-medium truncate">{item.name}</span>
                              <span className="font-semibold w-6 text-right">{item.qty}</span>
                              <span className="font-semibold text-accent w-14 text-right">${item.revenue.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cancelled orders */}
                    {filteredOrders.filter((o) => o.status === "cancelled").length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-sm p-3">
                        <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-red-600 mb-1">Cancelled</h3>
                        <p className="text-sm font-semibold text-red-700">
                          {filteredOrders.filter((o) => o.status === "cancelled").length} orders cancelled
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const POSPageWithAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth?redirect=/pos" replace />;
  }

  return <POSPage />;
};

export default POSPageWithAuth;
