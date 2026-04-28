import { useState, useEffect, useRef, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  RefreshCw,
  Globe,
  ChefHat,
  CheckCircle2,
  Clock,
  Phone,
  User,
  ChevronDown,
  X,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Order, OrderStatus } from "@/data/orders";
import { subscribeToOrders, updateOrderStatus } from "@/lib/orders";
import { toast } from "sonner";

const STATUS_BADGE: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending" },
  received: { bg: "bg-green-100", text: "text-green-700", label: "Received" },
  preparing: { bg: "bg-orange-100", text: "text-orange-700", label: "Preparing" },
  ready: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Ready" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Completed" },
  cancelled: { bg: "bg-red-100", text: "text-red-700", label: "Cancelled" },
};

const COUNTER_STYLES: { status: OrderStatus; color: string }[] = [
  { status: "pending", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { status: "received", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { status: "preparing", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { status: "ready", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { status: "completed", color: "text-primary bg-primary/5 border-primary/20" },
  { status: "cancelled", color: "text-red-600 bg-red-50 border-red-200" },
];

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

/** Legacy tickets said "Add Fries/Tots + …" without "Combo:" — normalize for the line. */
const formatModifierLineForKitchen = (m: string): string => {
  const t = m.trim();
  if (/^combo:/i.test(t)) return t;
  if (/fries\/tots/i.test(t) && /fountain|drink/i.test(t)) return `Combo: ${t}`;
  return t;
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
};

/** Completed bucket resets each local calendar day (display only; data stays in Firestore). */
const isSameLocalCalendarDay = (iso: string): boolean => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

interface OrderCardProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  actionLabel?: string;
  actionStatus?: OrderStatus;
}

const SOURCE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pos: { bg: "bg-blue-100", text: "text-blue-700", label: "POS" },
  kiosk: { bg: "bg-purple-100", text: "text-purple-700", label: "KIOSK" },
  web: { bg: "bg-amber-100", text: "text-amber-700", label: "WEB" },
};

const OrderCard = ({ order, onStatusChange, actionLabel, actionStatus }: OrderCardProps) => {
  const sourceBadge = order.source ? SOURCE_BADGE[order.source] : null;

  return (
  <div className={`bg-card border-2 rounded-sm p-4 hover-lift ${
    order.source === "pos" ? "border-blue-200" :
    order.source === "kiosk" ? "border-purple-200" :
    order.source === "web" ? "border-amber-200" :
    "border-border"
  }`}>
    {/* Header */}
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-accent truncate max-w-[180px]">{order.customer_name || `#${order.id.slice(0, 6).toUpperCase()}`}</span>
        {sourceBadge && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold tracking-wider ${sourceBadge.bg} ${sourceBadge.text}`}>
            {sourceBadge.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-sans font-semibold ${STATUS_BADGE[order.status].bg} ${STATUS_BADGE[order.status].text}`}>
          {order.status === "received" && <CheckCircle2 className="w-3 h-3" />}
          {order.status === "ready" && <ChefHat className="w-3 h-3" />}
          {STATUS_BADGE[order.status].label}
        </span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(order.created_at)}</span>
      </div>
    </div>

    {/* Items */}
    <div className="space-y-2 mb-3 pb-3 border-b border-border/50">
      {order.items.map((item, i) => (
        <div key={i} className="text-base text-foreground leading-snug">
          <p className="font-semibold">
            <span className="text-muted-foreground font-bold">{item.quantity}×</span> {item.name}
          </p>
          {item.modifiers && item.modifiers.length > 0 && (
            <>
              {item.quantity > 1 && (
                <p className="ml-4 mt-1.5 text-sm font-bold text-amber-950 tracking-tight">
                  Each of the {item.quantity} includes:
                </p>
              )}
              <ul className="ml-4 mt-1 text-sm text-foreground/90 list-disc marker:text-accent space-y-0.5">
                {item.modifiers.map((m, j) => (
                  <li key={j} className="font-medium">{formatModifierLineForKitchen(m)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>

    {/* Customer */}
    <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5 font-mono">
        <User className="w-3 h-3" />
        #{order.id.slice(0, 6).toUpperCase()}
      </span>
      <span className="flex items-center gap-1">
        <Phone className="w-3 h-3" />
        {order.customer_phone}
      </span>
    </div>

    {/* Controls */}
    <div className="flex items-center gap-2 mb-3">
      <div className="relative">
        <select
          value={order.status}
          onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
          className="appearance-none pl-2.5 pr-7 py-1.5 bg-background border border-border rounded-sm text-xs font-sans cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
      </div>
      <div className="relative">
        <select
          defaultValue={order.prep_time}
          className="appearance-none pl-2.5 pr-7 py-1.5 bg-background border border-border rounded-sm text-xs font-sans cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {PREP_OPTIONS.map((t) => (
            <option key={t} value={t}>{t} min</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
      </div>
    </div>

    {/* Action button */}
    {actionLabel && actionStatus && (
      <button
        onClick={() => onStatusChange(order.id, actionStatus)}
        className="w-full py-2.5 bg-accent text-accent-foreground font-sans font-semibold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
      >
        {actionLabel}
      </button>
    )}
  </div>
  );
};

const KitchenDisplay = () => {
  const { user, role, loading, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [takingOrders, setTakingOrders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const webAlertRef = useRef<HTMLAudioElement | null>(null);
  const posKioskAlertRef = useRef<HTMLAudioElement | null>(null);
  const pendingWebCountRef = useRef(0);
  const seenPosKioskIdsRef = useRef<Set<string>>(new Set());
  const didInitPosKioskRef = useRef(false);

  // Preload notification sounds — web alert loops continuously, POS/kiosk chime plays once
  useEffect(() => {
    webAlertRef.current = new Audio("/sounds/order-notification.wav");
    webAlertRef.current.volume = 0.8;
    webAlertRef.current.loop = true;
    posKioskAlertRef.current = new Audio("/sounds/order-notification.wav");
    posKioskAlertRef.current.volume = 0.8;
  }, []);

  const playPosKioskChime = useCallback(() => {
    if (!soundEnabled || !posKioskAlertRef.current) return;
    posKioskAlertRef.current.currentTime = 0;
    posKioskAlertRef.current.play().catch(() => {});
  }, [soundEnabled]);

  // Continuous alert — loops until all pending web orders are accepted/rejected
  useEffect(() => {
    const pendingWebOrders = orders.filter(
      (o) => o.status === "pending" && o.source === "web"
    );
    const audio = webAlertRef.current;

    if (pendingWebOrders.length > 0 && soundEnabled && audio) {
      if (pendingWebOrders.length > pendingWebCountRef.current) {
        toast.info(
          `🔔 ${pendingWebOrders.length} web order${pendingWebOrders.length > 1 ? "s" : ""} waiting for approval!`,
          { duration: 5000 }
        );
      }
      if (audio.paused) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } else if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    pendingWebCountRef.current = pendingWebOrders.length;

    // One-time chime for new POS/kiosk orders (auto-accepted as "received").
    // Skip the very first render so existing orders don't ring on page load.
    const posKioskOrders = orders.filter(
      (o) => (o.source === "pos" || o.source === "kiosk") && o.status !== "completed" && o.status !== "rejected"
    );
    if (didInitPosKioskRef.current) {
      const newOnes = posKioskOrders.filter((o) => !seenPosKioskIdsRef.current.has(o.id));
      if (newOnes.length > 0) {
        playPosKioskChime();
      }
    } else {
      didInitPosKioskRef.current = true;
    }
    seenPosKioskIdsRef.current = new Set(posKioskOrders.map((o) => o.id));
  }, [orders, soundEnabled, playPosKioskChime]);

  // Real-time Firestore listener — exclude unpaid kiosk cash orders
  useEffect(() => {
    const unsubscribe = subscribeToOrders((liveOrders) => {
      setOrders(liveOrders.filter((o) => o.payment_status !== "unpaid"));
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user || (role !== "chef" && role !== "admin")) {
    return <Navigate to="/auth?redirect=/kitchen" replace />;
  }

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    // Optimistic update
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      await updateOrderStatus(id, status);
      toast.success(`Order #${id.slice(0, 6).toUpperCase()} → ${status}`);
    } catch (err) {
      toast.error("Failed to update order status");
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // Firestore listener auto-refreshes, just visual feedback
    setTimeout(() => { setRefreshing(false); toast.success("Refreshed"); }, 600);
  };

  const handleAcceptAll = async () => {
    const pending = orders.filter((o) => o.status === "pending");
    setOrders((prev) =>
      prev.map((o) => (o.status === "pending" ? { ...o, status: "received" } : o))
    );
    await Promise.all(pending.map((o) => updateOrderStatus(o.id, "received")));
    toast.success("All pending orders accepted");
  };

  const countByStatus = (s: OrderStatus) =>
    s === "completed"
      ? orders.filter((o) => o.status === "completed" && isSameLocalCalendarDay(o.created_at)).length
      : orders.filter((o) => o.status === s).length;
  const pending = orders.filter((o) => o.status === "pending"); // web orders waiting for chef
  const received = orders.filter((o) => o.status === "received");
  const preparing = orders.filter((o) => o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready");
  const completedToday = orders.filter((o) => o.status === "completed" && isSameLocalCalendarDay(o.created_at));
  const cancelled = orders.filter((o) => o.status === "cancelled");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-accent" />
              <h1 className="font-serif text-xl font-medium">Kitchen Display</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSoundEnabled(!soundEnabled); toast.info(soundEnabled ? "Sound off" : "Sound on"); }}
              className={`relative w-9 h-9 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all ${soundEnabled ? "" : "text-muted-foreground"}`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {countByStatus("pending") > 0 && countByStatus("received") === 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full animate-pulse" />
              )}
            </button>
            <button
              onClick={() => { setTakingOrders(!takingOrders); toast.info(takingOrders ? "Paused orders" : "Now taking orders"); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                takingOrders
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${takingOrders ? "bg-accent-foreground animate-pulse" : "bg-muted-foreground"}`} />
              {takingOrders ? "Taking Orders" : "Paused"}
            </button>
            <button
              onClick={handleAcceptAll}
              className="px-3 py-2 border border-border text-xs font-sans font-semibold uppercase tracking-wider rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-[0.97] transition-all"
            >
              Accept All
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={async () => await signOut()}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-xs font-sans font-semibold uppercase tracking-wider rounded-sm text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6 animate-fade-up opacity-0">
        {/* Status counters */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {COUNTER_STYLES.map(({ status, color }) => (
            <div key={status} className={`border rounded-sm p-4 text-center ${color}`}>
              <p className="text-3xl font-sans font-bold">{countByStatus(status)}</p>
              <p className="text-xs font-sans font-semibold uppercase tracking-wider mt-1 opacity-80">
                {status === "cancelled" ? "Rejected" : status.charAt(0).toUpperCase() + status.slice(1)}
              </p>
            </div>
          ))}
        </div>

        {/* Pending Web Orders — Chef must accept */}
        {pending.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-600" />
                <h2 className="font-serif text-lg font-medium text-amber-900">
                  New Online Orders ({pending.length})
                </h2>
              </div>
              <button
                onClick={handleAcceptAll}
                className="px-4 py-2 bg-amber-600 text-white text-xs font-sans font-bold uppercase tracking-wider rounded-sm hover:bg-amber-700 active:scale-[0.97] transition-all"
              >
                Accept All
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {pending.map((o) => (
                <div key={o.id}>
                  <OrderCard order={o} onStatusChange={handleStatusChange} />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => handleStatusChange(o.id, "received")}
                      className="py-2.5 bg-emerald-600 text-white font-sans font-semibold text-xs uppercase tracking-wider rounded-sm hover:bg-emerald-700 active:scale-[0.97] transition-all"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleStatusChange(o.id, "cancelled")}
                      className="py-2.5 bg-red-600 text-white font-sans font-semibold text-xs uppercase tracking-wider rounded-sm hover:bg-red-700 active:scale-[0.97] transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kanban columns */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Received */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <h2 className="font-serif text-lg font-medium">Received ({received.length})</h2>
            </div>
            <div className="space-y-4">
              {received.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12 bg-card border border-border rounded-sm">No orders</p>
              )}
              {received.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} actionLabel="Start Preparing" actionStatus="preparing" />
              ))}
            </div>
          </div>

          {/* Preparing */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-orange-600" />
              <h2 className="font-serif text-lg font-medium">Preparing ({preparing.length})</h2>
            </div>
            <div className="space-y-4">
              {preparing.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12 bg-card border border-border rounded-sm">No orders</p>
              )}
              {preparing.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} actionLabel="Mark Ready" actionStatus="ready" />
              ))}
            </div>
          </div>

          {/* Ready for Pickup */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ChefHat className="w-4 h-4 text-emerald-600" />
              <h2 className="font-serif text-lg font-medium">Ready for Pickup ({ready.length})</h2>
            </div>
            <div className="space-y-4">
              {ready.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12 bg-card border border-border rounded-sm">No orders</p>
              )}
              {ready.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} actionLabel="Complete" actionStatus="completed" />
              ))}
            </div>
          </div>
        </div>

        {/* Completed collapsible */}
        <div className="bg-card border border-border rounded-sm">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-lg font-medium">Completed today ({completedToday.length})</h2>
            </div>
            <span className="text-sm text-muted-foreground font-sans font-semibold">
              {showCompleted ? "Hide" : "Show"}
            </span>
          </button>
          {showCompleted && (
            <div className="px-5 pb-5 grid md:grid-cols-3 gap-4">
              {completedToday.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} />
              ))}
              {completedToday.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-3 text-center py-6">No completed orders today</p>
              )}
            </div>
          )}
        </div>

        {/* Rejected collapsible */}
        <div className="bg-card border border-border rounded-sm">
          <button
            onClick={() => setShowRejected(!showRejected)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <X className="w-4 h-4 text-destructive" />
              <h2 className="font-serif text-lg font-medium">Rejected Orders ({cancelled.length})</h2>
            </div>
            <span className="text-sm text-muted-foreground font-sans font-semibold">
              {showRejected ? "Hide" : "Show"}
            </span>
          </button>
          {showRejected && (
            <div className="px-5 pb-5 grid md:grid-cols-3 gap-4">
              {cancelled.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} />
              ))}
              {cancelled.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-3 text-center py-6">No rejected orders</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default KitchenDisplay;
