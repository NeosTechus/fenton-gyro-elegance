import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MenuCard from "@/components/MenuCard";
import CartDrawer from "@/components/CartDrawer";
import { menuItems, categories } from "@/data/menu";
import { useCart } from "@/context/CartContext";
import { ShoppingBag } from "lucide-react";

const MenuPage = () => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [cartOpen, setCartOpen] = useState(false);
  const { totalItems, totalPrice } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const filteredItems =
    activeCategory === "All"
      ? menuItems
      : menuItems.filter((i) => i.category === activeCategory);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-16 md:py-24 section-padding">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12 animate-fade-up">
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
                Our Menu
              </p>
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-balance leading-[1.05]">
                Order Your Favorites
              </h1>
              <p className="text-muted-foreground mt-4 max-w-md mx-auto">
                Choose your items and we'll have them ready for pickup or delivery.
              </p>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap justify-center gap-2 mb-12 animate-fade-up" style={{ animationDelay: "100ms" }}>
              {["All", ...categories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2 text-sm font-sans font-semibold rounded-sm border transition-all duration-200 active:scale-[0.97] ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item, i) => (
                <div
                  key={item.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${150 + i * 60}ms` }}
                >
                  <MenuCard item={item} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Floating cart button */}
      {totalItems > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-3 bg-accent text-accent-foreground pl-5 pr-6 py-3.5 rounded-sm shadow-lg shadow-accent/20 hover:opacity-90 active:scale-[0.97] transition-all duration-200 font-sans font-semibold text-sm animate-fade-up"
        >
          <ShoppingBag className="w-5 h-5" />
          {totalItems} {totalItems === 1 ? "item" : "items"} — ${totalPrice.toFixed(2)}
        </button>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <Footer />
    </>
  );
};

export default MenuPage;
