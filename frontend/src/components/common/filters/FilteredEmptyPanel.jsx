import { Search } from "lucide-react";
import { Button } from "../../ui/button";

/** Centered sheet when search/filters match nothing — replaces an empty table body. */
export default function FilteredEmptyPanel({
  title = "No results found",
  description = "Try a different search, or clear filters to see everything again.",
  onClear,
  clearLabel = "Clear search and filters",
  icon,
  className = "",
}) {
  return (
    <div
      className={`flex min-h-[324px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-12 text-center shadow-card ${className}`}
      role="status"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
        {icon || <Search size={20} className="text-neutral-400" aria-hidden="true" />}
      </div>
      <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] text-neutral-500">{description}</p>
      ) : null}
      {onClear ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onClear}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
