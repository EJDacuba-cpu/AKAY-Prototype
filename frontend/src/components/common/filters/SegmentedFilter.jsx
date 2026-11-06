/**
 * A short row of mutually exclusive choices (for example All / Active / Inactive) on a quiet gray track, the chosen
 * one lifted to white. `options` are `{ value, label }`; `label` names the group for screen readers.
 * `visibleLabel` is the 12px caption above the track.
 * `wrap` keeps longer option sets visible by wrapping chips instead of hiding them in a horizontal scroll.
 */
export default function SegmentedFilter({ options, value, onChange, label, visibleLabel, wrap = false }) {
  const group = (
    <div
      role="group"
      aria-label={label || visibleLabel}
      className={
        wrap
          ? "max-w-full"
          : "-mx-1 flex max-w-full overflow-x-auto px-1 sm:mx-0 sm:px-0"
      }
    >
      <div
        className={
          wrap
            ? "flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1"
            : "inline-flex shrink-0 rounded-full bg-neutral-100 p-1"
        }
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`h-8 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 ${
                active
                  ? "bg-white text-ink-800 shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!visibleLabel) return group;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-neutral-600">{visibleLabel}</span>
      {group}
    </div>
  );
}
