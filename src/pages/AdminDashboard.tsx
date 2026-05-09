import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Bell, LogOut, ChefHat, Settings, Monitor, Wifi, WifiOff, Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/context/AuthContext";
import { Order, OrderStatus } from "@/data/orders";
import { subscribeToOrders, updateOrderStatus } from "@/lib/orders";
import { getEPIs, refreshAllStatuses, ValorEPI } from "@/lib/valor-epi";
import StatsCards from "@/components/admin/StatsCards";
import RevenueChart from "@/components/admin/RevenueChart";
import OrderStatusChart from "@/components/admin/OrderStatusChart";
import ItemSalesChart from "@/components/admin/OrdersByHourChart";
import OrdersTable from "@/components/admin/OrdersTable";
import { toast } from "sonner";

const AdminDashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [terminals, setTerminals] = useState<ValorEPI[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Real-time Firestore listener — admin needs full history for analytics
  useEffect(() => {
    const unsubscribe = subscribeToOrders((liveOrders) => {
      setOrders(liveOrders);
    });
    return () => unsubscribe();
  }, []);

  // Load terminals
  useEffect(() => {
    setTerminals(getEPIs());
  }, []);

  const checkDeviceHealth = async () => {
    setCheckingHealth(true);
    const updated = await refreshAllStatuses();
    setTerminals(updated);
    setCheckingHealth(false);
    toast.success(`${updated.filter((t) => t.online).length}/${updated.length} devices online`);
  };

  // Earliest POS/kiosk order timestamp — minimum bound for the date picker
  const firstPosKioskDate = (() => {
    const ts = orders
      .filter((o) => o.source === "pos" || o.source === "kiosk")
      .map((o) => new Date(o.created_at).getTime())
      .filter((t) => Number.isFinite(t));
    if (ts.length === 0) return null;
    const d = new Date(Math.min(...ts));
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // Filter orders by range (or custom date range if set)
  const now = new Date();
  const { rangeStart, rangeEnd } = (() => {
    if (customRange) {
      const start = new Date(customRange.from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customRange.to);
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1); // inclusive of "to" day
      return { rangeStart: start, rangeEnd: end };
    }
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    switch (analyticsRange) {
      case "daily":
        return { rangeStart: start, rangeEnd: end };
      case "weekly": {
        const s = new Date(start);
        s.setDate(s.getDate() - s.getDay()); // Sunday of this week
        return { rangeStart: s, rangeEnd: end };
      }
      case "monthly":
        return { rangeStart: new Date(now.getFullYear(), now.getMonth(), 1), rangeEnd: end };
      case "yearly":
        return { rangeStart: new Date(now.getFullYear(), 0, 1), rangeEnd: end };
    }
  })();
  const filteredOrders = orders.filter((o) => {
    const t = new Date(o.created_at).getTime();
    return t >= rangeStart.getTime() && t < rangeEnd.getTime();
  });
  const activeOrders = filteredOrders.filter((o) => o.status !== "cancelled");

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user || role !== "admin") {
    return <Navigate to="/auth?redirect=/admin" replace />;
  }

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status } : o))
    );
    try {
      await updateOrderStatus(id, status);
      toast.success(`Order ${id.slice(0, 6)} updated to ${status}`);
    } catch {
      toast.error("Failed to update order status");
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success("Dashboard refreshed");
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-serif text-xl font-medium">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/kitchen"
              className="flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground text-xs font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <ChefHat className="w-3.5 h-3.5" />
              Kitchen
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 border border-border text-xs font-sans font-semibold uppercase tracking-wider rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-[0.97] transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
            <button className="relative w-9 h-9 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-xs font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={async () => await signOut()}
              className="flex items-center gap-2 px-3 py-2 border border-border text-xs font-sans font-semibold uppercase tracking-wider rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-[0.97] transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 animate-fade-up opacity-0">

        {/* Time range filter + Device health */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-sm p-0.5">
              {([
                { key: "daily", label: "Daily" },
                { key: "weekly", label: "This Week" },
                { key: "monthly", label: "This Month" },
                { key: "yearly", label: "This Year" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setAnalyticsRange(opt.key);
                    setCustomRange(null);
                  }}
                  className={`px-4 py-2 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                    !customRange && analyticsRange === opt.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm border transition-all ${
                    customRange
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {customRange
                    ? customRange.from.getTime() === customRange.to.getTime()
                      ? customRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : `${customRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : "Pick Date Range"}
                  {customRange && (
                    <X
                      className="w-3.5 h-3.5 opacity-80 hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCustomRange(null);
                      }}
                    />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                {firstPosKioskDate && (
                  <div className="px-3 pt-3 pb-2 text-[11px] text-muted-foreground border-b border-border">
                    Orders available from{" "}
                    <span className="font-semibold text-foreground">
                      {firstPosKioskDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                <Calendar
                  mode="range"
                  defaultMonth={customRange?.from ?? firstPosKioskDate ?? now}
                  showOutsideDays={false}
                  selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                  onSelect={(r) => {
                    if (r?.from) {
                      const to = r.to ?? r.from;
                      setCustomRange({ from: r.from, to });
                      if (r.to) setDatePickerOpen(false);
                    }
                  }}
                  disabled={(d) =>
                    d > new Date() || (firstPosKioskDate ? d < firstPosKioskDate : false)
                  }
                  classNames={{
                    day: "inline-flex items-center justify-center h-9 w-9 p-0 text-sm font-normal text-foreground rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:opacity-100",
                    day_disabled: "text-muted-foreground/40 opacity-50",
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Device health */}
          <div className="flex items-center gap-3">
            {terminals.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5">
                {t.online ? (
                  <Wifi className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
                <span className={`text-xs font-sans font-semibold ${t.online ? "text-green-600" : "text-muted-foreground/60"}`}>
                  {t.label}
                </span>
              </div>
            ))}
            <button
              onClick={checkDeviceHealth}
              disabled={checkingHealth}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold border border-border rounded-sm hover:bg-muted active:scale-95 transition-all disabled:opacity-50"
            >
              <Monitor className={`w-3.5 h-3.5 ${checkingHealth ? "animate-spin" : ""}`} />
              {checkingHealth ? "Checking..." : "Check Health"}
            </button>
          </div>
        </div>

        <StatsCards orders={activeOrders} />

        {/* Source breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {([
            { source: "pos", label: "POS", color: "blue" },
            { source: "kiosk", label: "Kiosk", color: "purple" },
            { source: "web", label: "Website", color: "amber" },
          ] as const).map(({ source, label, color }) => {
            const srcOrders = activeOrders.filter((o) => o.source === source);
            const srcRevenue = srcOrders.reduce((s, o) => s + o.total, 0);
            return (
              <div key={source} className={`bg-${color}-50 border border-${color}-200 rounded-sm p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-sans font-bold uppercase tracking-wider text-${color}-600`}>{label}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${color}-100 text-${color}-700`}>{srcOrders.length} orders</span>
                </div>
                <p className={`text-2xl font-sans font-bold text-${color}-700`}>${srcRevenue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: ${srcOrders.length > 0 ? (srcRevenue / srcOrders.length).toFixed(2) : "0.00"}
                </p>
              </div>
            );
          })}
        </div>

        {/* Payment method breakdown */}
        <div className="bg-card border border-border rounded-sm p-6">
          <h3 className="font-serif text-lg font-medium mb-4">Payment Method</h3>
          <div className="grid grid-cols-2 gap-4">
            {(() => {
              const byPayment = { card: 0, cash: 0 };
              const revenueByPayment = { card: 0, cash: 0 };
              activeOrders.forEach((o) => {
                const pay = (o.payment || "card") as "card" | "cash";
                byPayment[pay] += 1;
                revenueByPayment[pay] += o.total;
              });
              return (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-sm p-4 text-center">
                    <p className="text-3xl font-sans font-bold text-blue-700">{byPayment.card}</p>
                    <p className="text-xs text-blue-600 uppercase tracking-wider mt-1">Card</p>
                    <p className="text-base font-sans font-bold text-blue-700 mt-2">
                      ${revenueByPayment.card.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-4 text-center">
                    <p className="text-3xl font-sans font-bold text-emerald-700">{byPayment.cash}</p>
                    <p className="text-xs text-emerald-600 uppercase tracking-wider mt-1">Cash</p>
                    <p className="text-base font-sans font-bold text-emerald-700 mt-2">
                      ${revenueByPayment.cash.toFixed(2)}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <RevenueChart
              orders={activeOrders}
              range={analyticsRange}
              customRange={customRange ?? undefined}
            />
          </div>
          <div className="lg:col-span-2">
            <OrderStatusChart orders={filteredOrders} />
          </div>
        </div>

        <ItemSalesChart orders={activeOrders} />

        <OrdersTable orders={filteredOrders} onStatusChange={handleStatusChange} />
      </main>
    </div>
  );
};

export default AdminDashboard;
