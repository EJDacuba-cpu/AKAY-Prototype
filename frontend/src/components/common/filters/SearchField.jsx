import { Search, X } from "lucide-react";

/** An always-visible search box: the icon sits inside on the left, and a clear button appears once something is typed. */
export default function SearchField({ value, onChange, placeholder, label = "Search", className = "" }) {
  return (
    <div className={`relative w-full ${className}`}>
      <Search
        aria-hidden="true"
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-9 text-[13px] text-neutral-900 shadow-xs outline-none transition-colors placeholder:text-neutral-500 hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
