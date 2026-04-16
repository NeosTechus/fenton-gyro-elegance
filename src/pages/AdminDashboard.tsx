import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Bell, LogOut, ChefHat, Settings, Monitor, Wifi, WifiOff } from "lucide-react";
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
  const [analyticsRange, setAnalyticsRange] = useState<"today" | "month" | "3months">("today");
  const [terminals, setTerminals] = useState<ValorEPI[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Real-time Firestore listener
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

  // Filter orders by range
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const rangeStart = analyticsRange === "today" ? todayStart : analyticsRange === "month" ? monthStart : threeMonthsStart;
  const filteredOrders = orders.filter((o) => new Date(o.created_at) >= rangeStart);
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
          <div className="flex bg-muted rounded-sm p-0.5">
            {([
              { key: "today", label: "Today" },
              { key: "month", label: "This Month" },
              { key: "3months", label: "3 Months" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAnalyticsRange(opt.key)}
                className={`px-4 py-2 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                  analyticsRange === opt.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
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

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <RevenueChart orders={activeOrders} />
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
