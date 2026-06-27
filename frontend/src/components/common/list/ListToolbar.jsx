import { useEffect, useRef, useState } from "react";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { formatDisplayValue } from "../../../utils/formatters";
import FilterPopover from "./FilterPopover";

function getInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.value ?? "";
    if (field.customDateKey) {
      acc[field.customDateKey] = field.customDateCurrentValue ?? "";
    }
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
    if (field.customDateKey) {
      acc[field.customDateKey] = "";
    }
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
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => getInitialValues(filters));
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (!toolbarRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFilters() {
    if (disabled) return;
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
      <div ref={toolbarRef} className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:flex-nowrap">
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
              disabled={disabled}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#FCA5A5] focus:bg-white focus:ring-2"
              style={{ "--tw-ring-color": `${accent}1A` }}
            />
          </div>

          {filters.length > 0 && (
            <button
              type="button"
              onClick={toggleFilters}
              disabled={disabled}
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

          {actions && (
            <div
              className={`grid w-full gap-2 sm:w-auto sm:[&>*]:w-auto [&>*]:w-full ${
                disabled ? "pointer-events-none opacity-60" : ""
              }`}
              aria-disabled={disabled}
            >
              {actions}
            </div>
          )}
        </div>

        {open && !disabled && (
          <FilterPopover
            filters={filters}
            draft={draft}
            hasClearableFilters={hasClearableFilters}
            onUpdateDraft={updateDraft}
            onReset={resetDraft}
            onClear={clearFilters}
            onApply={applyFilters}
            onClose={() => setOpen(false)}
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
              className="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:bg-red-100/70"
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


