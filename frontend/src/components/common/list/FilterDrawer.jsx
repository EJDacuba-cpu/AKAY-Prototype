import { createPortal } from "react-dom";
import { Check, RotateCcw, X } from "lucide-react";
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

export default function FilterDrawer({
  filters,
  draft,
  hasClearableFilters,
  onUpdateDraft,
  onReset,
  onClear,
  onApply,
  onClose,
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Filters"
        aria-modal="true"
        className="ml-auto flex h-dvh w-full max-w-[420px] animate-[filterDrawerIn_180ms_cubic-bezier(0.22,1,0.36,1)] flex-col overflow-hidden border-l border-[#E5E7EB] bg-white shadow-2xl shadow-slate-950/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-[#F1F5F9] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">Filters</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                Narrow the health records list using focused criteria.
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

          {hasClearableFilters && (
            <button
              type="button"
              onClick={onClear}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:bg-red-50"
            >
              <RotateCcw size={11} />
              Clear all
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {filters.map((field) => (
            <FilterSection
              key={field.key}
              field={field}
              value={draft[field.key] ?? ""}
              onChange={(value) => onUpdateDraft(field.key, value)}
            />
          ))}
        </div>

        <div className="sticky bottom-0 z-10 border-t border-[#E5E7EB] bg-white px-5 py-4 shadow-[0_-12px_24px_rgba(15,23,42,0.06)]">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-semibold text-[#64748B] transition-colors hover:border-red-100 hover:bg-red-50/50 hover:text-[#B91C1C]"
            >
              <RotateCcw size={13} />
              Reset
            </button>

            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              Show Results
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes filterDrawerIn {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}

function FilterSection({ field, value, onChange }) {
  return (
    <section className="rounded-2xl border border-[#E8ECF0] bg-[#FBFCFD] p-4">
      <div className="mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#475569]">
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
          className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
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
        className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#FCA5A5] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    );
  }

  return (
    <div className="space-y-1.5" role="listbox">
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
            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[12px] font-semibold transition-colors ${
              selected && !defaultSelected
                ? "border-red-100 bg-red-50 text-[#B91C1C]"
                : selected
                  ? "border-[#E2E8F0] bg-white text-[#0F172A]"
                  : "border-transparent bg-white text-[#64748B] hover:border-[#E8ECF0] hover:text-[#0F172A]"
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
