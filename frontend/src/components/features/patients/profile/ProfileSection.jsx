import { Check, X } from "lucide-react";

import { cn } from "../../../../lib/utils";
import { formatDisplayValue } from "../../../../utils/formatters";

/**
 * Flat building blocks for the patient profile: hairline-separated sections,
 * small uppercase labels, label/value rows. No cards, shadows or pills - the
 * page reads as one continuous chart, divided by 1px rules.
 */

export const SECTION_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-sans!";

export function ProfileSection({ id, title, meta, actions, children, className }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("border-t border-slate-200 py-5 first:border-t-0 first:pt-0", className)}
    >
      <header className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={`${id}-title`} className={SECTION_LABEL_CLASS}>
            {title}
          </h2>
          {meta ? <span className="text-xs text-slate-400">{meta}</span> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Quiet text-link action for a section header ("Edit", "Show all"). */
export function TextAction({ children, className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "rounded-sm text-xs font-medium text-[#B91C1C] transition hover:text-[#7F1D1D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40 disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Cancel / Save pair shown in a section header while it is being edited. */
export function SectionEditActions({ saving = false, onCancel, onSave, saveLabel = "Save" }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
      >
        <X size={12} aria-hidden="true" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 text-xs font-semibold text-white transition hover:bg-[#991B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40 focus-visible:ring-offset-1 disabled:bg-red-300"
      >
        <Check size={12} aria-hidden="true" />
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}

/** Label/value rows. Pass `[label, value]` pairs; empty values read "Not recorded". */
export function FieldList({ rows }) {
  return (
    <dl className="grid grid-cols-[minmax(6.5rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => {
        const text = typeof value === "string" || typeof value === "number"
          ? formatDisplayValue(value, "")
          : value;
        return (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="m-0 min-w-0 break-words tabular-nums text-slate-900">
              {text || <span className="text-slate-400">Not recorded</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function EmptyNote({ children }) {
  return <p className="py-2 text-sm text-slate-500">{children}</p>;
}
