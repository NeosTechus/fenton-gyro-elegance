import { useState } from "react";
import { X, Minus, Plus, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { createValorCheckout } from "@/lib/valor-ecomm";
import { createOrder } from "@/lib/orders";



const CartDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { cartItems, totalItems, totalPrice, addItem, removeItem, clearCart } = useCart();
  const orderType = "pickup";
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalItems === 0) {
      toast.error("Please add items to your order");
      return;
    }
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error("Please fill in your name and phone number");
      return;
    }

    setIsProcessing(true);
    try {
      const items = cartItems.map(({ item, qty }) => ({
        name: item.name,
        price: item.price,
        quantity: qty,
      }));
      await createOrder({
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        items: items.map(({ name, price, quantity }) => ({ name, price, quantity })),
        total: totalPrice,
        order_type: orderType,
        notes: formData.notes,
        source: "web",
        payment: "card",
      });

      const checkoutUrl = await createValorCheckout({
        amount: totalPrice.toFixed(2),
        phone: formData.phone,
        email: formData.email,
        customerName: formData.name,
        invoiceNumber: `CART-${Date.now()}`,
        productDescription: items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
      });
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-foreground/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-border z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-accent" />
            <h2 className="font-serif text-xl font-medium">Your Order</h2>
            {totalItems > 0 && (
              <span className="text-xs font-sans font-semibold bg-accent text-accent-foreground px-2 py-0.5 rounded-sm">
                {totalItems}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-sm hover:bg-muted active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {totalItems === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Your cart is empty.</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Add items from the menu to get started.</p>
            </div>
          ) : (
            <>
              {/* Order type label */}
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-sans font-semibold mb-6">Pickup Order</p>

              {/* Cart items */}
              <div className="space-y-3 mb-6">
                {cartItems.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-14 h-14 rounded-sm object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <p className="text-sm text-accent font-semibold">${(item.price * qty).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{qty}</span>
                      <button
                        onClick={() => addItem(item.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 mb-6 flex justify-between font-sans font-semibold">
                <span>Total</span>
                <span className="text-accent">${totalPrice.toFixed(2)}</span>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Your name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="tel"
                  placeholder="Phone number *"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <textarea
                  placeholder="Special instructions (optional)"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow resize-none"
                />
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>Checkout — ${totalPrice.toFixed(2)}</>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CartDrawer;
