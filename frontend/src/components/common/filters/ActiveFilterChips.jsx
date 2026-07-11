import { X } from "lucide-react";

export default function ActiveFilterChips({
  filters = [],
  onRemove,
  onClearAll,
}) {
  if (!filters.length) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 text-[11px] font-semibold text-[#991B1B]"
        >
          {filter.label}
          <button
            type="button"
            onClick={() => onRemove?.(filter.key)}
            className="rounded p-0.5 transition hover:bg-red-100"
            aria-label={`Remove ${filter.label} filter`}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      {filters.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
        >
          Clear All
        </button>
      )}
    </div>
  );
}
