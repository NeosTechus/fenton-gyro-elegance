import { Minus, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { MenuItem } from "@/data/menu";

const MenuCard = ({ item }: { item: MenuItem }) => {
  const { getItemQty, addItem, removeItem } = useCart();
  const qty = getItemQty(item.id);

  return (
    <div className="bg-card rounded-sm overflow-hidden shadow-sm shadow-foreground/3 hover:shadow-md transition-shadow duration-300 group flex flex-col">
      <div className="relative overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <span className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm text-foreground font-sans font-semibold text-sm px-3 py-1 rounded-sm">
          ${item.price.toFixed(2)}
        </span>
        {item.tag && (
          <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] uppercase tracking-wider font-sans font-semibold px-2.5 py-1 rounded-sm">
            {item.tag}
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-serif text-lg font-medium mb-1">{item.name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
          {item.desc}
        </p>

        {qty > 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => removeItem(item.id)}
              className="w-9 h-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-95 transition-all"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center font-sans font-semibold text-sm">
              {qty}
            </span>
            <button
              onClick={() => addItem(item.id)}
              className="w-9 h-9 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => addItem(item.id)}
            className="w-full py-2.5 text-sm font-sans font-semibold uppercase tracking-wider border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-[0.97] transition-all"
          >
            Add to Order
          </button>
        )}
      </div>
    </div>
  );
};

export default MenuCard;
