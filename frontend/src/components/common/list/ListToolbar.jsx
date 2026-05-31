import { useEffect, useRef, useState } from "react";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";

function getInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.value ?? "";
    return acc;
  }, {});
}

function formatOption(option) {
  if (typeof option === "string") {
    return { value: option, label: option };
  }

  return option;
}

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  chip = null,
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

  function clearFilters() {
    onClearFilters?.();
    setOpen(false);
  }

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

          {chip && (
            <div className="inline-flex h-10 shrink-0 items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[11px] font-semibold text-[#475569]">
              {chip}
            </div>
          )}

          {filters.length > 0 && (
            <button
              type="button"
              onClick={toggleFilters}
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
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-full max-w-[340px] rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl shadow-black/[0.08]">
            <div className="space-y-3">
              {filters.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                    {field.label}
                  </label>

                  {field.type === "date" ? (
                    <input
                      type="date"
                      value={draft[field.key] || ""}
                      onChange={(event) =>
                        updateDraft(field.key, event.target.value)
                      }
                      className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                    />
                  ) : (
                    <select
                      value={draft[field.key] || ""}
                      onChange={(event) =>
                        updateDraft(field.key, event.target.value)
                      }
                      className="h-10 w-full appearance-none rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                    >
                      {field.options?.map((option) => {
                        const item = formatOption(option);
                        return (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#F3F4F6] pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#B91C1C]"
              >
                <RotateCcw size={11} />
                Clear all
              </button>

              <button
                type="button"
                onClick={applyFilters}
                className="h-9 rounded-lg bg-[#B91C1C] px-4 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
              >
                Apply filters
              </button>
            </div>
          </div>
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
              {filter.label}
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
