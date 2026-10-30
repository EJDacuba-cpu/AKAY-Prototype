// Floor per unit of `share`, in px. Keeps a card from collapsing when its
// column has no fixed height to divide (phones, tablets, short windows).
const MIN_PX_PER_SHARE = 48;

/**
 * One card on the Overview board: white, soft 1px border, 12px corners and a
 * faint offset shadow. Compact by default (the stacked side columns);
 * `spacious` gives the centre anatomy card more room. Title row carries an optional meta
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
export function OverviewCard({ id, title, meta, action, children, spacious = false, share = 1, minHeight, className = "", scrollable = true }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      style={{ "--card-min-h": `${minHeight ?? share * MIN_PX_PER_SHARE}px`, flexGrow: share, minHeight: "var(--card-min-h)" }}
      className={`flex min-w-0 shrink-0 basis-(--card-min-h) flex-col rounded-xl border border-neutral-200/80 bg-white shadow-card flow:basis-auto board-xl:shrink board-xl:basis-0 ${spacious ? "px-4 py-3.5" : "px-3.5 py-3"} ${className}`}
    >
      <header className={`${spacious ? "mb-3 min-h-7" : "mb-1.5 min-h-5"} flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2
            id={`${id}-title`}
            className="text-[13px] font-semibold text-neutral-900 font-sans!"
          >
            {title}
          </h2>
          {meta && <span className="text-xs tabular-nums text-neutral-500">{meta}</span>}
        </div>
        {action}
      </header>
      <div className={`min-h-0 flex-1 ${scrollable ? "overflow-y-auto overscroll-contain [scrollbar-width:thin] flow:overflow-visible" : "overflow-visible"}`}>{children}</div>
    </section>
  );
}

/** One quiet line for an empty or loading card. */
export function OverviewNote({ children, role }) {
  return (
    <p role={role} className="text-[13px] text-neutral-500">
      {children}
    </p>
  );
}
