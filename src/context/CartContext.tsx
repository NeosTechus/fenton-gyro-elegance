import { createContext, useContext, useState, ReactNode } from "react";
import { menuItems, MenuItem } from "@/data/menu";

interface CartContextType {
  cart: Record<string, number>;
  addItem: (id: string) => void;
  removeItem: (id: string) => void;
  /** Remove this menu item from the cart entirely (all qty). */
  removeLine: (id: string) => void;
  updateQty: (id: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  getItemQty: (id: string) => number;
  cartItems: { item: MenuItem; qty: number }[];
}

const CartContext = createContext<CartContextType | null>(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Record<string, number>>({});

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const next = (prev[id] || 0) + delta;
      if (next <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const addItem = (id: string) => updateQty(id, 1);
  const removeItem = (id: string) => updateQty(id, -1);
  const removeLine = (id: string) => {
    setCart((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };
  const clearCart = () => setCart({});
  const getItemQty = (id: string) => cart[id] || 0;

  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find((m) => m.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const cartItems = Object.entries(cart).map(([id, qty]) => ({
    item: menuItems.find((m) => m.id === id)!,
    qty,
  }));

  return (
    <CartContext.Provider
      value={{ cart, addItem, removeItem, removeLine, updateQty, clearCart, totalItems, totalPrice, getItemQty, cartItems }}
    >
      {children}
    </CartContext.Provider>
  );
};
