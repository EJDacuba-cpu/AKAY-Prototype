import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { formatDisplayValue } from "../../../utils/formatters";

function getInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.value ?? "";
    return acc;
  }, {});
}

function getResetValue(field) {
  if (Object.prototype.hasOwnProperty.call(field, "resetValue")) {
    return field.resetValue;
  }

  if (field.type === "date") return "";

  const firstOption = field.options?.[0];
  return firstOption ? formatOption(firstOption).value : "";
}

function getResetValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = getResetValue(field);
    return acc;
  }, {});
}

function formatOption(option) {
  if (typeof option === "string") {
    return { value: option, label: option };
  }

  return {
    ...option,
    value: formatDisplayValue(option?.value ?? option?.label, ""),
    label: formatDisplayValue(option?.label ?? option?.value, "Not recorded"),
  };
}

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  activeFilterCount = 0,
  activeFilters = [],
  onApplyFilters,
  onClearFilters,
  onRemoveFilter,
  actions = null,
  filterButtonLabel = "Filters",
  accent = "#B91C1C",
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => getInitialValues(filters));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFilters() {
    setOpen((prev) => {
      if (!prev) setDraft(getInitialValues(filters));
      return !prev;
    });
  }

  function applyFilters() {
    onApplyFilters?.(draft);
    setOpen(false);
  }

  function resetDraft() {
    setDraft(getResetValues(filters));
  }

  function clearFilters() {
    onClearFilters?.();
    setOpen(false);
  }

  const hasClearableFilters = activeFilterCount > 0 || activeFilters.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm sm:p-4">
      <div ref={rootRef} className="relative">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#FCA5A5] focus:bg-white focus:ring-2"
              style={{ "--tw-ring-color": `${accent}1A` }}
            />
          </div>

          {filters.length > 0 && (
            <button
              type="button"
              onClick={toggleFilters}
              aria-expanded={open}
              aria-haspopup="dialog"
              className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                open || activeFilterCount > 0
                  ? "border-red-100 bg-red-50 text-[#B91C1C]"
                  : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-red-100 hover:bg-red-50/40 hover:text-[#B91C1C]"
              }`}
            >
              <SlidersHorizontal size={14} />
              {filterButtonLabel}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[#B91C1C] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {actions}
        </div>

        {open && (
          <FilterPopover
            filters={filters}
            draft={draft}
            hasClearableFilters={hasClearableFilters}
            onUpdateDraft={updateDraft}
            onReset={resetDraft}
            onClear={clearFilters}
            onApply={applyFilters}
          />
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onRemoveFilter?.(filter.key)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-[#B91C1C] transition-colors hover:bg-red-100/70"
            >
              {formatDisplayValue(filter.label, "Not recorded")}
              <X size={10} />
            </button>
          ))}

          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#B91C1C]"
          >
            <RotateCcw size={11} />
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterPopover({
  filters,
  draft,
  hasClearableFilters,
  onUpdateDraft,
  onReset,
  onClear,
  onApply,
}) {
  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-2xl shadow-slate-950/10 xl:left-auto xl:w-[390px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#F1F5F9] px-4 py-3.5">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">Filters</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748B]">
            Narrow the list using one or more fields.
          </p>
        </div>

        {hasClearableFilters && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:bg-red-50"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4 sm:max-h-[520px]">
        {filters.map((field) => (
          <FilterSection
            key={field.key}
            field={field}
            value={draft[field.key] ?? ""}
            onChange={(value) => onUpdateDraft(field.key, value)}
          />
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[#F1F5F9] bg-[#F8FAFC] px-4 py-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-semibold text-[#64748B] transition-colors hover:border-red-100 hover:bg-red-50/50 hover:text-[#B91C1C]"
        >
          <RotateCcw size={12} />
          Reset
        </button>

        <button
          type="button"
          onClick={onApply}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#B91C1C] px-4 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
        >
          Show Results
        </button>
      </div>
    </div>
  );
}

function FilterSection({ field, value, onChange }) {
  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-3">
      <div className="mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
          {field.label}
        </h3>
        {field.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
            {field.description}
          </p>
        )}
      </div>

      {field.type === "date" ? (
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
        />
      ) : (
        <FilterOptionList field={field} value={value} onChange={onChange} />
      )}
    </section>
  );
}

function FilterOptionList({ field, value, onChange }) {
  const options = field.options?.map(formatOption) ?? [];
  const resetValue = getResetValue(field);

  if (options.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    );
  }

  return (
    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1" role="listbox">
      {options.map((option) => {
        const selected = value === option.value;
        const defaultSelected = selected && option.value === resetValue;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            role="option"
            aria-selected={selected}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition-colors ${
              selected && !defaultSelected
                ? "border-red-100 bg-red-50 text-[#B91C1C]"
                : selected
                  ? "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]"
                  : "border-transparent bg-white text-[#64748B] hover:border-[#E8ECF0] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            }`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {selected && (
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  defaultSelected
                    ? "bg-slate-200 text-slate-600"
                    : "bg-[#B91C1C] text-white"
                }`}
              >
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
