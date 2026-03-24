import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Order, OrderStatus, OrderSource, mockOrders } from "@/data/orders";

interface OrderContextType {
  orders: Order[];
  addOrder: (order: Omit<Order, "id" | "created_at" | "status" | "prep_time">) => void;
  updateStatus: (id: string, status: OrderStatus) => void;
  acceptAllPending: () => void;
}

const OrderContext = createContext<OrderContextType | null>(null);

export const useOrders = () => {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
};

let counter = 1000;
const genId = () => {
  counter++;
  return counter.toString(16).padStart(8, "0");
};

export const OrderProvider = ({ children }: { children: ReactNode }) => {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const addOrder = useCallback(
    (order: Omit<Order, "id" | "created_at" | "status" | "prep_time">) => {
      const newOrder: Order = {
        ...order,
        id: genId(),
        created_at: new Date().toISOString(),
        prep_time: 15,
        // POS & Kiosk orders are auto-accepted; website orders start as pending
        status: order.source === "website" ? "pending" : "received",
      };
      setOrders((prev) => [newOrder, ...prev]);
    },
    []
  );

  const updateStatus = useCallback((id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  }, []);

  const acceptAllPending = useCallback(() => {
    setOrders((prev) =>
      prev.map((o) => (o.status === "pending" ? { ...o, status: "received" } : o))
    );
  }, []);

  return (
    <OrderContext.Provider value={{ orders, addOrder, updateStatus, acceptAllPending }}>
      {children}
    </OrderContext.Provider>
  );
};
