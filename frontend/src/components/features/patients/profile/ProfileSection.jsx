import { Check, X } from "lucide-react";

import { cn } from "../../../../lib/utils";
import { formatDisplayValue } from "../../../../utils/formatters";

/**
 * Building blocks for the patient profile: each section is its own card
 * (the `rounded-card` / `shadow-card` tokens: 12px corners, soft border,
 * faint offset shadow), stacked with a consistent gap. Sentence-case
 * semibold titles, label/value rows inside.
 */

export const SECTION_LABEL_CLASS =
  "text-sm font-semibold text-neutral-900 font-sans!";

export function ProfileSection({ id, title, meta, actions, children, className }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "mb-3 rounded-card border border-neutral-200/80 bg-white p-5 shadow-card last:mb-0",
        className,
      )}
    >
      <header className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={`${id}-title`} className={SECTION_LABEL_CLASS}>
            {title}
          </h2>
          {meta ? <span className="text-xs tabular-nums text-neutral-500">{meta}</span> : null}
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
        "rounded-md text-[13px] font-medium text-ink-600 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 disabled:cursor-not-allowed disabled:text-neutral-300",
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
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 disabled:opacity-50"
      >
        <X size={12} aria-hidden="true" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-ink-700 px-3 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-1 disabled:bg-ink-300"
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
    <dl className="grid grid-cols-[minmax(6.5rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
      {rows.map(([label, value]) => {
        const text = typeof value === "string" || typeof value === "number"
          ? formatDisplayValue(value, "")
          : value;
        return (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="m-0 min-w-0 break-words tabular-nums text-neutral-900">
              {text || <span className="text-neutral-400">Not recorded</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function EmptyNote({ children }) {
  return <p className="py-2 text-sm text-neutral-500">{children}</p>;
}
