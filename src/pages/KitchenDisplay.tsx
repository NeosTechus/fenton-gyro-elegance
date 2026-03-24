import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  RefreshCw,
  ChefHat,
  CheckCircle2,
  Clock,
  Phone,
  User,
  ChevronDown,
  X,
  LogOut,
  Monitor,
  Tablet,
  Globe,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/data/orders";
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

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
};

interface OrderCardProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  actionLabel?: string;
  actionStatus?: OrderStatus;
}

const SOURCE_BADGE: Record<string, { icon: typeof Monitor; label: string; cls: string }> = {
  pos: { icon: Monitor, label: "POS", cls: "bg-blue-100 text-blue-700" },
  kiosk: { icon: Tablet, label: "Kiosk", cls: "bg-purple-100 text-purple-700" },
  website: { icon: Globe, label: "Website", cls: "bg-amber-100 text-amber-700" },
};

const OrderCard = ({ order, onStatusChange, actionLabel, actionStatus }: OrderCardProps) => {
  const sourceMeta = SOURCE_BADGE[order.source] || SOURCE_BADGE.website;
  const SourceIcon = sourceMeta.icon;
  return (
  <div className="bg-card border border-border rounded-sm p-4 hover-lift">
    {/* Header */}
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold text-accent">#{order.id.slice(0, 6).toUpperCase()}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-sans font-bold ${sourceMeta.cls}`}>
          <SourceIcon className="w-2.5 h-2.5" />
          {sourceMeta.label}
        </span>
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
    <div className="space-y-1 mb-3 pb-3 border-b border-border/50">
      {order.items.map((item, i) => (
        <p key={i} className="text-sm text-foreground">
          <span className="text-muted-foreground">{item.quantity}x</span>{" "}
          {item.name}
        </p>
      ))}
    </div>

    {/* Customer */}
    <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <User className="w-3 h-3" />
        {order.customer_name}
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
  const { role, signOut } = useAuth();
  const { orders, updateStatus, acceptAllPending } = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [takingOrders, setTakingOrders] = useState(true);

  if (role !== "chef" && role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center p-8">
        <h1 className="font-serif text-2xl font-medium mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-4">Only chef accounts can access this page.</p>
        <Link to="/auth" className="text-accent hover:underline text-sm font-sans font-semibold">Sign in as Chef</Link>
      </div>
    );
  }

  const handleStatusChange = (id: string, status: OrderStatus) => {
    updateStatus(id, status);
    toast.success(`Order #${id.slice(0, 6).toUpperCase()} → ${status}`);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); toast.success("Refreshed"); }, 600);
  };

  const handleAcceptAll = () => {
    acceptAllPending();
    toast.success("All pending orders accepted");
  };

  const countByStatus = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
  const received = orders.filter((o) => o.status === "received");
  const preparing = orders.filter((o) => o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready");
  const completed = orders.filter((o) => o.status === "completed");
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
            <button className="relative w-9 h-9 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all">
              <Bell className="w-4 h-4" />
              {countByStatus("pending") > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
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
              <h2 className="font-serif text-lg font-medium">Completed Orders ({completed.length})</h2>
            </div>
            <span className="text-sm text-muted-foreground font-sans font-semibold">
              {showCompleted ? "Hide" : "Show"}
            </span>
          </button>
          {showCompleted && (
            <div className="px-5 pb-5 grid md:grid-cols-3 gap-4">
              {completed.map((o) => (
                <OrderCard key={o.id} order={o} onStatusChange={handleStatusChange} />
              ))}
              {completed.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-3 text-center py-6">No completed orders</p>
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
