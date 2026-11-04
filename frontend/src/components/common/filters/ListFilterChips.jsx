import { X } from "lucide-react";
import { Button } from "../../ui/button";

/** Removable advanced-filter chips only (search stays in the SearchField clear control). */
export default function ListFilterChips({
  filters = [],
  onRemove,
  onClearAll,
  clearLabel = "Clear filters",
}) {
  if (!filters.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-neutral-200 bg-white pl-2.5 pr-1 text-[12px] text-ink-800"
        >
          {filter.label}
          {onRemove ? (
            <button
              type="button"
              aria-label={`Remove ${filter.label} filter`}
              onClick={() => onRemove(filter.key)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 outline-none hover:bg-neutral-100 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50"
            >
              <X size={12} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}
      {onClearAll ? (
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="h-7 rounded-full"
          onClick={onClearAll}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
