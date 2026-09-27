import { Check, X } from "lucide-react";

import { cn } from "../../../../lib/utils";
import { formatDisplayValue } from "../../../../utils/formatters";

/**
 * Building blocks for the patient profile: each section is its own card
 * (reusing the same `rounded-card` / `shadow-card` tokens as RecordTabs and
 * the rest of the AKAY design system - square corners, hairline border, no
 * real shadow), stacked with a consistent gap. Small uppercase labels,
 * label/value rows inside.
 */

export const SECTION_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-gray-600 font-sans!";

export function ProfileSection({ id, title, meta, actions, children, className }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "mb-4 rounded-card border border-[#E5E7EB] bg-white p-5 shadow-card last:mb-0",
        className,
      )}
    >
      <header className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={`${id}-title`} className={SECTION_LABEL_CLASS}>
            {title}
          </h2>
          {meta ? <span className="text-xs text-gray-400">{meta}</span> : null}
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
        "rounded-sm text-xs font-medium text-red-600 transition hover:text-red-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline",
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
        className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-gray-500 transition hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
      >
        <X size={12} aria-hidden="true" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-7 items-center gap-1 rounded-none bg-red-600 px-2.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 focus-visible:ring-offset-1 disabled:bg-red-300"
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
            <dt className="text-gray-500">{label}</dt>
            <dd className="m-0 min-w-0 break-words tabular-nums text-gray-900">
              {text || <span className="text-gray-400">Not recorded</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function EmptyNote({ children }) {
  return <p className="py-2 text-sm text-gray-500">{children}</p>;
}
