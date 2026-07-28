import { X } from "lucide-react";

export default function ActiveFilterChips({
  filters = [],
  onRemove,
  onClearAll,
  showHeading = true,
}) {
  if (!filters.length) return null;

  return (
    <div className="no-print space-y-2.5">
      {showHeading && (
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#475569]">
            Active Filters
          </h3>
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-semibold text-[#B91C1C] transition hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

        {!showHeading && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
