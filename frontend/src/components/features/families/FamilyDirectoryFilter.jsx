import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../../ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { NO_PUROK_FILTER } from "../../../services/familyRegistry";

const DEFAULTS = { purok: "", barangay: "" };
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const SELECT = "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white py-0 pl-3 pr-8 text-[13px] text-ink-800 shadow-xs outline-none transition-colors hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";

function FilterSelect({ id, label, value, onChange, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-wide text-neutral-600">{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={SELECT}>{children}</select>
        <ChevronDown size={14} strokeWidth={2.1} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
      </div>
    </div>
  );
}

// Filters are a draft until Apply, like the inventory filter. `options` come from the server so they cover every page.
export default function FamilyDirectoryFilter({ applied, options, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const activeCount = Number(Boolean(applied.purok)) + Number(Boolean(applied.barangay));
  const showPurok = options.puroks.length > 0 || options.hasWithoutPurok;
  // A BHC has one barangay, so the choice only exists where a facility holds several (the RHU).
  const showBarangay = options.barangays.length > 1;
  const draftIsDefault = !draft.purok && !draft.barangay;

  function handleOpenChange(next) {
    if (next) setDraft(applied);
    setOpen(next);
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="filter" aria-pressed={activeCount > 0} className="gap-2 py-0 pl-1.5 pr-3">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${activeCount > 0 ? "bg-white text-brand-700" : "bg-neutral-100 text-neutral-600"}`}>
            <SlidersHorizontal size={13} strokeWidth={2.1} aria-hidden="true" />
          </span>
          Filter
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{activeCount}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={12} aria-label="Filters" className="w-[min(calc(100vw-1.5rem),370px)] max-w-[370px] overflow-hidden rounded-card p-0">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">Filters</p>
          <PopoverClose asChild>
            <button type="button" aria-label="Close filters" className={`flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-ink-800 ${FOCUS_RING}`}>
              <X size={14} aria-hidden="true" />
            </button>
          </PopoverClose>
        </div>
        <div className="grid grid-cols-1 gap-2.5 px-3 py-3">
          {showPurok && (
            <FilterSelect id="family-purok-filter" label="Purok / Area" value={draft.purok} onChange={(purok) => setDraft((previous) => ({ ...previous, purok }))}>
              <option value="">All puroks</option>
              {options.puroks.map((purok) => <option key={purok} value={purok}>{purok}</option>)}
              {options.hasWithoutPurok && <option value={NO_PUROK_FILTER}>No purok recorded</option>}
            </FilterSelect>
          )}
          {showBarangay && (
            <FilterSelect id="family-barangay-filter" label="Barangay" value={draft.barangay} onChange={(barangay) => setDraft((previous) => ({ ...previous, barangay }))}>
              <option value="">All barangays</option>
              {options.barangays.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
            </FilterSelect>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
          <Button type="button" variant="secondary" size="compact" onClick={() => setDraft(DEFAULTS)} disabled={draftIsDefault}>Reset</Button>
          <Button type="button" variant="brand" size="compact" onClick={apply}>Apply Filters</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
