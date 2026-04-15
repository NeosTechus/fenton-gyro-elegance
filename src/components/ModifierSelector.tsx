import { Check } from "lucide-react";
import { ModifierGroup } from "@/data/menu";

interface ModifierSelectorProps {
  groups: ModifierGroup[];
  selected: Record<string, string[]>; // groupId -> optionId[]
  onChange: (selected: Record<string, string[]>) => void;
}

const ModifierSelector = ({ groups, selected, onChange }: ModifierSelectorProps) => {
  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    const current = selected[groupId] || [];
    const isSelected = current.includes(optionId);

    let next: string[];
    if (maxSelect === 1) {
      // Radio behavior
      next = isSelected ? [] : [optionId];
    } else {
      // Checkbox behavior
      if (isSelected) {
        next = current.filter((id) => id !== optionId);
      } else {
        if (current.length >= maxSelect) return; // limit reached
        next = [...current, optionId];
      }
    }

    onChange({ ...selected, [groupId]: next });
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupSelected = selected[group.id] || [];
        return (
          <div key={group.id}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-sans font-semibold text-sm text-foreground">
                {group.label}
              </h4>
              <span className="text-[10px] uppercase tracking-wider font-sans font-semibold text-muted-foreground">
                {group.required ? "Required" : "Optional"}
                {group.maxSelect > 1 && ` · Up to ${group.maxSelect}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isActive = groupSelected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(group.id, option.id, group.maxSelect)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-sm font-sans font-medium transition-all active:scale-95 ${
                      isActive
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isActive && <Check className="w-3 h-3" />}
                    {option.name}
                    {option.price > 0 && (
                      <span className="opacity-60 text-xs">+${option.price.toFixed(2)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ModifierSelector;

// Helper: calculate total price of selected modifiers
export const getModifiersTotal = (
  groups: ModifierGroup[],
  selected: Record<string, string[]>
): number => {
  let total = 0;
  for (const group of groups) {
    const selectedIds = selected[group.id] || [];
    for (const opt of group.options) {
      if (selectedIds.includes(opt.id)) {
        total += opt.price;
      }
    }
  }
  return total;
};

// Helper: get selected modifier names for display
export const getSelectedModifierNames = (
  groups: ModifierGroup[],
  selected: Record<string, string[]>
): string[] => {
  const names: string[] = [];
  for (const group of groups) {
    const selectedIds = selected[group.id] || [];
    for (const opt of group.options) {
      if (selectedIds.includes(opt.id)) {
        names.push(opt.name);
      }
    }
  }
  return names;
};

// Helper: get selected modifiers with name + price for detailed display
export const getSelectedModifierDetails = (
  groups: ModifierGroup[],
  selected: Record<string, string[]>
): { name: string; price: number }[] => {
  const details: { name: string; price: number }[] = [];
  for (const group of groups) {
    const selectedIds = selected[group.id] || [];
    for (const opt of group.options) {
      if (selectedIds.includes(opt.id)) {
        details.push({ name: opt.name, price: opt.price });
      }
    }
  }
  return details;
};
