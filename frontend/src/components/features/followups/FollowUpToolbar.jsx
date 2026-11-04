import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import SearchField from "../../common/filters/SearchField";
import { Button } from "../../ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../ui/popover";

export default function FollowUpToolbar({ filters, config, activeFilters, count, calendar, onSearch, onApply, onRemove, onClear }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ serviceType: filters.serviceType, state: filters.state });
  const defaults = Object.fromEntries(config.map((field) => [field.key, field.resetValue]));
  const draftIsDefault = config.every((field) => draft[field.key] === field.resetValue);

  function changeOpen(nextOpen) {
    if (nextOpen) setDraft({ serviceType: filters.serviceType, state: filters.state });
    setOpen(nextOpen);
  }

  return (
    <div className="followup-modern-toolbar">
      <div className="followup-heading">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Follow-ups</h1>
        <p className="mt-1 text-[13px] text-neutral-600">Scheduled return visits and follow-up records.</p>
      </div>
      <div className="followup-search-controls flex min-w-0 items-center gap-2">
        <SearchField value={filters.search} onChange={onSearch} placeholder="Search patient or record..." label="Search follow-ups" className="min-w-0 flex-1" />
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="filter" size="sm" aria-pressed={activeFilters.length > 0} className="shrink-0 gap-2 pl-1.5 pr-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"><SlidersHorizontal size={13} aria-hidden="true" /></span>
              Filter
              {activeFilters.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{activeFilters.length}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} collisionPadding={12} aria-label="Follow-up filters" className="w-[min(calc(100vw-1.5rem),370px)] overflow-hidden rounded-card p-0">
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
              <h2 className="text-[13px] font-semibold text-ink-800">Filters</h2>
              <PopoverClose asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Close filters"><X size={14} /></Button></PopoverClose>
            </div>
            <div className="grid gap-3 px-3 py-3">
              {config.map((field) => (
                <div key={field.key} className="min-w-0 space-y-1">
                  <label htmlFor={`followup-filter-${field.key}`} className="text-xs font-medium text-neutral-600">{field.label}</label>
                  <div className="relative">
                    <select id={`followup-filter-${field.key}`} value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} className="h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 text-[13px] text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30">
                      {field.resetValue === "" && <option value="">{field.placeholder}</option>}
                      {field.options.map((option) => <option key={option} value={option}>{calendar && option === "All Active" ? "All statuses" : option}</option>)}
                    </select>
                    <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
              <Button type="button" variant="secondary" size="compact" disabled={draftIsDefault} onClick={() => setDraft(defaults)}>Reset</Button>
              <Button type="button" variant="brand" size="compact" onClick={() => { onApply(draft); setOpen(false); }}>Apply Filters</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="followup-filter-summary flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        <span aria-live="polite" className="tabular-nums">{count} follow-up{count === 1 ? "" : "s"}</span>
        {activeFilters.map((filter) => <Button key={filter.key} type="button" variant="secondary" size="compact" className="h-7 gap-1 rounded-full text-xs" onClick={() => onRemove(filter.key)} aria-label={`Remove ${filter.label} filter`}>{filter.label}<X size={12} aria-hidden="true" /></Button>)}
        {(activeFilters.length > 0 || filters.search) && <Button type="button" variant="ghost" size="compact" className="h-7 rounded-full text-xs" onClick={onClear}>Clear filters</Button>}
      </div>
    </div>
  );
}
