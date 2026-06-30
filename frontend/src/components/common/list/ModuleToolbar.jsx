import { Link } from "react-router";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FilterPopover from "./FilterPopover";
import { formatDisplayValue } from "../../../utils/formatters";

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
  if (!firstOption) return "";
  if (typeof firstOption === "string") return firstOption;
  return formatDisplayValue(firstOption.value ?? firstOption.label, "");
}

function getResetValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = getResetValue(field);
    if (field.customDateKey) acc[field.customDateKey] = "";
    return acc;
  }, {});
}

export default function ModuleToolbar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  showFilters = true,
  filtersLabel = "Filters",
  filters = [],
  activeFilterCount = 0,
  filtersOpen: controlledFiltersOpen,
  onFilterClick,
  onApplyFilters,
  onClearFilters,
  filterDescription = "Narrow the list.",
  primaryActionLabel,
  primaryActionTo,
  primaryActionIcon,
  onPrimaryAction,
  actions = null,
  disabled = false,
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchValue));
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(() => getInitialValues(filters));
  const toolbarRef = useRef(null);
  const searchInputRef = useRef(null);
  const filtersOpen = controlledFiltersOpen ?? internalFiltersOpen;
  const shouldShowFilters = showFilters && (filters.length > 0 || onFilterClick);

  useEffect(() => {
    if (!disabled) return;
    setSearchOpen(false);
    setInternalFiltersOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setInternalFiltersOpen(false);
    }

    function handlePointerDown(event) {
      if (!toolbarRef.current?.contains(event.target)) {
        setInternalFiltersOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [filtersOpen]);

  function toggleSearch() {
    if (disabled) return;
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }

    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function clearSearch() {
    if (disabled) return;
    onSearchChange?.("");
    setSearchOpen(false);
  }

  function handleSearchBlur() {
    if (!searchValue) setSearchOpen(false);
  }

  function openFilters() {
    if (disabled) return;
    setDraft(getInitialValues(filters));

    if (onFilterClick) {
      onFilterClick();
      return;
    }

    setInternalFiltersOpen((current) => !current);
  }

  function closeFilters() {
    setInternalFiltersOpen(false);
  }

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetDraft() {
    setDraft(getResetValues(filters));
  }

  function applyFilters() {
    onApplyFilters?.(draft);
    setInternalFiltersOpen(false);
  }

  function clearFilters() {
    onClearFilters?.();
    setInternalFiltersOpen(false);
  }

  const primaryActionClass =
    "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D] sm:h-10 sm:w-auto";

  let primaryAction = null;

  if (primaryActionLabel && primaryActionTo) {
    primaryAction = (
      <Link
        to={primaryActionTo}
        className={`${primaryActionClass} ${disabled ? "pointer-events-none opacity-60" : ""}`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
      >
        {primaryActionIcon}
        {primaryActionLabel}
      </Link>
    );
  } else if (primaryActionLabel) {
    primaryAction = (
      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={disabled}
        className={primaryActionClass}
      >
        {primaryActionIcon}
        {primaryActionLabel}
      </button>
    );
  }
  return (
    <div ref={toolbarRef} className="relative z-20 mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div
            className={`group relative flex h-10 items-center rounded-xl border border-[#E5E7EB] bg-white shadow-sm transition-all duration-300 ${
              searchOpen
                ? "w-full sm:w-[min(72vw,360px)]"
                : "w-full hover:border-red-100 hover:bg-red-50/30 sm:w-10"
            }`}
          >
            <button
              type="button"
              onClick={toggleSearch}
              disabled={disabled}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition-colors hover:text-[#B91C1C]"
              aria-label="Search"
            >
              <Search size={16} />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onFocus={() => setSearchOpen(true)}
              onBlur={handleSearchBlur}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              disabled={disabled}
              className={`h-10 min-w-0 bg-transparent pr-9 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] ${
                searchOpen ? "w-full opacity-100" : "w-full opacity-100 sm:w-0 sm:opacity-0"
              }`}
            />
            {(searchOpen || searchValue) && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSearch}
                disabled={disabled}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
                aria-label={
                  searchValue ? "Clear and collapse search" : "Collapse search"
                }
              >
                <X size={13} />
              </button>
            )}
          </div>

          {shouldShowFilters && (
            <button
              type="button"
              onClick={openFilters}
              disabled={disabled}
              aria-expanded={filtersOpen}
              aria-haspopup="dialog"
              className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-[12px] font-semibold shadow-sm transition-colors ${
                filtersOpen || activeFilterCount > 0
                  ? "border-red-100 bg-red-50 text-[#B91C1C]"
                  : "border-[#E5E7EB] bg-white text-[#64748B] hover:border-red-100 hover:bg-red-50/40 hover:text-[#B91C1C]"
              }`}
            >
              <SlidersHorizontal size={14} />
              {filtersLabel}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[#B91C1C] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>

        {(primaryAction || actions) && (
          <div
            className={`grid w-full gap-2 sm:w-auto sm:[&>*]:w-auto [&>*]:w-full ${
              disabled ? "pointer-events-none opacity-60" : ""
            }`}
            aria-disabled={disabled}
          >
            {primaryAction}
            {actions}
          </div>
        )}
      </div>

      {filtersOpen && filters.length > 0 && !onFilterClick && !disabled && (
        <FilterPopover
          filters={filters}
          draft={draft}
          onUpdateDraft={updateDraft}
          onReset={resetDraft}
          onClear={clearFilters}
          onApply={applyFilters}
          onClose={closeFilters}
          description={filterDescription}
        />
      )}

    </div>
  );
}
