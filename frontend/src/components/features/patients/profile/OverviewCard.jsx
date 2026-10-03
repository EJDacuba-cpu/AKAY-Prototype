// Floor per unit of `share`, in px. Keeps a card from collapsing when its
// column has no fixed height to divide (phones, tablets, short windows).
const MIN_PX_PER_SHARE = 48;

/**
 * One card on the Overview board: white, 1px gray border, square corners,
 * no shadow. Dense by default (the stacked side columns); `spacious` gives
 * the centre anatomy card more room. Title row carries an optional meta
 * (count, timestamp) and an action (View all / Edit / a toggle).
 *
 * `share` is the card's proportion of its column's height (a column is a
 * flex stack). The height never depends on content, so an empty card and a
 * full one are the same size: the body scrolls while the title row (and its
 * action) stay pinned. At xl the column height is divided by share; below
 * xl (or in a window too short for the floors) every card starts from its
 * floor, `share * 48` px unless `minHeight` (px) overrides it, and any spare
 * height in a stretched column is still split by share.
 */
export function OverviewCard({ id, title, meta, action, children, spacious = false, share = 1, minHeight, className = "" }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      style={{ "--card-min-h": `${minHeight ?? share * MIN_PX_PER_SHARE}px`, flexGrow: share, minHeight: "var(--card-min-h)" }}
      className={`flex min-w-0 shrink-0 basis-(--card-min-h) flex-col border border-gray-200 bg-white xl:shrink xl:basis-0 ${spacious ? "p-3" : "px-2.5 py-2"} ${className}`}
    >
      <header className={`${spacious ? "mb-2 min-h-5" : "mb-1 min-h-4"} flex shrink-0 items-center justify-between gap-3`}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2
            id={`${id}-title`}
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 font-sans!"
          >
            {title}
          </h2>
          {meta && <span className="text-[11px] tabular-nums text-slate-400">{meta}</span>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">{children}</div>
    </section>
  );
}

/** One quiet line for an empty or loading card. */
export function OverviewNote({ children, role }) {
  return (
    <p role={role} className="text-xs text-slate-500">
      {children}
    </p>
  );
}
