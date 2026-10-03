/**
 * One compact card on the Overview board: white, 1px gray border, square
 * corners, no shadow, tight padding. Title row carries an optional meta
 * (count, timestamp) and an action (View all / Edit / a toggle).
 */
export function OverviewCard({ id, title, meta, action, children, className = "" }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`border border-gray-200 bg-white p-3 ${className}`}
    >
      <header className="mb-2 flex min-h-5 items-center justify-between gap-3">
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
      {children}
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
