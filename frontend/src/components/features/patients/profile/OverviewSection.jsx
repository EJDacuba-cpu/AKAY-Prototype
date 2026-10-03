/**
 * A titled block inside the unified Overview board. No card: no border, fill
 * or shadow - sections are separated by spacing and a hairline above every
 * section after the first in its column.
 */
export function OverviewSection({ id, title, meta, action, children, className = "" }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`border-t border-slate-200 pt-4 first:border-t-0 first:pt-0 ${className}`}
    >
      <header className="mb-2.5 flex min-h-5 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
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

/** One quiet line for an empty or loading section. */
export function OverviewNote({ children, role }) {
  return (
    <p role={role} className="text-xs text-slate-500">
      {children}
    </p>
  );
}
