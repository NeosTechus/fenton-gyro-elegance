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
  where,
  limit,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { Order, OrderStatus, mockOrders } from "@/data/orders";

// ── Types ────────────────────────────────────────────────────────────────

export type OrderSource = "pos" | "kiosk" | "web";
export type OrderPayment = "card" | "cash";

export interface CreateOrderInput {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  order_type: "pickup" | "delivery" | "dine-in" | "take-out";
  notes: string;
  source: OrderSource;
  payment: OrderPayment;
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

  const docRef = await addDoc(collection(db, "orders"), {
    ...input,
    status: "received" as OrderStatus,
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

export async function updatePrepTime(
  orderId: string,
  prepTime: number
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await updateDoc(doc(db, "orders", orderId), { prep_time: prepTime });
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

  // Get start of today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, "orders"),
    where("created_at", ">=", Timestamp.fromDate(todayStart)),
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
