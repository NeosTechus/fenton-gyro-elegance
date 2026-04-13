import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Phone,
  Mail,
  Clock,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { Order, OrderStatus } from "@/data/orders";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const STATUS_BADGE: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-800" },
  received: { bg: "bg-blue-100", text: "text-blue-700" },
  preparing: { bg: "bg-orange-100", text: "text-orange-700" },
  ready: { bg: "bg-emerald-100", text: "text-emerald-700" },
  completed: { bg: "bg-primary/10", text: "text-primary" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

const OrderLookup = () => {
  const [searchType, setSearchType] = useState<"phone" | "email">("phone");
  const [searchValue, setSearchValue] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim() || !isFirebaseConfigured || !db) return;

    setLoading(true);
    setSearched(true);

    try {
      const field = searchType === "phone" ? "customer_phone" : "customer_email";
      const q = query(
        collection(db, "orders"),
        where(field, "==", searchValue.trim()),
        orderBy("created_at", "desc")
      );

      const snapshot = await getDocs(q);
      const results: Order[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        let createdAt: string;
        if (data.created_at instanceof Timestamp) {
          createdAt = data.created_at.toDate().toISOString();
        } else {
          createdAt = data.created_at || new Date().toISOString();
        }
        return {
          id: doc.id,
          customer_name: data.customer_name || "",
          customer_email: data.customer_email || "",
          customer_phone: data.customer_phone || "",
          items: data.items || [],
          total: data.total || 0,
          status: data.status || "pending",
          prep_time: data.prep_time || 15,
          order_type: data.order_type || "pickup",
          notes: data.notes || "",
          created_at: createdAt,
          source: data.source,
          payment: data.payment,
        };
      });

      setOrders(results);
    } catch (err) {
      console.error("Order lookup error:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen bg-background section-padding">
        <div className="max-w-2xl mx-auto py-12">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-3">
              My Orders
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-medium mb-2">
              Look Up Your Orders
            </h1>
            <p className="text-muted-foreground text-sm">
              Enter the phone number or email you used when placing your order.
            </p>
          </div>

          {/* Search */}
          <div className="bg-card border border-border rounded-sm p-6 mb-8">
            {/* Toggle */}
            <div className="flex bg-muted rounded-sm p-1 mb-4">
              <button
                onClick={() => setSearchType("phone")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                  searchType === "phone"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                Phone
              </button>
              <button
                onClick={() => setSearchType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all ${
                  searchType === "email"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type={searchType === "phone" ? "tel" : "email"}
                  placeholder={searchType === "phone" ? "Enter phone number" : "Enter email address"}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </form>
          </div>

          {/* Results */}
          {searched && !loading && (
            <div>
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground font-sans">No orders found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Check the {searchType} and try again
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wider font-sans font-semibold text-muted-foreground">
                    {orders.length} order{orders.length !== 1 ? "s" : ""} found
                  </p>
                  {orders.map((order) => {
                    const badge = STATUS_BADGE[order.status];
                    return (
                      <Link
                        key={order.id}
                        to={`/track/${order.id}`}
                        className="block bg-card border border-border rounded-sm p-4 hover:shadow-md hover:border-accent/30 transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-sm font-bold text-accent">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-sans font-semibold ${badge.bg} ${badge.text}`}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(order.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
                          <span className="text-xs text-muted-foreground capitalize">{order.order_type}</span>
                          <span className="font-sans font-bold text-sm text-accent">${order.total.toFixed(2)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default OrderLookup;
