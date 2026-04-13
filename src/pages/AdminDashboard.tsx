import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Bell, LogOut, ChefHat, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Order, OrderStatus } from "@/data/orders";
import { subscribeToOrders, updateOrderStatus } from "@/lib/orders";
import StatsCards from "@/components/admin/StatsCards";
import RevenueChart from "@/components/admin/RevenueChart";
import OrderStatusChart from "@/components/admin/OrderStatusChart";
import OrdersByHourChart from "@/components/admin/OrdersByHourChart";
import CostAnalytics from "@/components/admin/CostAnalytics";
import OrdersTable from "@/components/admin/OrdersTable";
import { toast } from "sonner";

const AdminDashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time Firestore listener
  useEffect(() => {
    const unsubscribe = subscribeToOrders((liveOrders) => {
      setOrders(liveOrders);
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
        <StatsCards orders={orders} />

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <RevenueChart orders={orders} />
          </div>
          <div className="lg:col-span-2">
            <OrderStatusChart orders={orders} />
          </div>
        </div>

        <OrdersByHourChart orders={orders} />

        <CostAnalytics orders={orders} />

        <OrdersTable orders={orders} onStatusChange={handleStatusChange} />
      </main>
    </div>
  );
};

export default AdminDashboard;
