/**
 * One card on the Overview board: white, 1px gray border, square corners,
 * no shadow. Dense by default (the stacked side columns); `spacious` gives
 * the centre anatomy card more room. Title row carries an optional meta
 * (count, timestamp) and an action (View all / Edit / a toggle).
 *
 * `maxHeight` is a full Tailwind max-height class (e.g. "max-h-[200px]"),
 * written out literally by the caller so Tailwind can see it. It is a cap,
 * not a height: a short or empty card stays short, a long one stops growing
 * and its body scrolls while the title row (and its action) stay pinned.
 */
export function OverviewCard({ id, title, meta, action, children, spacious = false, maxHeight = "", className = "" }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`flex flex-col border border-gray-200 bg-white ${spacious ? "p-3" : "px-2.5 py-2"} ${maxHeight} ${className}`}
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
      <div
        className={
          maxHeight
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
            : "min-w-0"
        }
      >
        {children}
      </div>
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
