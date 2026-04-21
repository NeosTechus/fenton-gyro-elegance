import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { Order, OrderStatus } from "@/data/orders";
import { updateOrderStatus, saveOrderValorRefs } from "@/lib/orders";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  ChefHat,
  Package,
  Loader2,
  Phone,
  XCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const STEPS: { status: OrderStatus; label: string; desc: string; icon: typeof Clock }[] = [
  { status: "pending", label: "Order Placed", desc: "Waiting for restaurant to accept", icon: Clock },
  { status: "received", label: "Accepted", desc: "Restaurant confirmed your order", icon: CheckCircle2 },
  { status: "preparing", label: "Preparing", desc: "Your food is being made", icon: ChefHat },
  { status: "ready", label: "Ready for Pickup", desc: "Come pick up your order!", icon: Package },
  { status: "completed", label: "Completed", desc: "Order complete — enjoy!", icon: CheckCircle2 },
];

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  received: 1,
  preparing: 2,
  ready: 3,
  completed: 4,
};

// Cancellation window in seconds — customers can self-cancel only while the
// order is still "pending" (chef hasn't accepted yet). Kept short so it
// rarely overlaps with chef acceptance.
const CANCEL_WINDOW_SECONDS = 15;

const TrackOrder = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const valorRefsSavedRef = useRef(false);

  // On first load after Valor ePage redirect, Valor may append rrn / auth_code
  // / card_last4 as query params. Persist them to the order doc so we can
  // void the payment if the customer cancels. Runs once per mount.
  useEffect(() => {
    if (!orderId || valorRefsSavedRef.current) return;
    const rrn = searchParams.get("rrn") || undefined;
    const auth_code =
      searchParams.get("auth_code") || searchParams.get("authCode") || undefined;
    const masked_pan =
      searchParams.get("card_last4") || searchParams.get("masked_pan") || undefined;
    if (!rrn && !auth_code && !masked_pan) return;
    valorRefsSavedRef.current = true;
    saveOrderValorRefs(orderId, { rrn, auth_code, masked_pan }).catch((err) =>
      console.error("Failed to save Valor refs:", err),
    );
    // Strip the sensitive params from the URL so they aren't shared/bookmarked
    const next = new URLSearchParams(searchParams);
    ["rrn", "auth_code", "authCode", "card_last4", "masked_pan"].forEach((k) =>
      next.delete(k),
    );
    setSearchParams(next, { replace: true });
  }, [orderId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!orderId || !isFirebaseConfigured || !db) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          let createdAt: string;
          if (data.created_at instanceof Timestamp) {
            createdAt = data.created_at.toDate().toISOString();
          } else {
            createdAt = data.created_at || new Date().toISOString();
          }
          setOrder({
            id: snap.id,
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
            rrn: data.rrn,
            auth_code: data.auth_code,
          } as Order & { rrn?: string; auth_code?: string });
          setNotFound(false);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Track order listener error:", error);
        setNotFound(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId]);

  const currentStep = order ? STATUS_INDEX[order.status] ?? 0 : 0;
  const isCancelled = order?.status === "cancelled";

  // Cancel window — customer can only cancel while status is "pending"
  // (chef hasn't accepted yet) AND within CANCEL_WINDOW_SECONDS.
  const [cancelTimeLeft, setCancelTimeLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const canCancel = order?.status === "pending";

  useEffect(() => {
    if (!order || !canCancel) {
      setCancelTimeLeft(0);
      return;
    }
    const orderTime = new Date(order.created_at).getTime();
    const cancelDeadline = orderTime + CANCEL_WINDOW_SECONDS * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cancelDeadline - Date.now()) / 1000));
      setCancelTimeLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [order, canCancel]);

  const handleCancel = useCallback(async () => {
    if (!order || !orderId || cancelTimeLeft <= 0 || !canCancel) return;
    setCancelling(true);
    try {
      // Try to void the Valor payment first. If we don't have an rrn yet,
      // the server still attempts with invoice_no — some configs support it.
      const orderWithRefs = order as Order & { rrn?: string; auth_code?: string };
      let voided = false;
      try {
        const res = await fetch("/api/valor-void", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            rrn: orderWithRefs.rrn,
            authCode: orderWithRefs.auth_code,
            amount: order.total.toFixed(2),
          }),
        });
        voided = res.ok;
        if (!res.ok) console.warn("Valor void failed:", await res.text().catch(() => ""));
      } catch (err) {
        console.warn("Valor void network error:", err);
      }

      await updateOrderStatus(orderId, "cancelled");
      toast.success(
        voided
          ? "Order cancelled. Your refund is on its way."
          : "Order cancelled. Please call (636) 600-1333 to confirm your refund.",
      );
    } catch {
      toast.error("Failed to cancel order. Please call (636) 600-1333.");
    } finally {
      setCancelling(false);
    }
  }, [order, orderId, cancelTimeLeft, canCancel]);

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

          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
              <p className="text-muted-foreground text-sm">Loading order...</p>
            </div>
          )}

          {notFound && !loading && (
            <div className="text-center py-20">
              <XCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h1 className="font-serif text-2xl font-medium mb-2">Order Not Found</h1>
              <p className="text-muted-foreground text-sm mb-6">
                We couldn't find an order with that ID. Check your order confirmation for the correct link.
              </p>
              <Link
                to="/orders"
                className="text-accent hover:underline text-sm font-sans font-semibold"
              >
                Look up your order by phone number
              </Link>
            </div>
          )}

          {order && !loading && (
            <div className="animate-fade-up">
              {/* Header */}
              <div className="text-center mb-10">
                <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-3">
                  Order Tracking
                </p>
                <h1 className="font-serif text-3xl md:text-4xl font-medium mb-2">
                  #{order.id.slice(0, 8).toUpperCase()}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>

              {/* Current Status Banner */}
              {isCancelled ? (
                <div className="bg-red-50 border-2 border-red-200 rounded-sm p-6 text-center mb-8">
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h2 className="font-serif text-xl font-medium text-red-900 mb-1">Order Rejected</h2>
                  <p className="text-red-700 text-sm">
                    Sorry, the restaurant was unable to accept this order. You have not been charged.
                  </p>
                  <p className="text-red-600 text-xs mt-3">
                    Please call <a href="tel:6366001333" className="underline font-semibold">(636) 600-1333</a> if you have questions.
                  </p>
                </div>
              ) : order.status === "pending" ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-sm p-6 text-center mb-8">
                  <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3 animate-pulse" />
                  <h2 className="font-serif text-xl font-medium text-amber-900 mb-1">Waiting for Restaurant</h2>
                  <p className="text-amber-700 text-sm">
                    Your order has been sent. The restaurant will accept it shortly.
                  </p>
                  <p className="text-amber-600 text-xs mt-2">This page updates automatically — no need to refresh.</p>
                </div>
              ) : order.status === "ready" ? (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-sm p-6 text-center mb-8">
                  <Package className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h2 className="font-serif text-xl font-medium text-emerald-900 mb-1">Your Order is Ready!</h2>
                  <p className="text-emerald-700 text-sm">
                    Come pick up your order at the counter.
                  </p>
                </div>
              ) : null}

              {/* Status Stepper */}
              {!isCancelled && (
                <div className="bg-card border border-border rounded-sm p-6 mb-8">
                  <div className="flex items-center justify-between">
                    {STEPS.map((step, i) => {
                      const isActive = i <= currentStep;
                      const isCurrent = i === currentStep;
                      const Icon = step.icon;
                      return (
                        <div key={step.status} className="flex flex-col items-center flex-1 relative">
                          {/* Connector line */}
                          {i > 0 && (
                            <div
                              className={`absolute top-5 right-1/2 w-full h-0.5 -z-10 ${
                                i <= currentStep ? "bg-accent" : "bg-border"
                              }`}
                            />
                          )}
                          {/* Icon */}
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${
                              isCurrent
                                ? "bg-accent text-accent-foreground ring-4 ring-accent/20"
                                : isActive
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span
                            className={`text-[10px] font-sans font-semibold uppercase tracking-wider text-center ${
                              isActive ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                          {isCurrent && (
                            <span className="text-[8px] text-accent/80 font-sans mt-1 text-center max-w-[80px] leading-tight">
                              {step.desc}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Details */}
              <div className="bg-card border border-border rounded-sm divide-y divide-border">
                <div className="p-5">
                  <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Items
                  </h3>
                  <div className="space-y-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>
                          <span className="text-muted-foreground">{item.quantity}x</span>{" "}
                          {item.name}
                        </span>
                        <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border mt-3 pt-3 flex justify-between font-sans font-bold">
                    <span>Total</span>
                    <span className="text-accent">${order.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name</span>
                      <p className="font-semibold">{order.customer_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Order Type</span>
                      <p className="font-semibold capitalize">{order.order_type}</p>
                    </div>
                    {order.customer_phone && (
                      <div>
                        <span className="text-muted-foreground">Phone</span>
                        <p className="font-semibold">{order.customer_phone}</p>
                      </div>
                    )}
                    {order.prep_time > 0 && (
                      <div>
                        <span className="text-muted-foreground">Est. Prep Time</span>
                        <p className="font-semibold">{order.prep_time} min</p>
                      </div>
                    )}
                  </div>
                  {order.notes && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Notes</span>
                      <p className="text-sm">{order.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact */}
              {/* Cancel button — only while status is "pending" and within the window */}
              {canCancel && cancelTimeLeft > 0 && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-sm p-4 text-center">
                  <p className="text-xs text-red-600 mb-2">
                    Changed your mind? You can cancel within <span className="font-bold">{cancelTimeLeft}s</span>
                  </p>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="px-6 py-2.5 bg-red-600 text-white font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:bg-red-700 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Order & Refund"}
                  </button>
                </div>
              )}

              <div className="mt-6 text-center">
                <a
                  href="tel:6366001333"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Questions? Call (636) 600-1333
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default TrackOrder;
