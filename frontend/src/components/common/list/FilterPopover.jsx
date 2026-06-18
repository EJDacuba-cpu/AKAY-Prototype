import { RotateCcw, X } from "lucide-react";
import { formatDisplayValue } from "../../../utils/formatters";

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

function getResetValue(field) {
  if (Object.prototype.hasOwnProperty.call(field, "resetValue")) {
    return field.resetValue;
  }

  if (field.type === "date") return "";

  const firstOption = field.options?.[0];
  return firstOption ? formatOption(firstOption).value : "";
}

export default function FilterPopover({
  filters,
  draft,
  onUpdateDraft,
  onReset,
  onApply,
  onClose,
}) {
  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[min(92vw,440px)] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl shadow-slate-950/15"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[#F1F5F9] px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">Filters</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748B]">
              Narrow the health records list.
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
        {filters.map((field) => (
          <FilterSection
            key={field.key}
            field={field}
            draft={draft}
            value={draft[field.key] ?? ""}
            onUpdateDraft={onUpdateDraft}
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

function FilterSection({ field, draft, value, onUpdateDraft }) {
  const compactPills = ["quick", "pills", "referral", "datePreset"].includes(
    field.type,
  );

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

      {field.type === "date" ? (
        <DateInput
          value={value}
          onChange={(nextValue) => onUpdateDraft(field.key, nextValue)}
        />
      ) : field.type === "select" ? (
        <SelectInput
          field={field}
          value={value}
          onChange={(nextValue) => onUpdateDraft(field.key, nextValue)}
        />
      ) : (
        <FilterOptionList
          field={field}
          value={value}
          onChange={(nextValue) => onUpdateDraft(field.key, nextValue)}
          compactPills={compactPills}
        />
      )}

      {field.customDateKey && value === field.customDateValue && (
        <div className="mt-2">
          <DateInput
            value={draft[field.customDateKey] ?? ""}
            onChange={(nextValue) =>
              onUpdateDraft(field.customDateKey, nextValue)
            }
          />
        </div>
      )}
    </section>
  );
}

function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
    />
  );
}

function SelectInput({ field, value, onChange }) {
  const options = field.options?.map(formatOption) ?? [];

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FilterOptionList({ field, value, onChange, compactPills = false }) {
  const options = field.options?.map(formatOption) ?? [];
  const resetValue = getResetValue(field);

  if (options.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    );
  }

  if (compactPills) {
    return (
      <div className="flex flex-wrap gap-2" role="listbox">
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
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors ${
                selected && !defaultSelected
                  ? "border-red-200 bg-red-50 text-[#B91C1C]"
                  : selected
                    ? "border-slate-200 bg-slate-50 text-[#0F172A]"
                    : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-red-100 hover:bg-red-50/40 hover:text-[#B91C1C]"
              }`}
            >
              {selected && !defaultSelected && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-1.5" role="listbox">
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
            className={`flex min-h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[12px] font-semibold transition-colors ${
              selected && !defaultSelected
                ? "bg-red-50/80 text-[#B91C1C]"
                : selected
                  ? "bg-slate-50 text-[#0F172A]"
                  : "bg-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            }`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {selected && (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  defaultSelected ? "bg-slate-300" : "bg-[#B91C1C]"
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
