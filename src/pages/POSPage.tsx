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
  Calendar as CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { menuItems, categories, MenuItem } from "@/data/menu";
import { toast } from "sonner";
import ModifierSelector, {
  getDefaultSelectedMods,
  getKitchenModifierLines,
  getModifiersTotal,
  getSelectedModifierDetails,
} from "@/components/ModifierSelector";
import { useAuth } from "@/context/AuthContext";
import { LogOut, ClipboardList } from "lucide-react";
import {
  sendCreditSale,
  dollarsToCents,
  cancelValorTransaction,
  ValorCancelledError,
  ValorTimeoutError,
  recoverValorTransaction,
  sendVoid,
  warmupValor,
  cacheValorApproval,
  readCachedValorApproval,
  clearCachedValorApproval,
  type ValorSuccessResponse,
} from "@/lib/valor";
import { computeTotals } from "@/lib/pricing";
import { ValorEPI, getEPIs } from "@/lib/valor-epi";
import { createOrder, subscribeToOrders, markOrderPaid, updateOrderStatus, saveOrderValorRefs, queueReceiptPrint } from "@/lib/orders";
import { directPrintOrder, getPrinterIp, setPrinterIp, kickCashDrawer } from "@/lib/print-direct";
import { Order, OrderStatus } from "@/data/orders";
import { DollarSign, ChevronDown, BarChart3, Printer } from "lucide-react";

type OrderType = "dine-in" | "take-out";

// Neutral palette used for all category tabs and item tiles — no per-category colors.
// Tailwind classes are kept as full literal strings so the JIT picks them up.
const CATEGORY_COLORS: Record<string, { active: string; inactive: string; tile: string }> = {
  default: {
    active: "bg-primary text-primary-foreground border-primary shadow-sm",
    inactive: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
    tile: "bg-muted border-border hover:border-accent/50",
  },
};

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
  const QUICK_CAT = "Quick Items";
  const [quickItemIds, setQuickItemIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("pos-quick-items");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("pos-quick-items", JSON.stringify(quickItemIds));
  }, [quickItemIds]);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [showPrinterConfig, setShowPrinterConfig] = useState(false);
  const [printerIpInput, setPrinterIpInput] = useState(() => getPrinterIp());
  const [printerTestState, setPrinterTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [printerTestMsg, setPrinterTestMsg] = useState<string>("");
  const [quickItemPendingRemoval, setQuickItemPendingRemoval] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(QUICK_CAT);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [orderNumber, setOrderNumber] = useState(() => Math.floor(100 + Math.random() * 900));
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
  const [historyCustomRange, setHistoryCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [historyDatePickerOpen, setHistoryDatePickerOpen] = useState(false);

  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [showPendingPayments, setShowPendingPayments] = useState(false);
  const [expandedUnpaidOrder, setExpandedUnpaidOrder] = useState<string | null>(null);
  const [loadedPendingOrderId, setLoadedPendingOrderId] = useState<string | null>(null);
  const [splitPayment, setSplitPayment] = useState<{ orderId: string; cashAmount: string } | null>(null);
  const [posSplitMode, setPosSplitMode] = useState(false);
  const [posSplitCash, setPosSplitCash] = useState("");
  const [inFlightTxnId, setInFlightTxnId] = useState<string | null>(null);
  const [cashFallbackOpen, setCashFallbackOpen] = useState(false);
  const switchedToCashRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const blockedCardRetryRef = useRef(false);
  /** Prevents double-tap on Payment went through while recovery is in flight. */
  const recoveryInFlightRef = useRef(false);
  /** Bumped when staff aborts an in-flight card sale so a late approve voids instead of saving. */
  const saleSessionRef = useRef(0);
  const pendingOrderIdRef = useRef<string | null>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);
  const [paymentRecovery, setPaymentRecovery] = useState<{
    reqTxnId: string;
    orderId?: string;
    /** True when terminal already approved and only Firestore save failed — retrying Card will double-charge. */
    knownApproved?: boolean;
    /** Cached approval — retry save without re-polling a settled txn that status no longer returns. */
    approvedResult?: ValorSuccessResponse;
  } | null>(null);
  const [unpaidRecovery, setUnpaidRecovery] = useState<{
    orderId: string;
    tag: string;
    total: number;
    reqTxnId: string;
    knownApproved?: boolean;
    approvedResult?: ValorSuccessResponse;
  } | null>(null);
  const [unpaidInFlight, setUnpaidInFlight] = useState<{ orderId: string; txnId: string | null } | null>(null);
  const [unpaidCashFallback, setUnpaidCashFallback] = useState<{ orderId: string; tag: string; total: number } | null>(null);
  const [newOrderCashConfirm, setNewOrderCashConfirm] = useState(false);
  const [cashTendered, setCashTendered] = useState("");
  const unpaidSwitchedRef = useRef<Set<string>>(new Set());
  const [printPrompt, setPrintPrompt] = useState<{ orderId: string; tag: string; total: number } | null>(null);

  const askToPrint = (orderId: string, tag: string, total: number) => {
    setPrintPrompt({ orderId, tag, total });
    // Kick the cash drawer open on every successful payment
    kickCashDrawer().catch(() => {
      toast("Cash drawer didn't open — check printer connection", { duration: 3000 });
    });
  };

  const handlePrintReceipt = async (orderId: string, silent = false) => {
    // Try the LAN printer first — instant, no cloud round-trip.
    // Fall back to the Firestore queue so the order is still recorded for
    // the cloud poller if/when it works.
    try {
      await directPrintOrder(orderId);
      if (!silent) toast.success("Receipt printed", { duration: 1800 });
      // Also mark queued so the cloud path doesn't try to print it again.
      queueReceiptPrint(orderId).catch(() => {});
      return;
    } catch (lanErr) {
      // LAN print failed — queue for cloud as a fallback
      try {
        await queueReceiptPrint(orderId);
        if (!silent) {
          toast.success("Printer not reachable on LAN — queued for cloud printer", { duration: 2200 });
        }
      } catch (queueErr) {
        toast.error(
          `Print failed: ${lanErr instanceof Error ? lanErr.message : "LAN error"}`,
          { duration: 3000 }
        );
      }
    }
  };

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
    // Auto-scroll cart to bottom after a brief render delay
    requestAnimationFrame(() => {
      cartEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
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
      const mods = c.item.modifiers ? getKitchenModifierLines(c.item.modifiers, c.selectedModifiers) : [];
      return {
        name: c.item.name,
        quantity: c.qty,
        price: c.item.price + c.modifiersTotal,
        ...(mods.length > 0 ? { modifiers: mods } : {}),
      };
    });

  const saveOrder = async (payment: "card" | "cash", extra?: { auth_code?: string; masked_pan?: string; rrn?: string }) => {
    if (loadedPendingOrderId) {
      await markOrderPaid(loadedPendingOrderId);
      if (extra && (extra.auth_code || extra.masked_pan || extra.rrn)) {
        await saveOrderValorRefs(loadedPendingOrderId, extra);
      }
      return loadedPendingOrderId;
    }
    const { total } = computeTotals(totalPrice, payment);
    return await createOrder({
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

  /** Create an unpaid POS order before sending to the terminal so a successful
   *  card charge always has a Firestore doc to attach to. */
  const ensureUnpaidPosOrder = async (): Promise<string> => {
    if (pendingOrderIdRef.current) return pendingOrderIdRef.current;
    if (loadedPendingOrderId) return loadedPendingOrderId;
    const { total } = computeTotals(totalPrice, "card");
    const id = await createOrder({
      customer_name: orderType === "dine-in" ? "Dine-In Customer" : "Take-Out Customer",
      customer_email: "",
      customer_phone: "",
      items: buildOrderItems(),
      total,
      order_type: orderType,
      notes: `POS Order #${orderNumber}`,
      source: "pos",
      payment: "card",
      payment_status: "unpaid",
      terminal_epi: selectedEpi || undefined,
    });
    setLoadedPendingOrderId(id);
    pendingOrderIdRef.current = id;
    // Do NOT set blockedCardRetry here — publish/cancel failures must still allow
    // a safe Card retry. Lock only on timeout / knownApproved (already charged).
    return id;
  };

  const voidStrayCardCharge = async (result: { TRAN_NO?: string }) => {
    if (!result.TRAN_NO || !selectedEpi || !selectedAppKey) return;
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await sendVoid(result.TRAN_NO, selectedEpi, selectedAppKey);
        console.log("[pos] stray-charge void succeeded on attempt", attempt);
        return;
      } catch (e) {
        console.error(`[pos] stray-charge void attempt ${attempt}/${MAX_RETRIES} failed`, e);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
    // All retries failed — alert staff to void manually from terminal
    toast.error(
      "⚠️ AUTO-VOID FAILED — Manually void transaction " +
        result.TRAN_NO +
        " from the Valor terminal batch report to prevent a double charge.",
      { duration: 15000 }
    );
  };

  const persistCardApproval = async (
    orderId: string,
    result: Awaited<ReturnType<typeof sendCreditSale>>,
  ) => {
    const tenderedCash = /cash/i.test(String(result.TRAN_TYPE || "")) || !result.MASKED_PAN;
    await markOrderPaid(orderId);
    if (!tenderedCash) {
      await saveOrderValorRefs(orderId, {
        auth_code: result.CODE,
        masked_pan: result.MASKED_PAN,
        rrn: result.RRN,
      });
    }
    return tenderedCash;
  };

  const finalizeCardPayment = async (
    result: Awaited<ReturnType<typeof sendCreditSale>>,
    tag: string,
    orderId: string,
    orderTotal: number,
    /** When save fails, reopen recovery so staff can retry without a second charge. */
    recoveryTxnId?: string | null,
    /** Sale session captured at publish time — ignore/void if staff aborted mid-flight. */
    saleSession?: number,
  ) => {
    if (
      switchedToCashRef.current ||
      (saleSession !== undefined && saleSession !== saleSessionRef.current)
    ) {
      await voidStrayCardCharge(result);
      return;
    }
    try {
      const tenderedCash = await persistCardApproval(orderId, result);
      if (recoveryTxnId) clearCachedValorApproval(recoveryTxnId);
      if (tenderedCash) {
        toast.success(`Cash collected at terminal — $${orderTotal.toFixed(2)}`, { duration: 2000 });
      } else {
        toast.success(
          `Payment approved — ${result.ISSUER} ${result.MASKED_PAN} | Auth: ${result.CODE}`,
          { duration: 2000 }
        );
      }
      askToPrint(orderId, tag, orderTotal);
      resetOrder();
    } catch (e) {
      checkoutLockRef.current = true;
      blockedCardRetryRef.current = true;
      if (recoveryTxnId) {
        cacheValorApproval(recoveryTxnId, result);
        setPaymentRecovery({
          reqTxnId: recoveryTxnId,
          orderId,
          knownApproved: true,
          approvedResult: result,
        });
      }
      toast.error(
        "Card was approved but saving the order failed — do NOT charge again. Tap Payment went through to retry save.",
        { duration: 8000 }
      );
      const err = e instanceof Error ? e : new Error(String(e));
      (err as Error & { openedPaymentRecovery?: boolean }).openedPaymentRecovery = !!recoveryTxnId;
      throw err;
    }
  };

  const loadPendingIntoCart = (order: Order) => {
    if (cart.length > 0 && !loadedPendingOrderId) {
      const ok = window.confirm(
        `Replace the current cart (${cart.length} item${cart.length > 1 ? "s" : ""}) with this pending order?`
      );
      if (!ok) return;
    }
    const items: CartItem[] = order.items.map((oi) => {
      const match = menuItems.find((m) => m.name === oi.name);
      const synthetic: MenuItem = match || {
        id: `pending-${oi.name}`,
        name: oi.name,
        desc: "",
        price: oi.price,
        category: "Pending",
        image: "" as unknown as MenuItem["image"],
      };
      return {
        item: synthetic,
        qty: oi.quantity,
        selectedModifiers: {},
        modifiersTotal: match ? Math.max(0, oi.price - match.price) : 0,
      };
    });
    setCart(items);
    setLoadedPendingOrderId(order.id);
    pendingOrderIdRef.current = order.id;
    blockedCardRetryRef.current = false;
    setOrderType(order.order_type);
    setShowPendingPayments(false);
    setExpandedUnpaidOrder(null);
    toast.success(`${order.customer_name || `Order #${order.id.slice(0, 6).toUpperCase()}`} loaded — ready to checkout`, { duration: 2000 });
  };

  const dismissPaymentRecovery = async (cancelTxn: boolean) => {
    const reqTxnId = paymentRecovery?.reqTxnId;
    const knownApproved = !!paymentRecovery?.knownApproved;
    setPaymentRecovery(null);
    checkoutLockRef.current = false;
    setIsProcessing(false);
    setInFlightTxnId(null);
    // After a known approve + save-fail, never unlock Card retry — cancel cannot reverse a settled sale.
    if (knownApproved) {
      blockedCardRetryRef.current = true;
      toast.error(
        "Card already charged — do NOT tap Card again. Use Payment went through, Pending Payments, or void on the terminal.",
        { duration: 10000 }
      );
    } else {
      blockedCardRetryRef.current = false;
    }
    if (cancelTxn && reqTxnId) {
      await cancelValorTransaction(selectedEpi, selectedAppKey, reqTxnId);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || checkoutLockRef.current || paymentRecovery) return;
    if (blockedCardRetryRef.current) {
      toast.error(
        paymentRecovery
          ? "Resolve the payment recovery dialog first — do not charge again"
          : "Previous card attempt may still be processing — use the payment prompt or clear the cart.",
        { duration: 4000 }
      );
      return;
    }
    checkoutLockRef.current = true;
    switchedToCashRef.current = false;
    setIsProcessing(true);
    let orderId: string | null = null;
    let reqTxnId: string | null = null;
    const saleSession = ++saleSessionRef.current;
    const cardTotal = computeTotals(totalPrice, "card").total;
    let awaitingRecovery = false;
    try {
      orderId = await ensureUnpaidPosOrder();

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
        invoiceNumber: orderId,
        lineItems,
        epi: selectedEpi,
        appkey: selectedAppKey,
        onTxnId: (id) => {
          reqTxnId = id;
          setInFlightTxnId(id);
        },
      });

      if (reqTxnId) cacheValorApproval(reqTxnId, result);
      await finalizeCardPayment(result, `#${orderNumber}`, orderId, cardTotal, reqTxnId, saleSession);
    } catch (error) {
      if (switchedToCashRef.current) return;
      if (error instanceof ValorCancelledError) {
        setCashFallbackOpen(true);
        return;
      }
      if (error instanceof ValorTimeoutError) {
        awaitingRecovery = true;
        blockedCardRetryRef.current = true;
        setIsProcessing(false);
        setInFlightTxnId(null);
        setPaymentRecovery({
          reqTxnId: error.reqTxnId,
          orderId: orderId ?? loadedPendingOrderId ?? undefined,
        });
        toast.error("Timed out waiting for terminal — check if payment went through before retrying", { duration: 5000 });
        return;
      }
      if ((error as Error & { openedPaymentRecovery?: boolean })?.openedPaymentRecovery) {
        awaitingRecovery = true;
        setIsProcessing(false);
        return;
      }
      console.error("POS checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      if (!switchedToCashRef.current && !awaitingRecovery) {
        checkoutLockRef.current = false;
        setIsProcessing(false);
        setInFlightTxnId(null);
      }
    }
  };

  /** True when poll failure means status is gone / settled — safe to mark paid on staff attestation.
   *  Do NOT treat PROCESSING ERROR as paid (often means terminal busy / second publish rejected). */
  const isSettledOrGonePollError = (err: unknown) => {
    if (err instanceof ValorTimeoutError) return true;
    const msg = err instanceof Error ? err.message : "";
    return /not found|expired|already (completed|processed|settled)|no (such )?transaction|invalid txn/i.test(
      msg,
    );
  };

  const handleRecoverPayment = async () => {
    if (!paymentRecovery || recoveryInFlightRef.current) return;
    // Snapshot — do not read paymentRecovery again in finally (stale closure deadlock).
    const recovery = paymentRecovery;
    const orderId = recovery.orderId ?? loadedPendingOrderId;
    if (!orderId) {
      toast.error("Order record missing — check Pending Payments");
      return;
    }
    // Cached approval needs no terminal; poll path needs EPI/keys.
    if (!recovery.approvedResult && (!selectedEpi || !selectedAppKey)) {
      toast.error("No terminal selected — choose a terminal in Settings");
      return;
    }
    recoveryInFlightRef.current = true;
    checkoutLockRef.current = true;
    setIsProcessing(true);
    const cardTotal = computeTotals(totalPrice, "card").total;
    let recovered = false;
    try {
      // Prefer real card-reader confirmation in this order:
      // 1) in-memory approval from save-fail
      // 2) session cache (survives refresh / sticky UI)
      // 3) re-poll Valor status
      // 4) only then staff attestation mark-paid (no card payload available)
      let result: ValorSuccessResponse | null =
        recovery.approvedResult ?? readCachedValorApproval(recovery.reqTxnId);

      if (!result) {
        try {
          result = await recoverValorTransaction(
            selectedEpi,
            selectedAppKey,
            recovery.reqTxnId,
            20_000,
          );
        } catch (pollErr) {
          if (pollErr instanceof ValorCancelledError) {
            void dismissPaymentRecovery(false);
            setCashFallbackOpen(true);
            return;
          }
          // knownApproved: we already have the approval in memory (or staff must save).
          // timeout / settled-gone: staff attested via this button.
          // Other errors (decline, PROCESSING ERROR, network): keep modal open — do not mark paid.
          if (recovery.knownApproved || isSettledOrGonePollError(pollErr)) {
            result = null;
          } else {
            throw pollErr;
          }
        }
      }

      if (result) {
        cacheValorApproval(recovery.reqTxnId, result);
        // Persist first; only clear recovery UI after save succeeds.
        await finalizeCardPayment(result, `#${orderNumber}`, orderId, cardTotal, recovery.reqTxnId);
      } else {
        await markOrderPaid(orderId);
        clearCachedValorApproval(recovery.reqTxnId);
        toast.success("Order marked paid (payment confirmed) — do not run card again", {
          duration: 4000,
        });
        askToPrint(orderId, `#${orderNumber}`, cardTotal);
        resetOrder();
      }
      setPaymentRecovery(null);
      blockedCardRetryRef.current = false;
      recovered = true;
    } catch (error) {
      if (error instanceof ValorCancelledError) {
        void dismissPaymentRecovery(false);
        setCashFallbackOpen(true);
        return;
      }
      // Keep recovery modal open; avoid duplicate toast when finalize already explained save-fail.
      if (!(error as Error & { openedPaymentRecovery?: boolean })?.openedPaymentRecovery) {
        toast.error(error instanceof Error ? error.message : "Could not save — tap Payment went through to retry");
      }
    } finally {
      // Always clear processing banners / txn id so the UI cannot stick.
      recoveryInFlightRef.current = false;
      setIsProcessing(false);
      setInFlightTxnId(null);
      if (recovered) {
        checkoutLockRef.current = false;
      }
    }
  };

  const handleSwitchToCash = async () => {
    switchedToCashRef.current = true;
    saleSessionRef.current += 1; // invalidate any in-flight card finalize
    const toCancel = inFlightTxnId ?? paymentRecovery?.reqTxnId ?? null;
    setInFlightTxnId(null);
    setIsProcessing(false);
    setPaymentRecovery(null);
    blockedCardRetryRef.current = false;
    checkoutLockRef.current = false;
    // Await cancel so a late card approve is less likely to land after cash save.
    if (toCancel) {
      await cancelValorTransaction(selectedEpi, selectedAppKey, toCancel);
    }
    try {
      const savedId = pendingOrderIdRef.current ?? loadedPendingOrderId ?? (await ensureUnpaidPosOrder());
      await markOrderPaid(savedId);
      toast.success("Order saved as cash payment", { duration: 2000 });
      askToPrint(savedId, `#${orderNumber}`, computeTotals(totalPrice, "cash").total);
      // Do NOT clear switchedToCashRef here — resetOrder used to, which let a late
      // card approve persist instead of voiding. Guard stays until next Card checkout.
      resetOrder({ keepSwitchedToCash: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  };

  const handleUnpaidCardPay = async (order: Order, tag: string) => {
    if (checkoutLockRef.current || unpaidInFlight || unpaidRecovery || paymentRecovery) return;
    checkoutLockRef.current = true;
    setUnpaidInFlight({ orderId: order.id, txnId: null });
    let awaitingRecovery = false;
    let reqTxnId: string | null = null;
    let saveAfterChargeFailed = false;
    try {
      const result = await sendCreditSale({
        amountCents: dollarsToCents(order.total),
        tipEnabled: true,
        printReceipt: true,
        invoiceNumber: order.id,
        epi: selectedEpi,
        appkey: selectedAppKey,
        onTxnId: (id) => {
          reqTxnId = id;
          setUnpaidInFlight({ orderId: order.id, txnId: id });
        },
      });

      if (unpaidSwitchedRef.current.has(order.id)) {
        await voidStrayCardCharge(result);
        return;
      }

      try {
        const tenderedCash = await persistCardApproval(order.id, result);
        if (reqTxnId) clearCachedValorApproval(reqTxnId);
        if (tenderedCash) {
          toast.success(`Cash collected at terminal for ${tag}`, { duration: 2000 });
        } else {
          toast.success(`Card payment for ${tag} — ${result.ISSUER} ${result.MASKED_PAN}`, { duration: 2000 });
        }
        askToPrint(order.id, tag, order.total);
        setExpandedUnpaidOrder(null);
      } catch (saveErr) {
        saveAfterChargeFailed = true;
        if (reqTxnId) {
          awaitingRecovery = true;
          cacheValorApproval(reqTxnId, result);
          setUnpaidRecovery({
            orderId: order.id,
            tag,
            total: order.total,
            reqTxnId,
            knownApproved: true,
            approvedResult: result,
          });
          toast.error(
            "Card approved but saving failed — do NOT charge again. Tap Payment went through.",
            { duration: 8000 }
          );
        } else {
          // Can't open recovery without txn id — don't leave checkout locked forever.
          toast.error(
            "Card approved but saving failed — do NOT charge again. Refresh Pending Payments and mark paid, or void on the terminal.",
            { duration: 10000 }
          );
        }
      }
    } catch (err) {
      if (unpaidSwitchedRef.current.has(order.id)) {
        unpaidSwitchedRef.current.delete(order.id);
        return;
      }
      if (err instanceof ValorCancelledError) {
        setUnpaidCashFallback({ orderId: order.id, tag, total: order.total });
        return;
      }
      if (err instanceof ValorTimeoutError) {
        awaitingRecovery = true;
        setUnpaidRecovery({ orderId: order.id, tag, total: order.total, reqTxnId: err.reqTxnId });
        toast.error("Timed out — check terminal before retrying card", { duration: 5000 });
        return;
      }
      if (!saveAfterChargeFailed) {
        toast.error(err instanceof Error ? err.message : "Card payment failed");
      }
    } finally {
      if (!awaitingRecovery && !unpaidSwitchedRef.current.has(order.id)) {
        checkoutLockRef.current = false;
        setUnpaidInFlight((cur) => (cur?.orderId === order.id ? null : cur));
      } else if (awaitingRecovery) {
        setUnpaidInFlight(null);
      }
    }
  };

  const handleRecoverUnpaidPayment = async () => {
    if (!unpaidRecovery || recoveryInFlightRef.current) return;
    const recovery = unpaidRecovery;
    if (!recovery.approvedResult && (!selectedEpi || !selectedAppKey)) {
      toast.error("No terminal selected — choose a terminal in Settings");
      return;
    }
    recoveryInFlightRef.current = true;
    checkoutLockRef.current = true;
    setUnpaidInFlight({ orderId: recovery.orderId, txnId: recovery.reqTxnId });
    let recovered = false;
    try {
      const { orderId, tag, total } = recovery;
      let result: ValorSuccessResponse | null =
        recovery.approvedResult ?? readCachedValorApproval(recovery.reqTxnId);

      if (!result) {
        try {
          result = await recoverValorTransaction(
            selectedEpi,
            selectedAppKey,
            recovery.reqTxnId,
            20_000,
          );
        } catch (pollErr) {
          if (pollErr instanceof ValorCancelledError) {
            setUnpaidRecovery(null);
            setUnpaidCashFallback({ orderId: recovery.orderId, tag: recovery.tag, total: recovery.total });
            return;
          }
          if (recovery.knownApproved || isSettledOrGonePollError(pollErr)) {
            result = null;
          } else {
            throw pollErr;
          }
        }
      }

      if (result) {
        cacheValorApproval(recovery.reqTxnId, result);
        const tenderedCash = await persistCardApproval(orderId, result);
        clearCachedValorApproval(recovery.reqTxnId);
        toast.success(
          tenderedCash
            ? `Cash collected at terminal for ${tag}`
            : `Card payment for ${tag} — ${result.ISSUER} ${result.MASKED_PAN}`,
          { duration: 2000 }
        );
      } else {
        await markOrderPaid(orderId);
        clearCachedValorApproval(recovery.reqTxnId);
        toast.success(`${tag} marked paid (payment confirmed) — do not run card again`, {
          duration: 4000,
        });
      }
      setUnpaidRecovery(null);
      recovered = true;
      askToPrint(orderId, tag, total);
      setExpandedUnpaidOrder(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — tap Payment went through to retry");
    } finally {
      recoveryInFlightRef.current = false;
      setUnpaidInFlight(null);
      if (recovered) {
        checkoutLockRef.current = false;
      }
      // On failure keep lock while unpaidRecovery stays open (blocks second Card tap).
    }
  };

  const handleUnpaidSwitchToCash = async (orderId: string, tag: string) => {
    unpaidSwitchedRef.current.add(orderId);
    const txnId =
      (unpaidInFlight?.orderId === orderId ? unpaidInFlight.txnId : null) ??
      (unpaidRecovery?.orderId === orderId ? unpaidRecovery.reqTxnId : null);
    setUnpaidInFlight(null);
    setUnpaidRecovery(null);
    if (txnId) {
      await cancelValorTransaction(selectedEpi, selectedAppKey, txnId);
    }
    try {
      await markOrderPaid(orderId);
      toast.success(`Cash payment for ${tag}`, { duration: 2000 });
      const o = orderHistory.find((x) => x.id === orderId);
      askToPrint(orderId, tag, o?.total ?? 0);
      setExpandedUnpaidOrder(null);
      checkoutLockRef.current = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark paid");
    }
  };

  const handleConfirmUnpaidCashFallback = async () => {
    if (!unpaidCashFallback) return;
    const { orderId, tag, total } = unpaidCashFallback;
    setUnpaidCashFallback(null);
    try {
      await markOrderPaid(orderId);
      toast.success(`Cash payment for ${tag}`, { duration: 2000 });
      askToPrint(orderId, tag, total);
      setExpandedUnpaidOrder(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark paid");
    }
  };

  const handleConfirmCashFallback = async () => {
    setCashFallbackOpen(false);
    try {
      const savedId = pendingOrderIdRef.current ?? loadedPendingOrderId ?? (await ensureUnpaidPosOrder());
      await markOrderPaid(savedId);
      toast.success("Order saved as cash payment", { duration: 2000 });
      askToPrint(savedId, `#${orderNumber}`, computeTotals(totalPrice, "cash").total);
      resetOrder();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  };

  const resetOrder = (opts?: { keepSwitchedToCash?: boolean }) => {
    setCart([]);
    setSelectedItem(null);
    setItemQty(1);
    setSelectedMods({});
    setSearchQuery("");
    setLoadedPendingOrderId(null);
    pendingOrderIdRef.current = null;
    setPaymentRecovery(null);
    setUnpaidRecovery(null);
    setIsProcessing(false);
    checkoutLockRef.current = false;
    recoveryInFlightRef.current = false;
    // Keep the guard after cash-while-card-in-flight so a late approve voids instead of saving.
    if (!opts?.keepSwitchedToCash) {
      switchedToCashRef.current = false;
    }
    blockedCardRetryRef.current = false;
    setOrderNumber(Math.floor(100 + Math.random() * 900));
  };

  const filteredItems = searchQuery.trim()
    ? menuItems.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.category.toLowerCase().includes(searchQuery.toLowerCase()))
    : selectedCategory === QUICK_CAT
    ? quickItemIds.map((id) => menuItems.find((m) => m.id === id)).filter((m): m is MenuItem => Boolean(m))
    : menuItems.filter((m) => m.category === selectedCategory);

  // Item detail modal
  const ItemDetailModal = () => {
    if (!selectedItem) return null;
    const modsTotal = selectedItem.modifiers ? getModifiersTotal(selectedItem.modifiers, selectedMods) : 0;
    const detailTotal = (selectedItem.price + modsTotal) * itemQty;

    return (
      <>
        {/* Dim only the menu area — leave the cart/checkout panel visible on the right */}
        <div
          className="fixed inset-y-0 left-0 right-80 lg:right-96 bg-foreground/40 z-50"
          onClick={() => { setSelectedItem(null); setSelectedMods({}); setItemQty(1); }}
        />
        <div className="fixed inset-y-0 left-0 right-80 lg:right-96 z-50 flex flex-col bg-background border-r-2 border-border overflow-hidden shadow-2xl max-h-[100dvh]">
          <header className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            {selectedItem.image ? (
              <img
                src={selectedItem.image}
                alt=""
                className="h-9 w-9 shrink-0 rounded-sm object-cover border border-border/50"
                aria-hidden
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-base sm:text-lg font-medium leading-tight">{selectedItem.name}</h2>
              {selectedItem.tag ? (
                <span className="inline-block mt-0.5 text-[9px] uppercase tracking-wider font-sans font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {selectedItem.tag}
                </span>
              ) : null}
            </div>
            <button onClick={() => { setSelectedItem(null); setSelectedMods({}); setItemQty(1); }} className="w-10 h-10 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all shrink-0">
              <X className="w-5 h-5" />
            </button>
          </header>
          {/* No scroll: modifiers use dense grids + side-by-side groups on wide POS */}
          <div className="flex-1 min-h-0 overflow-hidden px-2 py-2 sm:px-3 sm:py-2 flex flex-col">
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 ? (
              <ModifierSelector layout="pos" groups={selectedItem.modifiers} selected={selectedMods} onChange={setSelectedMods} />
            ) : (
              <p className="text-sm text-muted-foreground">{selectedItem.desc}</p>
            )}
          </div>
          <footer className="shrink-0 border-t border-border bg-background px-3 py-2.5 sm:py-3 space-y-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xl font-sans font-bold text-accent tabular-nums">${detailTotal.toFixed(2)}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemQty(Math.max(1, itemQty - 1))}
                  className="w-11 h-11 flex items-center justify-center rounded-sm border-2 border-border text-foreground hover:bg-muted active:scale-90 transition-all"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="w-10 text-center font-sans font-bold text-lg tabular-nums">{itemQty}</span>
                <button
                  type="button"
                  onClick={() => setItemQty(itemQty + 1)}
                  className="w-11 h-11 flex items-center justify-center rounded-sm border-2 border-border text-foreground hover:bg-muted active:scale-90 transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                addToCart(selectedItem, itemQty, selectedMods);
                setSelectedItem(null);
                setSelectedMods({});
                setItemQty(1);
              }}
              className="w-full min-h-[48px] py-3 bg-accent text-accent-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <ShoppingBag className="w-5 h-5" />
              Add — ${detailTotal.toFixed(2)}
            </button>
          </footer>
        </div>
      </>
    );
  };

  return (
    <div className="high-vis h-screen bg-muted flex flex-col overflow-hidden">
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
          <button
            onClick={() => {
              setPrinterIpInput(getPrinterIp());
              setPrinterTestState("idle");
              setShowPrinterConfig(true);
            }}
            title="Printer settings"
            className="flex items-center justify-center w-7 h-7 bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground rounded-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
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
            <div className="absolute top-full left-0 right-0 z-40 bg-amber-50 border-b-2 border-amber-200 shadow-lg max-h-[75vh] overflow-y-auto">
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
                      <div className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-amber-100 transition-colors">
                        <button
                          onClick={() => loadPendingIntoCart(order)}
                          className="flex-1 flex items-center gap-2 flex-wrap text-left min-w-0"
                          title="Load into cart for checkout"
                        >
                          <span className="text-base font-bold text-amber-900 truncate">{order.customer_name || tag}</span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-700">KIOSK</span>
                          <span className="text-[10px] text-amber-600">
                            · {order.items.length} item{order.items.length > 1 ? "s" : ""}
                          </span>
                          <span className="text-[10px] text-muted-foreground">· {timeAgo()}</span>
                        </button>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-bold text-amber-800">${order.total.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => setExpandedUnpaidOrder(isExpanded ? null : order.id)}
                            className="p-1 rounded hover:bg-amber-200/70"
                            title={isExpanded ? "Hide details" : "Show details"}
                          >
                            <ChevronDown className={`w-3.5 h-3.5 text-amber-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-amber-100">
                          <div className="px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
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
                                    if (checkoutLockRef.current || unpaidInFlight) {
                                      toast.error("Another payment is in progress — wait for it to complete", { duration: 3000 });
                                      return;
                                    }
                                    checkoutLockRef.current = true;
                                    try {
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
                                    askToPrint(order.id, tag, order.total);
                                    setSplitPayment(null);
                                    setExpandedUnpaidOrder(null);
                                    } finally {
                                      checkoutLockRef.current = false;
                                    }
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
                          <div className="sticky bottom-0 grid grid-cols-4 gap-1.5 px-3 py-2 bg-amber-50 border-t border-amber-200">
                            <button
                              onClick={async () => {
                                // If a card charge is in-flight for this order,
                                // use the safe switch-to-cash flow that cancels the card first
                                if (unpaidInFlight?.orderId === order.id) {
                                  handleUnpaidSwitchToCash(order.id, tag);
                                  return;
                                }
                                try {
                                  await markOrderPaid(order.id);
                                  toast.success(`Cash collected for ${tag}`, { duration: 2000 });
                                  askToPrint(order.id, tag, order.total);
                                  setExpandedUnpaidOrder(null);
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed to mark paid");
                                }
                              }}
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
                                onClick={() => {
                                  if (unpaidRecovery || paymentRecovery) {
                                    toast.error("Resolve the payment recovery dialog first — do not charge again", { duration: 4000 });
                                    return;
                                  }
                                  if (unpaidInFlight) {
                                    toast("Card payment in progress for another order — finish or cancel it first", { duration: 4000 });
                                    return;
                                  }
                                  handleUnpaidCardPay(order, tag);
                                }}
                                disabled={!!unpaidRecovery || !!paymentRecovery || !!unpaidInFlight}
                                className={`py-2.5 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm active:scale-[0.95] transition-all ${unpaidInFlight || unpaidRecovery || paymentRecovery ? "bg-blue-600/50 text-white/60 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                              >
                                💳 Card
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (unpaidInFlight) {
                                  toast("Wait for the card payment to finish first, or tap 'Pay Cash Instead' to switch", { duration: 4000 });
                                  return;
                                }
                                setSplitPayment({ orderId: order.id, cashAmount: (order.total / 2).toFixed(2) });
                              }}
                              className={`py-2.5 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm active:scale-[0.95] transition-all ${unpaidInFlight ? "bg-violet-600/50 text-white/60 cursor-not-allowed" : "bg-violet-600 text-white hover:bg-violet-700"}`}
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
                {[QUICK_CAT, ...categories].map((cat) => {
                  const palette = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default;
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 text-sm font-sans font-semibold rounded-sm whitespace-nowrap transition-all active:scale-95 border ${
                        isActive ? palette.active : palette.inactive
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Items grid — medium icons, fits whole category without scroll */}
          <div className="flex-1 min-h-0 overflow-hidden p-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 auto-rows-[9rem] content-start">
              {selectedCategory === QUICK_CAT && !searchQuery.trim() && (
                <button
                  onClick={() => setShowQuickPicker(true)}
                  className="bg-muted/40 border-2 border-dashed border-border rounded-md p-2 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-accent hover:border-accent/60 hover:bg-muted/60 active:scale-[0.96] transition-all"
                >
                  <span className="text-3xl leading-none font-light">+</span>
                  <span className="font-sans text-xs font-bold">Add Quick Item</span>
                </button>
              )}
              {filteredItems.map((item) => {
                const tilePalette =
                  (CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.default).tile;
                return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.modifiers && item.modifiers.length > 0) {
                      setSelectedItem(item);
                      setItemQty(1);
                      setSelectedMods(getDefaultSelectedMods(item));
                    } else {
                      quickAdd(item);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedItem(item);
                    setItemQty(1);
                    setSelectedMods(getDefaultSelectedMods(item));
                  }}
                  className={`border-2 rounded-md p-1.5 text-left hover:shadow-md active:scale-[0.96] transition-all group relative flex flex-col min-h-0 overflow-hidden ${tilePalette}`}
                >
                  {item.image && (
                    <img src={item.image} alt={item.name} className="w-full flex-1 min-h-0 object-cover rounded-sm mb-1" />
                  )}
                  <h3 className="font-sans text-xs font-bold text-foreground leading-tight line-clamp-1">{item.name}</h3>
                  <p className="text-xs font-sans font-bold text-accent">${item.price.toFixed(2)}</p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" title="Has customizations" />
                  )}
                  {selectedCategory === QUICK_CAT && !searchQuery.trim() && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickItemPendingRemoval(item);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setQuickItemPendingRemoval(item);
                        }
                      }}
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform"
                      title="Remove from Quick Items"
                    >
                      ×
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Cart sidebar */}
        <div className="w-80 lg:w-96 bg-background border-l border-border flex flex-col shrink-0">
          {loadedPendingOrderId && (() => {
            const loaded = unpaidOrders.find((o) => o.id === loadedPendingOrderId);
            const label = loaded?.customer_name || `Order #${loadedPendingOrderId.slice(0, 6).toUpperCase()}`;
            return (
            <div className="px-3 py-2 bg-amber-100 border-b-2 border-amber-300 flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-sans font-bold text-amber-900">
                Settling: {label}
              </span>
              <button
                onClick={resetOrder}
                className="text-[10px] font-sans font-bold text-amber-800 hover:underline"
              >
                Exit
              </button>
            </div>
            );
          })()}
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
          <div className="flex-1 overflow-y-auto px-3 py-2" id="pos-cart-scroll">
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
                            <button
                              type="button"
                              title="Remove line"
                              onClick={() => removeFromCart(idx)}
                              className="shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-colors ml-1 -mr-1"
                            >
                              <X className="w-5 h-5 stroke-[2.5]" />
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
            <div ref={cartEndRef} />
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
                        if (checkoutLockRef.current || paymentRecovery) return;
                        checkoutLockRef.current = true;
                        switchedToCashRef.current = false;
                        setIsProcessing(true);
                        const total = computeTotals(totalPrice, "cash").total;
                        const cashAmt = parseFloat(posSplitCash) || 0;
                        const cardAmt = Math.max(0, total - cashAmt);
                        let orderId: string | null = null;
                        let reqTxnId: string | null = null;
                        const saleSession = ++saleSessionRef.current;
                        let awaitingRecovery = false;
                        try {
                          orderId = await ensureUnpaidPosOrder();
                          if (cardAmt > 0) {
                            const result = await sendCreditSale({
                              amountCents: dollarsToCents(cardAmt),
                              tipEnabled: false,
                              printReceipt: true,
                              invoiceNumber: orderId,
                              epi: selectedEpi,
                              appkey: selectedAppKey,
                              onTxnId: (id) => {
                                reqTxnId = id;
                                setInFlightTxnId(id);
                              },
                            });
                            if (
                              switchedToCashRef.current ||
                              saleSession !== saleSessionRef.current
                            ) {
                              await voidStrayCardCharge(result);
                              return;
                            }
                            try {
                              if (reqTxnId) cacheValorApproval(reqTxnId, result);
                              await persistCardApproval(orderId, result);
                              if (reqTxnId) clearCachedValorApproval(reqTxnId);
                            } catch (saveErr) {
                              if (reqTxnId) {
                                awaitingRecovery = true;
                                blockedCardRetryRef.current = true;
                                setIsProcessing(false);
                                setInFlightTxnId(null);
                                cacheValorApproval(reqTxnId, result);
                                setPaymentRecovery({
                                  reqTxnId,
                                  orderId,
                                  knownApproved: true,
                                  approvedResult: result,
                                });
                                toast.error(
                                  "Card was approved but saving failed — do NOT charge again. Tap Payment went through.",
                                  { duration: 8000 }
                                );
                                return;
                              }
                              throw saveErr;
                            }
                          } else {
                            await markOrderPaid(orderId);
                          }
                          toast.success(`Split: $${cashAmt.toFixed(2)} cash + $${cardAmt.toFixed(2)} card`, { duration: 3000 });
                          askToPrint(orderId, `#${orderNumber}`, total);
                          setPosSplitMode(false);
                          setPosSplitCash("");
                          resetOrder();
                        } catch (err) {
                          if (switchedToCashRef.current) return;
                          if (err instanceof ValorCancelledError) {
                            setCashFallbackOpen(true);
                            return;
                          }
                          if (err instanceof ValorTimeoutError) {
                            awaitingRecovery = true;
                            blockedCardRetryRef.current = true;
                            setIsProcessing(false);
                            setInFlightTxnId(null);
                            setPaymentRecovery({ reqTxnId: err.reqTxnId, orderId: orderId ?? undefined });
                            toast.error("Timed out — check terminal before retrying", { duration: 5000 });
                            return;
                          }
                          toast.error(err instanceof Error ? err.message : "Card payment failed");
                        } finally {
                          if (!awaitingRecovery && !switchedToCashRef.current) {
                            checkoutLockRef.current = false;
                            setIsProcessing(false);
                            setInFlightTxnId(null);
                          }
                        }
                      }}
                      disabled={isProcessing || !!paymentRecovery}
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
                      onClick={() => handleSwitchToCash()}
                      className="py-3 bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all shadow-md"
                    >
                      <Banknote className="w-4 h-4" /> Pay Cash Instead
                    </button>
                    <button
                      onClick={async () => {
                        // Abort in-flight card; bump session so a late approve voids instead of saving.
                        switchedToCashRef.current = true;
                        saleSessionRef.current += 1;
                        const toCancel = inFlightTxnId;
                        setInFlightTxnId(null);
                        setIsProcessing(false);
                        if (toCancel) {
                          await cancelValorTransaction(selectedEpi, selectedAppKey, toCancel);
                        }
                        checkoutLockRef.current = false;
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
                      onClick={() => {
                        if (paymentRecovery) {
                          toast.error("Resolve the payment recovery dialog first — do not charge again", { duration: 4000 });
                          return;
                        }
                        handleCheckout();
                      }}
                      disabled={isProcessing || !!paymentRecovery}
                      className="py-4 bg-accent text-accent-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      <CreditCard className="w-4 h-4" /> Card
                    </button>
                    <button
                      onClick={() => {
                        if (paymentRecovery) {
                          toast.error("Resolve the payment recovery dialog first — do not charge again", { duration: 4000 });
                          return;
                        }
                        setCashTendered(""); setNewOrderCashConfirm(true);
                      }}
                      disabled={isProcessing || !!paymentRecovery}
                      className="py-4 bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      <Banknote className="w-4 h-4" /> Cash
                    </button>
                    <button
                      onClick={() => {
                        if (paymentRecovery) {
                          toast.error("Resolve the payment recovery dialog first — do not charge again", { duration: 4000 });
                          return;
                        }
                        setPosSplitMode(true); setPosSplitCash((computeTotals(totalPrice, "cash").total / 2).toFixed(2));
                      }}
                      disabled={isProcessing || !!paymentRecovery}
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
            <div className="bg-background rounded-md shadow-2xl max-w-md w-full p-6 border border-border">
              <h3 className="font-display text-xl font-bold text-foreground mb-1">Cash payment — Order #{orderNumber}</h3>
              <p className="text-base text-muted-foreground mb-4">
                Total due: <strong className="text-foreground text-lg">${cashTotal.toFixed(2)}</strong>
              </p>

              <label className="text-sm font-semibold text-foreground">Cash received</label>
              <div className="relative mt-1 mb-3">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full pl-9 pr-4 py-4 bg-muted/40 border-2 border-border rounded-sm text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {quickBills.map((b, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setCashTendered(b.toFixed(2))}
                    className="min-h-[44px] py-2 text-base font-sans font-bold bg-muted hover:bg-muted/70 border border-border rounded-sm active:scale-95 transition-all"
                  >
                    {i === 0 ? "Exact" : `$${b}`}
                  </button>
                ))}
              </div>

              {/* Number keypad */}
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      if (key === "⌫") {
                        setCashTendered((prev) => prev.slice(0, -1));
                      } else if (key === ".") {
                        setCashTendered((prev) => prev.includes(".") ? prev : prev + ".");
                      } else {
                        setCashTendered((prev) => {
                          const next = prev + key;
                          // Limit to 2 decimal places
                          const parts = next.split(".");
                          if (parts[1] && parts[1].length > 2) return prev;
                          return next;
                        });
                      }
                    }}
                    className={`min-h-[52px] py-3 text-xl font-sans font-bold rounded-sm active:scale-95 transition-all ${
                      key === "⌫"
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30"
                        : "bg-card hover:bg-muted border border-border"
                    }`}
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCashTendered("")}
                  className="col-span-3 min-h-[40px] py-2 text-sm font-sans font-bold text-muted-foreground bg-muted/50 hover:bg-muted border border-border rounded-sm active:scale-95 transition-all uppercase tracking-wider"
                >
                  Clear
                </button>
              </div>

              <div className={`rounded-sm p-4 mb-4 ${insufficient ? "bg-destructive/10 border-2 border-destructive/30" : "bg-emerald-50 border-2 border-emerald-200"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-sans font-bold uppercase tracking-wider ${insufficient ? "text-destructive" : "text-emerald-800"}`}>
                    {insufficient ? "Short by" : "Change due"}
                  </span>
                  <span className={`text-3xl font-sans font-bold ${insufficient ? "text-destructive" : "text-emerald-800"}`}>
                    ${(insufficient ? cashTotal - tendered : change).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={!canConfirm}
                  onClick={async () => {
                    setNewOrderCashConfirm(false);
                    const changeGiven = change;
                    const cashIn = tendered;
                    try {
                      const savedId = await saveOrder("cash");
                      toast.success(
                        changeGiven > 0
                          ? `Cash $${cashIn.toFixed(2)} · Change $${changeGiven.toFixed(2)}`
                          : `Cash order #${orderNumber} — $${cashTotal.toFixed(2)}`,
                        { duration: 2500 }
                      );
                      askToPrint(savedId, `#${orderNumber}`, cashTotal);
                      resetOrder();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to save order");
                    }
                  }}
                  className="min-h-[52px] py-3.5 bg-emerald-600 text-white font-sans font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm & Save
                </button>
                <button
                  type="button"
                  onClick={() => setNewOrderCashConfirm(false)}
                  className="min-h-[52px] py-3.5 bg-muted text-foreground font-sans font-bold text-sm rounded-sm hover:bg-muted/80 active:scale-[0.96]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Print receipt prompt — fires after every successful payment */}
      {printPrompt && (
        <div className="fixed inset-0 bg-foreground/40 z-[70] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5">
            <div className="flex items-center gap-2 mb-1">
              <Printer className="w-5 h-5 text-accent" />
              <h3 className="font-display text-lg font-bold text-foreground">Print receipt?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Order <strong>{printPrompt.tag}</strong> — <strong>${printPrompt.total.toFixed(2)}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const { orderId } = printPrompt;
                  setPrintPrompt(null);
                  await handlePrintReceipt(orderId);
                }}
                className="py-2.5 bg-primary text-primary-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.96]"
              >
                Yes — print
              </button>
              <button
                onClick={() => setPrintPrompt(null)}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96]"
              >
                No
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

      {/* Unpaid order payment recovery — terminal may have approved after timeout */}
      {unpaidRecovery && (
        <div className="fixed inset-0 bg-foreground/40 z-[65] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5 border-2 border-amber-400">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">Check terminal — {unpaidRecovery.tag}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Payment for <strong>${unpaidRecovery.total.toFixed(2)}</strong> may have gone through on the reader. Do <strong>not</strong> tap Card again unless you confirmed it declined.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={handleRecoverUnpaidPayment}
                disabled={!!unpaidInFlight}
                className="py-3 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96] disabled:opacity-50"
              >
                Payment went through
              </button>
              <button
                onClick={async () => {
                  if (unpaidRecovery.knownApproved) {
                    toast.error(
                      "Card already charged — do NOT retry Card. Tap Payment went through or void on the terminal.",
                      { duration: 10000 }
                    );
                    return;
                  }
                  const ok = window.confirm(
                    "Only continue if the terminal showed DECLINED or cancelled.\n\nIf the customer already paid, tapping Card again will DOUBLE-CHARGE them.\n\nContinue and allow a new card attempt?"
                  );
                  if (!ok) return;
                  const reqTxnId = unpaidRecovery.reqTxnId;
                  setUnpaidRecovery(null);
                  checkoutLockRef.current = false;
                  setUnpaidInFlight(null);
                  await cancelValorTransaction(selectedEpi, selectedAppKey, reqTxnId);
                }}
                disabled={!!unpaidInFlight}
                className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96] disabled:opacity-50"
              >
                {unpaidRecovery.knownApproved ? "Do not retry card" : "No payment — try card again"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment recovery — terminal may have approved after a timeout */}
      {paymentRecovery && (
        <div className="fixed inset-0 bg-foreground/40 z-[65] flex items-center justify-center p-4">
          <div className="bg-background rounded-md shadow-2xl max-w-sm w-full p-5 border-2 border-amber-400">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">
              {paymentRecovery.knownApproved ? "Card charged — finish saving order" : "Check terminal before retrying"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {paymentRecovery.knownApproved ? (
                <>
                  The card reader already approved this payment but the POS failed to save. Tap <strong>Payment went through</strong> to retry save — do <strong>not</strong> run card again.
                </>
              ) : (
                <>
                  The POS lost contact with the terminal. If the customer already paid on the card reader, tap <strong>Payment went through</strong> — do <strong>not</strong> run card again or you may double-charge.
                </>
              )}
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={handleRecoverPayment}
                disabled={isProcessing}
                className="py-3 bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.96] disabled:opacity-50"
              >
                {isProcessing
                  ? paymentRecovery.knownApproved || paymentRecovery.approvedResult
                    ? "Saving order…"
                    : "Checking terminal…"
                  : "Payment went through"}
              </button>
              {!paymentRecovery.knownApproved && (
                <>
                  <button
                    onClick={async () => {
                      const ok = window.confirm(
                        "Only use this if the customer paid CASH and the card was NOT charged.\n\nIf the card machine already took money, do NOT use this — tap Payment went through instead.\n\nContinue as cash?"
                      );
                      if (!ok) return;
                      await dismissPaymentRecovery(true);
                      setCashFallbackOpen(true);
                    }}
                    disabled={isProcessing}
                    className="py-2.5 bg-primary text-primary-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
                  >
                    Customer paid cash instead
                  </button>
                  <button
                    onClick={async () => {
                      const ok = window.confirm(
                        "Only continue if the terminal showed DECLINED or cancelled.\n\nIf the customer already paid, tapping Card again will DOUBLE-CHARGE them.\n\nContinue and allow a new card attempt?"
                      );
                      if (!ok) return;
                      await dismissPaymentRecovery(true);
                    }}
                    disabled={isProcessing}
                    className="py-2.5 bg-muted text-muted-foreground font-sans font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-muted/80 active:scale-[0.96] disabled:opacity-50"
                  >
                    No payment — try card again
                  </button>
                </>
              )}
              {paymentRecovery.knownApproved && (
                <p className="text-[11px] text-amber-700 text-center mt-1">
                  Card retry is locked — use Payment went through, Pending Payments, or void on the terminal.
                </p>
              )}
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
                onClick={() => {
                  setCashFallbackOpen(false);
                  checkoutLockRef.current = false;
                  blockedCardRetryRef.current = false;
                  setIsProcessing(false);
                  setInFlightTxnId(null);
                }}
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
                  onChange={(e) => {
                    setHistoryDateFilter(e.target.value);
                    setHistoryCustomRange(null);
                  }}
                  disabled={!!historyCustomRange}
                  className="flex-1 px-2 py-1.5 bg-muted border border-border rounded-sm text-xs font-sans focus:outline-none disabled:opacity-50"
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
              <Popover open={historyDatePickerOpen} onOpenChange={setHistoryDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-sans font-semibold rounded-sm border transition-all ${
                      historyCustomRange
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {historyCustomRange
                      ? historyCustomRange.from.getTime() === historyCustomRange.to.getTime()
                        ? historyCustomRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : `${historyCustomRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${historyCustomRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : "Pick Date Range"}
                    {historyCustomRange && (
                      <X
                        className="w-3 h-3 ml-1 opacity-80 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHistoryCustomRange(null);
                        }}
                      />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    showOutsideDays={false}
                    defaultMonth={historyCustomRange?.from ?? new Date()}
                    selected={historyCustomRange ? { from: historyCustomRange.from, to: historyCustomRange.to } : undefined}
                    onSelect={(r) => {
                      if (r?.from) {
                        const to = r.to ?? r.from;
                        setHistoryCustomRange({ from: r.from, to });
                        if (r.to) setHistoryDatePickerOpen(false);
                      }
                    }}
                    disabled={(d) => d > new Date()}
                    classNames={{
                      day: "inline-flex items-center justify-center h-9 w-9 p-0 text-sm font-normal text-foreground rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:opacity-100",
                      day_disabled: "text-muted-foreground/40 opacity-50",
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {(() => {
                const now = new Date();
                const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0,0,0,0);

                const filtered = orderHistory.filter((order) => {
                  // Date filter — custom range overrides preset filter
                  const orderDate = new Date(order.created_at);
                  if (historyCustomRange) {
                    const start = new Date(historyCustomRange.from);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(historyCustomRange.to);
                    end.setHours(0, 0, 0, 0);
                    end.setDate(end.getDate() + 1);
                    if (orderDate < start || orderDate >= end) return false;
                  } else {
                    if (historyDateFilter === "today" && orderDate < todayStart) return false;
                    if (historyDateFilter === "week" && orderDate < weekStart) return false;
                  }

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
                          <span className="text-sm font-bold text-accent truncate max-w-[180px]">
                            {order.customer_name || `#${order.id.slice(0, 6).toUpperCase()}`}
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
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-bold text-xs text-accent">${order.total.toFixed(2)}</span>
                          {order.payment_status === "paid" && (
                            <button
                              onClick={() => handlePrintReceipt(order.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-primary/90 active:scale-95 transition-all"
                              title="Print receipt"
                            >
                              <Printer className="w-3 h-3" />
                              Print
                            </button>
                          )}
                        </div>
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

                // Payment breakdown — count and revenue per method
                const byPayment = { card: 0, cash: 0 };
                const revenueByPayment = { card: 0, cash: 0 };
                activeOrders.forEach((o) => {
                  const pay = (o.payment || "card") as keyof typeof byPayment;
                  byPayment[pay] = (byPayment[pay] || 0) + 1;
                  revenueByPayment[pay] = (revenueByPayment[pay] || 0) + o.total;
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
                          <p className="text-sm font-bold text-blue-700 mt-1">${revenueByPayment.card.toFixed(2)}</p>
                        </div>
                        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-sm p-3 text-center">
                          <p className="text-xl font-bold text-emerald-700">{byPayment.cash}</p>
                          <p className="text-[10px] text-emerald-600 uppercase">Cash</p>
                          <p className="text-sm font-bold text-emerald-700 mt-1">${revenueByPayment.cash.toFixed(2)}</p>
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

      {/* Confirm removal of a Quick Item */}
      {quickItemPendingRemoval && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQuickItemPendingRemoval(null)}
        >
          <div
            className="bg-background border border-border rounded-md shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-sans font-bold text-base mb-1">Remove from Quick Items?</h2>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{quickItemPendingRemoval.name}</span>{" "}
                will be removed from the Quick Items shortcut. The item stays in your menu — you can
                re-add it anytime via "Manage Quick Items".
              </p>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => setQuickItemPendingRemoval(null)}
                className="px-4 py-2 border border-border bg-background text-foreground font-sans font-bold text-xs rounded-sm hover:bg-muted active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = quickItemPendingRemoval.id;
                  setQuickItemIds((prev) => prev.filter((qid) => qid !== id));
                  setQuickItemPendingRemoval(null);
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground font-sans font-bold text-xs rounded-sm hover:opacity-90 active:scale-95 transition-all"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printer IP config */}
      {showPrinterConfig && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowPrinterConfig(false)}
        >
          <div
            className="bg-background border border-border rounded-md shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-sans font-bold text-base flex items-center gap-2">
                <Printer className="w-4 h-4 text-accent" />
                Printer settings
              </h2>
              <button
                onClick={() => setShowPrinterConfig(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-xs font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                  Receipt printer IP (LAN)
                </span>
                <input
                  type="text"
                  value={printerIpInput}
                  onChange={(e) => {
                    setPrinterIpInput(e.target.value.trim());
                    setPrinterTestState("idle");
                  }}
                  placeholder="192.168.1.203"
                  className="mt-1 w-full px-3 py-2 bg-muted border border-border rounded-sm text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                The Epson TM-m30III's IP on your store Wi-Fi. Find it via the printer's panel → Network Status Sheet, or your router's DHCP list. Receipts print over the LAN — no cloud trip required.
              </p>

              {printerTestState !== "idle" && (
                <div
                  className={`text-xs px-3 py-2 rounded-sm border ${
                    printerTestState === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : printerTestState === "fail"
                        ? "bg-destructive/10 border-destructive/30 text-destructive"
                        : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {printerTestMsg}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  disabled={!printerIpInput || printerTestState === "testing"}
                  onClick={async () => {
                    setPrinterTestState("testing");
                    setPrinterTestMsg("Sending a small test page to the printer…");
                    const xml =
                      `<?xml version="1.0" encoding="utf-8"?>` +
                      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
                      `<s:Body>` +
                      `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">` +
                      `<text align="center"/><text width="2" height="2">TEST PRINT&#10;</text>` +
                      `<text width="1" height="1">Fenton Gyro POS&#10;</text>` +
                      `<feed line="2"/><cut type="feed"/>` +
                      `</epos-print></s:Body></s:Envelope>`;
                    try {
                      const resp = await fetch(
                        `http://${printerIpInput}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
                          body: xml,
                        }
                      );
                      const text = await resp.text();
                      if (!resp.ok || !text.includes('success="true"')) {
                        throw new Error(`Printer returned ${resp.status}`);
                      }
                      setPrinterTestState("ok");
                      setPrinterTestMsg("Printer reachable. Test page should be coming out now.");
                    } catch (err) {
                      setPrinterTestState("fail");
                      setPrinterTestMsg(
                        err instanceof Error
                          ? `Couldn't reach printer: ${err.message}`
                          : "Couldn't reach printer."
                      );
                    }
                  }}
                  className="px-3 py-2 border border-border bg-background text-foreground text-xs font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-muted active:scale-95 disabled:opacity-50"
                >
                  Test print
                </button>
                <button
                  disabled={!printerIpInput || printerTestState === "testing"}
                  onClick={async () => {
                    setPrinterTestState("testing");
                    setPrinterTestMsg("Kicking cash drawer…");
                    try {
                      await kickCashDrawer(printerIpInput);
                      // Wait a moment for the drawer to physically open, then
                      // query the printer's status to check the drawer sensor.
                      await new Promise((r) => setTimeout(r, 600));
                      const statusXml =
                        `<?xml version="1.0" encoding="utf-8"?>` +
                        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
                        `<s:Body>` +
                        `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">` +
                        `</epos-print></s:Body></s:Envelope>`;
                      const resp = await fetch(
                        `http://${printerIpInput}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=5000`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
                          body: statusXml,
                        }
                      );
                      const text = await resp.text();
                      // Epson status byte: drawer pin 3 = bit 2 (0x04).
                      // status includes "drawer" attribute or the numeric status.
                      // If the drawer sensor reports open → cable is connected.
                      const drawerOpen = /drawer_open/.test(text) || /DRAWER_OPEN/.test(text);
                      // Also check status bitmask — bit 2 of the status byte = drawer open
                      const statusMatch = text.match(/status="(\d+)"/);
                      const statusBits = statusMatch ? parseInt(statusMatch[1], 10) : 0;
                      const drawerBit = (statusBits & 0x04) !== 0;
                      if (drawerOpen || drawerBit) {
                        setPrinterTestState("ok");
                        setPrinterTestMsg("✅ Cash drawer opened — cable connected and working.");
                      } else {
                        setPrinterTestState("ok");
                        setPrinterTestMsg("⚠️ Drawer kick sent — check if it opened. If not, verify the RJ11 cable from the drawer is plugged into the printer's DK port.");
                      }
                    } catch (err) {
                      setPrinterTestState("fail");
                      setPrinterTestMsg(
                        err instanceof Error
                          ? `Drawer test failed: ${err.message}. Check printer IP and connection.`
                          : "Drawer test failed."
                      );
                    }
                  }}
                  className="px-3 py-2 border border-border bg-background text-foreground text-xs font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-muted active:scale-95 disabled:opacity-50"
                >
                  Test drawer
                </button>
                <button
                  disabled={!printerIpInput}
                  onClick={() => {
                    setPrinterIp(printerIpInput);
                    toast.success(`Printer IP saved: ${printerIpInput}`, { duration: 1800 });
                    setShowPrinterConfig(false);
                  }}
                  className="ml-auto px-4 py-2 bg-primary text-primary-foreground text-xs font-sans font-bold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Items picker */}
      {showQuickPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowQuickPicker(false)}>
          <div className="bg-background border border-border rounded-md shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h2 className="font-sans font-bold text-base">Manage Quick Items</h2>
              <button onClick={() => setShowQuickPicker(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {categories.map((cat) => (
                <div key={cat}>
                  <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {menuItems.filter((m) => m.category === cat).map((item) => {
                      const active = quickItemIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() =>
                            setQuickItemIds((prev) =>
                              active ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                            )
                          }
                          className={`text-left px-2 py-1.5 rounded-sm border-2 transition-all flex items-center justify-between gap-2 ${
                            active ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/40"
                          }`}
                        >
                          <span className="font-sans text-xs font-semibold truncate">{item.name}</span>
                          <span className="font-sans text-xs font-bold text-accent shrink-0">${item.price.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between shrink-0">
              <span className="text-xs font-sans text-muted-foreground">{quickItemIds.length} selected</span>
              <button
                onClick={() => setShowQuickPicker(false)}
                className="px-4 py-2 bg-primary text-primary-foreground font-sans font-bold text-xs rounded-sm hover:opacity-90 active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
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
