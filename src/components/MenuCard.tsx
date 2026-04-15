import { useState } from "react";
import { Minus, Plus, ChevronDown, Check } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { MenuItem } from "@/data/menu";
import { getModifiersTotal } from "@/components/ModifierSelector";

const MenuCard = ({ item }: { item: MenuItem }) => {
  const { getItemQty, addItem, removeItem } = useCart();
  const qty = getItemQty(item.id);
  const [expanded, setExpanded] = useState(false);
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});

  const hasModifiers = item.modifiers && item.modifiers.length > 0;
  const modsTotal = hasModifiers && item.modifiers ? getModifiersTotal(item.modifiers, selectedMods) : 0;

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setSelectedMods((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (maxSelect === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  return (
    <div className="bg-card rounded-sm overflow-hidden shadow-sm shadow-foreground/3 hover-lift group flex flex-col">
      <div className="relative overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          loading="lazy"
        />
        <span className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm text-foreground font-sans font-semibold text-sm px-3 py-1 rounded-sm">
          ${(item.price + modsTotal).toFixed(2)}
        </span>
        {item.tag && (
          <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] uppercase tracking-wider font-sans font-semibold px-2.5 py-1 rounded-sm">
            {item.tag}
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-serif text-lg font-medium mb-1 group-hover:text-accent transition-colors duration-200">{item.name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3 flex-1">
          {item.desc}
        </p>

        {/* Inline modifier selection */}
        {hasModifiers && item.modifiers && (
          <div className="mb-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-sans font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              Customize
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>

            {expanded && (
              <div className="mt-2 space-y-3 pt-2 border-t border-border/50">
                {item.modifiers.map((group) => (
                  <div key={group.id}>
                    <p className="text-[10px] uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-1.5">
                      {group.label}
                      {group.required && <span className="text-accent ml-1">*</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.options.map((option) => {
                        const isSelected = (selectedMods[group.id] || []).includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleOption(group.id, option.id, group.maxSelect)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-sans font-medium transition-all active:scale-95 ${
                              isSelected
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {option.name}
                            {option.price > 0 && (
                              <span className="opacity-70">+${option.price.toFixed(2)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {qty > 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => removeItem(item.id)}
              className="w-9 h-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 active:scale-90 transition-all duration-200"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center font-sans font-semibold text-sm">
              {qty}
            </span>
            <button
              onClick={() => addItem(item.id)}
              className="w-9 h-9 flex items-center justify-center rounded-sm bg-accent text-accent-foreground hover:opacity-90 active:scale-90 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => addItem(item.id)}
            className="w-full py-2.5 text-sm font-sans font-semibold uppercase tracking-wider border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/50 active:scale-[0.97] transition-all duration-200"
          >
            Add to Order{modsTotal > 0 ? ` — $${(item.price + modsTotal).toFixed(2)}` : ""}
          </button>
        )}
      </div>
    </div>
  );
};

export default MenuCard;
