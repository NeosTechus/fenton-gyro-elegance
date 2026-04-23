export type OrderStatus = "pending" | "received" | "preparing" | "ready" | "completed" | "cancelled";
export type OrderSource = "pos" | "kiosk" | "web";
export type OrderPayment = "card" | "cash";
export type PaymentStatus = "paid" | "unpaid";

export interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  items: { name: string; quantity: number; price: number; modifiers?: string[] }[];
  total: number;
  status: OrderStatus;
  prep_time: number; // minutes
  order_type: "pickup" | "delivery" | "dine-in" | "take-out";
  notes: string;
  created_at: string;
  source?: OrderSource;
  payment?: OrderPayment;
  payment_status?: PaymentStatus;
}

// Mock data for demo — replace with Supabase queries
export const mockOrders: Order[] = [
  {
    id: "a1b2c3d4",
    customer_name: "Michael Rodriguez",
    customer_email: "michael.r@gmail.com",
    customer_phone: "(636) 555-0101",
    items: [
      { name: "Classic Gyro", quantity: 2, price: 9.99 },
      { name: "Hummus & Pita", quantity: 1, price: 6.99 },
    ],
    total: 26.97,
    status: "received",
    prep_time: 15,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "e5f6g7h8",
    customer_name: "Sarah Thompson",
    customer_email: "sarah.t@gmail.com",
    customer_phone: "(636) 555-0202",
    items: [{ name: "Chicken Gyro", quantity: 1, price: 9.99 }],
    total: 9.99,
    status: "cancelled",
    prep_time: 15,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "i9j0k1l2",
    customer_name: "David Kim",
    customer_email: "david.k@gmail.com",
    customer_phone: "(636) 555-0303",
    items: [
      { name: "Gyro Bowl", quantity: 1, price: 12.99 },
      { name: "Lentil Soup", quantity: 1, price: 5.49 },
    ],
    total: 18.48,
    status: "ready",
    prep_time: 15,
    order_type: "pickup",
    notes: "Extra tzatziki please",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "m3n4o5p6",
    customer_name: "Emily Chen",
    customer_email: "emily.c@gmail.com",
    customer_phone: "(636) 555-0404",
    items: [
      { name: "Falafel Wrap", quantity: 2, price: 8.99 },
      { name: "Chocolate Baklava", quantity: 2, price: 4.99 },
    ],
    total: 27.96,
    status: "preparing",
    prep_time: 20,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "q7r8s9t0",
    customer_name: "James Wilson",
    customer_email: "james.w@gmail.com",
    customer_phone: "(636) 555-0505",
    items: [{ name: "Gyro Salad", quantity: 1, price: 11.99 }],
    total: 11.99,
    status: "completed",
    prep_time: 15,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "u1v2w3x4",
    customer_name: "Lisa Park",
    customer_email: "lisa.p@gmail.com",
    customer_phone: "(636) 555-0606",
    items: [
      { name: "Classic Gyro", quantity: 1, price: 9.99 },
      { name: "Seasoned Fries", quantity: 1, price: 4.49 },
    ],
    total: 14.48,
    status: "pending",
    prep_time: 15,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "y5z6a7b8",
    customer_name: "Robert Davis",
    customer_email: "robert.d@gmail.com",
    customer_phone: "(636) 555-0707",
    items: [
      { name: "Chicken Shawarma Bowl", quantity: 1, price: 12.99 },
      { name: "Rice Pudding", quantity: 1, price: 4.49 },
    ],
    total: 17.48,
    status: "ready",
    prep_time: 15,
    order_type: "pickup",
    notes: "No onions",
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "c9d0e1f2",
    customer_name: "Amanda Foster",
    customer_email: "amanda.f@gmail.com",
    customer_phone: "(636) 555-0808",
    items: [
      { name: "Classic Gyro", quantity: 3, price: 9.99 },
      { name: "Hummus & Pita", quantity: 2, price: 6.99 },
    ],
    total: 43.95,
    status: "received",
    prep_time: 20,
    order_type: "pickup",
    notes: "Large group order",
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "g3h4i5j6",
    customer_name: "Chris Martinez",
    customer_email: "chris.m@gmail.com",
    customer_phone: "(636) 555-0909",
    items: [{ name: "Lentil Soup", quantity: 2, price: 5.49 }],
    total: 10.98,
    status: "completed",
    prep_time: 10,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "k7l8m9n0",
    customer_name: "Jennifer Lee",
    customer_email: "jennifer.l@gmail.com",
    customer_phone: "(636) 555-1010",
    items: [
      { name: "Falafel Wrap", quantity: 1, price: 8.99 },
      { name: "Chocolate Baklava", quantity: 1, price: 4.99 },
    ],
    total: 13.98,
    status: "cancelled",
    prep_time: 15,
    order_type: "pickup",
    notes: "",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];
