import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { DatePickerField } from "../forms/DatePickerField";
import ListFilterChips from "./ListFilterChips";
import { isDraftDefault, pickFilterValues } from "./listFilterPopoverUtils.js";

export { isDraftDefault, pickFilterValues } from "./listFilterPopoverUtils.js";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const FILTER_SELECT =
  "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 text-[13px] text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";

function normalizeOption(option) {
  if (typeof option === "string") return { value: option, label: option };
  return {
    value: option?.value ?? option?.label ?? "",
    label: option?.label ?? option?.value ?? "",
  };
}

/**
 * Shared Referrals-style filter popover: trigger, chips under header,
 * field grid, Reset + Apply Filters. Module-specific options stay in `fields`.
 */
export default function ListFilterPopover({
  fields = [],
  applied = {},
  activeFilters = [],
  activeCount,
  label = "Filter",
  ariaLabel = "Filters",
  onApply,
  onRemoveFilter,
  onClearAll,
  leadingFields = null,
  pickValues = pickFilterValues,
  isDefault = isDraftDefault,
  buildDefaults = (currentFields) => pickFilterValues({}, currentFields),
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => pickValues(applied, fields));
  const count = activeCount ?? activeFilters.length;
  const appliedActive = count > 0;
  const draftIsDefault = isDefault(draft, fields);

  function handleOpenChange(nextOpen) {
    if (nextOpen) setDraft(pickValues(applied, fields));
    setOpen(nextOpen);
  }

  function updateDraft(key, value) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      const field = fields.find((item) => item.key === key);
      if (
        (field?.type === "datePresets" || field?.type === "datePreset") &&
        value !== "custom"
      ) {
        next[field.dateFromKey || "dateFrom"] = "";
        next[field.dateToKey || "dateTo"] = "";
      }
      return next;
    });
  }

  function resetDraft() {
    setDraft(buildDefaults(fields));
  }

  function applyDraft() {
    const result = onApply?.(draft);
    if (result === false) return;
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
          {label}
          {appliedActive ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-label={ariaLabel}
        className="w-[min(calc(100vw-1.5rem),370px)] max-w-[370px] overflow-hidden rounded-card p-0"
        onPointerDownOutside={(event) => {
          if (event.target?.closest?.("[data-akay-datepicker]")) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          if (event.target?.closest?.("[data-akay-datepicker]")) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">{ariaLabel}</p>
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

        {activeFilters.length > 0 ? (
          <div className="border-b border-neutral-200 px-3 py-2.5">
            <ListFilterChips
              filters={activeFilters}
              onRemove={(key) => {
                onRemoveFilter?.(key);
                setDraft((current) => {
                  const field = fields.find((item) => item.key === key);
                  if (!field) {
                    const next = { ...current };
                    delete next[key];
                    return next;
                  }
                  const next = {
                    ...current,
                    [key]: field.resetValue,
                  };
                  if (field.type === "datePresets" || field.type === "datePreset") {
                    next[field.dateFromKey || "dateFrom"] = "";
                    next[field.dateToKey || "dateTo"] = "";
                  }
                  return next;
                });
              }}
              onClearAll={
                onClearAll
                  ? () => {
                      onClearAll();
                      setDraft(buildDefaults(fields));
                    }
                  : undefined
              }
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 px-3 py-3 min-[360px]:grid-cols-2">
          {leadingFields}
          {fields.map((field) => {
            const fullWidth =
              field.fullWidth ||
              ((field.type === "datePresets" || field.type === "datePreset") &&
                draft[field.key] === "custom");
            return (
              <div
                key={field.key}
                className={fullWidth ? "min-[360px]:col-span-2" : undefined}
              >
                {field.type === "datePresets" || field.type === "datePreset" ? (
                  <DatePresetField
                    field={field}
                    draft={draft}
                    onChange={updateDraft}
                  />
                ) : field.type === "date" ? (
                  <DatePickerField
                    label={field.label}
                    name={field.key}
                    value={draft[field.key] || ""}
                    allowClear
                    onChange={(value) => updateDraft(field.key, value)}
                  />
                ) : (
                  <FilterSelect
                    id={`list-filter-${field.key}`}
                    label={field.label}
                    value={draft[field.key] ?? field.resetValue}
                    options={field.options}
                    placeholder={field.placeholder}
                    includeEmpty={
                      field.resetValue === "" && Boolean(field.placeholder)
                    }
                    emptyLabel={field.placeholder}
                    onChange={(value) => updateDraft(field.key, value)}
                  />
                )}
              </div>
            );
          })}
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

function DatePresetField({ field, draft, onChange }) {
  const presets = field.presets || field.options || [];
  const fromKey = field.dateFromKey || "dateFrom";
  const toKey = field.dateToKey || "dateTo";
  const customValue = field.customValue || "custom";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FilterSelect
        id={`list-filter-${field.key}`}
        label={field.label}
        value={draft[field.key] ?? field.resetValue}
        options={presets.map(normalizeOption)}
        onChange={(value) => onChange(field.key, value)}
      />
      {draft[field.key] === customValue ? (
        <div className="grid grid-cols-2 gap-2">
          <DatePickerField
            label="From"
            name={`${field.key}-from`}
            value={draft[fromKey] || ""}
            allowClear
            onChange={(value) => onChange(fromKey, value)}
          />
          <DatePickerField
            label="To"
            name={`${field.key}-to`}
            value={draft[toKey] || ""}
            allowClear
            onChange={(value) => onChange(toKey, value)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  placeholder,
  includeEmpty = false,
  emptyLabel,
  onChange,
}) {
  const normalized = (options || []).map(normalizeOption);

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
          {includeEmpty ? (
            <option value="">{emptyLabel || placeholder || "All"}</option>
          ) : null}
          {normalized.map((option) => (
            <option key={`${option.value}-${option.label}`} value={option.value}>
              {option.label}
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
