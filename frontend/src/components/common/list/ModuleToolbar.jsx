import { Link } from "react-router";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ListFilterPopover, {
  pickFilterValues,
} from "../filters/ListFilterPopover";
import SearchFilterCluster from "../filters/SearchFilterCluster";
import { Button } from "../../ui/button";
import { formatDisplayValue } from "../../../utils/formatters";

function getInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.value ?? "";
    if (field.type === "datePresets" || field.type === "datePreset") {
      acc[field.dateFromKey || "dateFrom"] = field.dateFromValue ?? "";
      acc[field.dateToKey || "dateTo"] = field.dateToValue ?? "";
    }
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
    if (field.type === "datePresets" || field.type === "datePreset") {
      acc[field.dateFromKey || "dateFrom"] = "";
      acc[field.dateToKey || "dateTo"] = "";
    }
    if (field.customDateKey) acc[field.customDateKey] = "";
    return acc;
  }, {});
}

export default function ModuleToolbar({
  heading = null,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  showFilters = true,
  filtersLabel = "Filters",
  filters = [],
  activeFilterCount = 0,
  activeFilters = [],
  filtersOpen: controlledFiltersOpen,
  onFilterClick,
  onApplyFilters,
  onClearFilters,
  onRemoveFilter,
  filterDescription = "Narrow the list.",
  filterControl = null,
  primaryActionLabel,
  primaryActionTo,
  primaryActionIcon,
  onPrimaryAction,
  actions = null,
  disabled = false,
  variant,
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchValue));
  // The clinical variant keeps a permanent full-width search that only filters
  // when submitted (Enter or the Search button), so the draft is local.
  const isClinical = variant === "clinical";
  const [searchDraft, setSearchDraft] = useState(searchValue);
  const toolbarRef = useRef(null);
  const searchInputRef = useRef(null);
  const shouldShowFilters = showFilters && (filters.length > 0 || onFilterClick);
  const useCluster = Boolean(shouldShowFilters || filterControl);
  const popoverFields = useMemo(
    () =>
      filters.map((field) => ({
        ...field,
        resetValue: Object.prototype.hasOwnProperty.call(field, "resetValue")
          ? field.resetValue
          : getResetValue(field),
      })),
    [filters],
  );
  const appliedFilters = useMemo(() => getInitialValues(filters), [filters]);

  useEffect(() => {
    setSearchDraft(searchValue);
  }, [searchValue]);

  useEffect(() => {
    if (!disabled) return;
    setSearchOpen(false);
  }, [disabled]);

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

  function submitSearch(event) {
    event.preventDefault();
    if (disabled) return;
    onSearchChange?.(searchDraft.trim());
  }

  function clearClinicalSearch() {
    if (disabled) return;
    setSearchDraft("");
    onSearchChange?.("");
    searchInputRef.current?.focus();
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
    <div ref={toolbarRef} data-variant={variant} className="module-toolbar relative z-20 mb-4">
      <div
        className={`module-toolbar__row flex flex-col gap-3 sm:flex-row sm:items-center ${
          heading ? "sm:justify-between" : "sm:justify-end"
        }`}
      >
        {heading}
        <div className="module-toolbar__controls flex min-w-0 items-center justify-end gap-2 sm:ml-auto">
          {(() => {
            const searchControl = isClinical ? (
              <form className="clinical-search" role="search" onSubmit={submitSearch}>
                <Search size={16} className="clinical-search__icon" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder.replace(/\.{3}$/, "")}
                  disabled={disabled}
                  className="clinical-search__input"
                />
                {(searchDraft || searchValue) && (
                  <button
                    type="button"
                    onClick={clearClinicalSearch}
                    disabled={disabled}
                    className="clinical-search__clear"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
                <button type="submit" disabled={disabled} className="clinical-search__submit">
                  Search
                </button>
              </form>
            ) : useCluster ? (
              <div className="relative w-full">
                <Search
                  aria-hidden="true"
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(event) => onSearchChange?.(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder.replace(/\.{3}$/, "")}
                  disabled={disabled}
                  className="h-8 w-full rounded-full border-0 bg-transparent pl-9 pr-8 text-[13px] text-ink-800 outline-none placeholder:text-neutral-500"
                />
                {searchValue ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    disabled={disabled}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-ink-800"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            ) : (
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
            );

            const builtInFilter =
              shouldShowFilters && filters.length > 0 && !onFilterClick ? (
                <ListFilterPopover
                  fields={popoverFields}
                  applied={appliedFilters}
                  activeFilters={activeFilters}
                  activeCount={activeFilterCount}
                  label={filtersLabel === "Filters" ? "Filter" : filtersLabel}
                  onApply={onApplyFilters}
                  onRemoveFilter={onRemoveFilter}
                  onClearAll={onClearFilters}
                  pickValues={(current) =>
                    pickFilterValues(current, popoverFields)
                  }
                  buildDefaults={() => getResetValues(popoverFields)}
                />
              ) : shouldShowFilters && onFilterClick ? (
                <Button
                  type="button"
                  variant="filter"
                  size="sm"
                  onClick={onFilterClick}
                  disabled={disabled}
                  aria-expanded={controlledFiltersOpen}
                  aria-haspopup="dialog"
                  aria-pressed={activeFilterCount > 0}
                  className="gap-2 py-0 pl-1.5 pr-3"
                >
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              ) : null;

            const filterNode = filterControl || builtInFilter;

            if (useCluster) {
              return (
                <SearchFilterCluster search={searchControl} filter={filterNode} />
              );
            }

            return (
              <>
                {searchControl}
                {filterNode}
              </>
            );
          })()}
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
    </div>
  );
}
