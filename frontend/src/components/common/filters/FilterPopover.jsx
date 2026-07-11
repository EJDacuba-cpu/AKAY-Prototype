import { RotateCcw, X } from "lucide-react";
import { DEFAULT_DATE_PRESETS } from "../../../utils/filterUtils";

function normalizeOption(option) {
  if (typeof option === "string") return { value: option, label: option };
  return {
    value: option?.value ?? option?.label ?? "",
    label: option?.label ?? option?.value ?? "Not recorded",
  };
}

export default function FilterPopover({
  open = true,
  title = "Filters",
  subtitle = "Narrow the list.",
  filters = {},
  config = [],
  onChange,
  onApply,
  onReset,
  onClose,
}) {
  if (!open) return null;

  function updateValue(key, value) {
    onChange?.((current) => ({ ...current, [key]: value }));
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[min(92vw,440px)] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl shadow-slate-950/15"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[#F1F5F9] px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748B]">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            aria-label="Close filters"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="max-h-[min(68vh,590px)] space-y-4 overflow-y-auto px-4 py-4">
        {config.map((field) => (
          <FilterSection
            key={field.key}
            field={field}
            filters={filters}
            onChange={updateValue}
          />
        ))}
      </div>

      <div className="border-t border-[#E5E7EB] bg-[#FCFCFD] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-semibold text-[#64748B] transition-colors hover:border-red-100 hover:bg-red-50/50 hover:text-[#B91C1C]"
          >
            <RotateCcw size={13} />
            Reset
          </button>

          <button
            type="button"
            onClick={onApply}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
          >
            Show Results
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ field, filters, onChange }) {
  const value = filters[field.key] ?? field.resetValue ?? "";

  return (
    <section className="border-b border-[#EEF2F6] pb-4 last:border-b-0 last:pb-0">
      <div className="mb-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#475569]">
          {field.label}
        </h3>
        {field.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
            {field.description}
          </p>
        )}
      </div>

      {field.type === "datePresets" || field.type === "datePreset" ? (
        <DatePresetField field={field} filters={filters} onChange={onChange} />
      ) : field.type === "select" ? (
        <SelectField field={field} value={value} onChange={onChange} />
      ) : (
        <InputField field={field} value={value} onChange={onChange} />
      )}
    </section>
  );
}

function DatePresetField({ field, filters, onChange }) {
  const presets = (field.presets || field.options || DEFAULT_DATE_PRESETS).map(
    normalizeOption,
  );
  const selected = filters[field.key] ?? field.resetValue ?? "all";
  const resetValue = field.resetValue ?? "all";
  const customValue =
    field.customDateValue ||
    presets.find((option) => option.value === "custom")?.value ||
    "custom";
  const fromKey = field.dateFromKey || "dateFrom";
  const toKey = field.dateToKey || "dateTo";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="listbox">
        {presets.map((preset) => {
          const active = selected === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(field.key, preset.value)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors ${
                active && preset.value !== resetValue
                  ? "border-red-200 bg-red-50 text-[#B91C1C]"
                  : active
                    ? "border-slate-200 bg-slate-50 text-[#0F172A]"
                    : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-red-100 hover:bg-red-50/40 hover:text-[#B91C1C]"
              }`}
            >
              {active && preset.value !== resetValue && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
              )}
              {preset.label}
            </button>
          );
        })}
      </div>

      {selected === customValue && field.customDateKey ? (
        <InputField
          field={{ key: field.customDateKey, type: "date", placeholder: "Date" }}
          value={filters[field.customDateKey] ?? ""}
          onChange={onChange}
        />
      ) : null}

      {selected === customValue && !field.customDateKey ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            field={{ key: fromKey, type: "date", placeholder: "Date From" }}
            value={filters[fromKey] ?? ""}
            onChange={onChange}
          />
          <InputField
            field={{ key: toKey, type: "date", placeholder: "Date To" }}
            value={filters[toKey] ?? ""}
            onChange={onChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function SelectField({ field, value, onChange }) {
  const options = (field.options || []).map(normalizeOption);
  const placeholder = field.placeholder || "All";

  return (
    <select
      value={value}
      onChange={(event) => onChange(field.key, event.target.value)}
      className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
    >
      {field.resetValue === "" && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function InputField({ field, value, onChange }) {
  return (
    <input
      type={field.type || "text"}
      value={value}
      min={field.min}
      max={field.max}
      placeholder={field.placeholder}
      onChange={(event) => onChange(field.key, event.target.value)}
      className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
    />
  );
}
