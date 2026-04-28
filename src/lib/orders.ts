/**
 * Firestore order service — creates, updates, and listens to orders in real-time.
 *
 * Used by: POS, Kiosk, Online Order, Kitchen Display, Admin Dashboard
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { Order, OrderStatus, PaymentStatus, mockOrders } from "@/data/orders";

// ── Types ────────────────────────────────────────────────────────────────

export type OrderSource = "pos" | "kiosk" | "web";
export type OrderPayment = "card" | "cash";

export interface CreateOrderInput {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  items: { name: string; quantity: number; price: number; modifiers?: string[] }[];
  total: number;
  order_type: "pickup" | "delivery" | "dine-in" | "take-out";
  notes: string;
  source: OrderSource;
  payment: OrderPayment;
  payment_status?: PaymentStatus;
  terminal_epi?: string;
  auth_code?: string;
  masked_pan?: string;
  rrn?: string;
}

// ── Create Order ─────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    console.warn("Firebase not configured — order not saved");
    return `local-${Date.now()}`;
  }

  // POS/Kiosk orders are auto-accepted; web orders need chef approval
  const autoAccept = input.source === "pos" || input.source === "kiosk";

  // Strip undefined values — Firestore rejects them
  const cleanInput = Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== undefined)
  );

  // Unpaid kiosk cash orders wait at POS for payment collection
  const isUnpaidCash = input.payment_status === "unpaid";

  const docRef = await addDoc(collection(db, "orders"), {
    ...cleanInput,
    status: isUnpaidCash ? "pending" : (autoAccept ? "received" : "pending") as OrderStatus,
    payment_status: input.payment_status || "paid",
    prep_time: 15,
    created_at: serverTimestamp(),
  });

  return docRef.id;
}

// ── Update Order Status ──────────────────────────────────────────────────

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await updateDoc(doc(db, "orders", orderId), { status });
}

// ── Update Prep Time ─────────────────────────────────────────────────────

export async function markOrderPaid(orderId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await updateDoc(doc(db, "orders", orderId), {
    payment_status: "paid",
    status: "received",
  });
}

export async function updatePrepTime(
  orderId: string,
  prepTime: number
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await updateDoc(doc(db, "orders", orderId), { prep_time: prepTime });
}

/**
 * Save Valor transaction references to an order. Called on the track page
 * after an ePage redirect so the order doc has the rrn/auth_code needed to
 * void the payment if the customer cancels.
 */
export async function saveOrderValorRefs(
  orderId: string,
  refs: { rrn?: string; auth_code?: string; masked_pan?: string },
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const clean = Object.fromEntries(
    Object.entries(refs).filter(([, v]) => typeof v === "string" && v.length > 0),
  );
  if (Object.keys(clean).length === 0) return;
  await updateDoc(doc(db, "orders", orderId), clean);
}

// ── Real-time Listener — Today's Orders ──────────────────────────────────

function firestoreToOrder(id: string, data: any): Order {
  let createdAt: string;
  if (data.created_at instanceof Timestamp) {
    createdAt = data.created_at.toDate().toISOString();
  } else if (data.created_at) {
    createdAt = data.created_at;
  } else {
    createdAt = new Date().toISOString();
  }

  return {
    id,
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
    source: data.source || undefined,
    payment: data.payment || undefined,
    payment_status: data.payment_status || "paid",
  };
}

/**
 * Subscribe to today's orders in real-time.
 * Returns an unsubscribe function.
 */
export function subscribeToOrders(
  callback: (orders: Order[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) {
    callback(mockOrders);
    return () => {};
  }

  const q = query(
    collection(db, "orders"),
    orderBy("created_at", "desc"),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const orders = snapshot.docs.map((doc) =>
        firestoreToOrder(doc.id, doc.data())
      );
      callback(orders);
    },
    (error) => {
      console.error("Order subscription error:", error);
      callback(mockOrders);
    }
  );
}
