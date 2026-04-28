import { ModifierGroup, MenuItem } from "@/data/menu";

const NONE = "__none__";

interface ModifierSelectorProps {
  groups: ModifierGroup[];
  selected: Record<string, string[]>; // groupId -> optionId[]
  onChange: (selected: Record<string, string[]>) => void;
  /** POS: dense tile grid + tap to toggle; designed to avoid scrolling on register-sized screens. */
  layout?: "default" | "pos";
}

/** Pre-select required single-choice groups (e.g. fries vs tots). */
export const getDefaultSelectedMods = (item: MenuItem | null): Record<string, string[]> => {
  if (!item?.modifiers) return {};
  const out: Record<string, string[]> = {};
  for (const g of item.modifiers) {
    if (g.maxSelect === 1 && g.required && g.options.length > 0) {
      out[g.id] = [g.options[0].id];
    }
  }
  return out;
};

const ModifierSelector = ({ groups, selected, onChange, layout = "default" }: ModifierSelectorProps) => {
  const isPos = layout === "pos";

  const renderGroup = (group: (typeof groups)[0]) => {
    const groupSelected = selected[group.id] || [];

    if (group.maxSelect === 1) {
      const raw = groupSelected[0];
      const value: string =
        raw ?? (group.required && group.options.length > 0 ? group.options[0].id : NONE);

      return (
        <div key={group.id} className={isPos ? "min-w-0" : undefined}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className={`font-sans font-semibold text-foreground leading-tight ${isPos ? "text-base" : "text-xs"}`}>
              {group.label}
            </label>
            <span
              className={`uppercase tracking-wider font-sans font-semibold text-muted-foreground shrink-0 ${isPos ? "text-xs" : "text-[9px]"}`}
            >
              {group.required ? "Req" : "Opt"}
            </span>
          </div>
          <select
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...selected, [group.id]: v === NONE ? [] : [v] });
            }}
            className={`w-full rounded-md border border-border bg-background font-sans text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 ${
              isPos ? "px-3 py-2.5 text-sm min-h-[52px]" : "px-2 py-1.5 text-xs focus:ring-1"
            }`}
          >
            {!group.required && <option value={NONE}>— None —</option>}
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.price > 0 ? ` (+$${option.price.toFixed(2)})` : ""}
              </option>
            ))}
          </select>
        </div>
      );
    }

    const isRemoveGroup = group.id === "remove";
    const offLabel = isRemoveGroup ? "Keep" : "No";
    const onLabel = isRemoveGroup ? "Remove" : "Yes";

    const multiListClass = isPos
      ? "grid grid-cols-2 min-[480px]:grid-cols-3 min-[720px]:grid-cols-4 min-[1100px]:grid-cols-5 min-[1500px]:grid-cols-6 gap-2"
      : "space-y-0.5 rounded-sm border border-border bg-muted/30 p-1.5 max-h-[9.5rem] overflow-y-auto overscroll-contain [overflow-anchor:none]";

    return (
      <div key={group.id} className={isPos ? "min-w-0 flex flex-col" : undefined}>
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <h4 className={`font-sans font-semibold text-foreground leading-tight truncate ${isPos ? "text-base" : "text-xs"}`}>
            {group.label}
          </h4>
          <span
            className={`uppercase tracking-wider font-sans font-semibold text-muted-foreground shrink-0 text-right ${isPos ? "text-xs" : "text-[9px]"}`}
          >
            {group.required ? "Req" : "Opt"} · max {group.maxSelect}
          </span>
        </div>
        <div className={multiListClass}>
          {group.options.map((option) => {
            const isOn = groupSelected.includes(option.id);
            const setRow = (wantOn: boolean) => {
              const cur = selected[group.id] || [];
              if (wantOn) {
                if (cur.includes(option.id)) return;
                if (cur.length >= group.maxSelect) return;
                onChange({ ...selected, [group.id]: [...cur, option.id] });
              } else {
                onChange({
                  ...selected,
                  [group.id]: cur.filter((id) => id !== option.id),
                });
              }
            };

            if (isPos) {
              const activeClass = isOn
                ? isRemoveGroup
                  ? "border-destructive/70 bg-destructive/20 text-foreground shadow-sm ring-1 ring-destructive/25"
                  : "border-accent bg-accent/20 text-foreground shadow-sm ring-1 ring-accent/35"
                : "border-border bg-background/90 text-muted-foreground hover:bg-muted/50 hover:text-foreground";

              return (
                <button
                  key={option.id}
                  type="button"
                  title={isOn ? (isRemoveGroup ? "Tap to keep ingredient" : "Tap to clear") : isRemoveGroup ? "Tap to remove" : "Tap to add"}
                  onClick={() => (isOn ? setRow(false) : setRow(true))}
                  className={`rounded-md border px-3 py-2.5 min-h-[64px] flex flex-col items-stretch justify-center text-left transition-colors active:scale-[0.98] ${activeClass}`}
                >
                  <span className="text-sm font-semibold leading-tight line-clamp-2 text-foreground">{option.name}</span>
                  {option.price > 0 ? (
                    <span className="text-xs text-muted-foreground tabular-nums mt-1">+${option.price.toFixed(2)}</span>
                  ) : null}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/90 mt-1">
                    {isOn ? (isRemoveGroup ? "Remove" : "On") : isRemoveGroup ? "Keep" : "Off"}
                  </span>
                </button>
              );
            }

            return (
              <div key={option.id} className="flex items-center gap-2 min-h-0">
                <span className="text-[11px] text-foreground leading-snug flex-1 min-w-0 truncate" title={option.name}>
                  {option.name}
                  {option.price > 0 && <span className="text-muted-foreground"> +${option.price.toFixed(2)}</span>}
                </span>
                <select
                  value={isOn ? "on" : "off"}
                  onChange={(e) => {
                    const wantOn = e.target.value === "on";
                    setRow(wantOn);
                  }}
                  className="shrink-0 w-[4.75rem] rounded-sm border border-border bg-background px-0.5 py-0.5 text-[11px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="off">{offLabel}</option>
                  <option value="on">{onLabel}</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isPos) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none]">
        <div className="grid min-h-0 grid-cols-1 min-[560px]:grid-cols-2 gap-x-4 gap-y-3 content-start auto-rows-min">
          {groups.map((g) => renderGroup(g))}
        </div>
      </div>
    );
  }

  return <div className="space-y-2.5">{groups.map((g) => renderGroup(g))}</div>;
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

/** Ticket / kitchen lines — spells out fries vs tots and combo upgrades. */
export const getKitchenModifierLines = (
  groups: ModifierGroup[],
  selected: Record<string, string[]>
): string[] => {
  const lines: string[] = [];
  for (const group of groups) {
    const ids = selected[group.id] || [];
    if (ids.length === 0) continue;

    if (group.id === "fries-tots") {
      const picked = group.options.find((o) => ids.includes(o.id));
      if (picked) lines.push(`Side: ${picked.name}`);
      continue;
    }

    if (group.id === "combo" || group.id === "meal") {
      for (const opt of group.options) {
        if (ids.includes(opt.id)) lines.push(`Combo: ${opt.name}`);
      }
      continue;
    }

    for (const opt of group.options) {
      if (ids.includes(opt.id)) lines.push(opt.name);
    }
  }
  return lines;
};
