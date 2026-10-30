import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Button } from '../../ui/button';
import { BHC_EXPIRY_FILTER_OPTIONS, BHC_STOCK_FILTER_OPTIONS } from '../../../utils/medicineInventoryStatus';
import { MEDICINE_CATEGORIES } from '../../../services/medicineService';
const LIST_FILTER_DEFAULTS = { category: 'All Categories', status: 'All Status', expiry: 'All Expiry' };
const CATEGORY_OPTIONS = ['All Categories', ...MEDICINE_CATEGORIES];
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50';
const FILTER_SELECT = 'h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 text-[13px] text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30';

function listFiltersOf(filters) {
  return {
    category: filters.category,
    status: filters.status,
    expiry: filters.expiry,
  };
}

export default function MedicineInventoryFilters({ applied, activeCount, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => listFiltersOf(applied));
  const appliedActive = activeCount > 0;
  const draftIsDefault =
    draft.category === LIST_FILTER_DEFAULTS.category &&
    draft.status === LIST_FILTER_DEFAULTS.status &&
    draft.expiry === LIST_FILTER_DEFAULTS.expiry;

  function handleOpenChange(nextOpen) {
    if (nextOpen) setDraft(listFiltersOf(applied));
    setOpen(nextOpen);
  }

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetDraft() {
    setDraft(LIST_FILTER_DEFAULTS);
  }

  function applyDraft() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="filter"
          size="sm"
          aria-pressed={appliedActive}
          className="gap-2 py-0 pl-1.5 pr-3"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              appliedActive
                ? "bg-white text-brand-700"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={2.1} aria-hidden="true" />
          </span>
          Filter
          {appliedActive && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Filters"
        className="w-[min(calc(100vw-1.5rem),370px)] max-w-[370px] overflow-hidden rounded-card p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">Filters</p>
          <PopoverClose asChild>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-ink-800 ${FOCUS_RING}`}
              aria-label="Close filters"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </PopoverClose>
        </div>
        <div className="grid grid-cols-1 gap-2.5 px-3 py-3 min-[360px]:grid-cols-2">
          <FilterSelect
            id="commodities-stock-filter"
            label="Stock"
            value={draft.status}
            options={BHC_STOCK_FILTER_OPTIONS}
            onChange={(value) => updateDraft("status", value)}
          />
          <FilterSelect
            id="commodities-expiry-filter"
            label="Expiry"
            value={draft.expiry}
            options={BHC_EXPIRY_FILTER_OPTIONS}
            onChange={(value) => updateDraft("expiry", value)}
          />
          <div className="min-[360px]:col-span-2">
            <FilterSelect
              id="commodities-category-filter"
              label="Category"
              value={draft.category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => updateDraft("category", value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={resetDraft}
            disabled={draftIsDefault}
          >
            Reset
          </Button>
          <Button type="button" variant="brand" size="compact" onClick={applyDraft}>
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({ id, label, value, options, onChange }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-wide text-neutral-600"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={FILTER_SELECT}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={2.1}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </div>
  );
}

