import { PERMISSION_CATALOG, PERMISSION_GROUPS } from "../../../utils/actionPermissions";
import { AccessChip } from "./AccessChips";
import { FieldMessage } from "./FieldError";

export const ACCOUNT_CONFIRMATION = "I have reviewed all access listed above and authorize this account to perform them.";
export const ASSIGNMENT_CONFIRMATION = "I have reviewed all duties listed above and authorize this assignment.";

/** Pre-save review: the details, every duty grouped by module, and the one confirmation saving requires. `review` is optional (admin accounts). */
export default function PermissionReviewSummary({ review, details = [], confirmed, onConfirm, confirmationLabel = ACCOUNT_CONFIRMATION, error }) {
  const groups = review
    ? PERMISSION_GROUPS
      .map(group => ({
        ...group,
        rows: review.rows.filter(row => row.group === group.key),
        removed: review.removed.filter(key => PERMISSION_CATALOG[key]?.group === group.key),
      }))
      .filter(group => group.rows.length || group.removed.length)
    : [];

  return (
    <div className="space-y-5">
      {details.length > 0 && (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {review && (
        <section aria-labelledby="review-permissions-title">
          <h2 id="review-permissions-title" className="text-sm font-semibold text-slate-900">Access ({review.rows.length})</h2>
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {groups.map(group => (
              <div key={group.key} className="p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                <ul className="mt-1.5 space-y-1">
                  {group.rows.map(row => (
                    <li key={row.key} className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="text-slate-800">{row.label}</span>
                      {row.added && <AccessChip kind="added" />}
                      {row.licensed && <AccessChip kind="licensed" />}
                    </li>
                  ))}
                  {group.removed.map(key => (
                    <li key={key} className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
                      <span className="line-through">{PERMISSION_CATALOG[key]?.label || key}</span>
                      <AccessChip kind="removed" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!groups.length && <p className="p-3 text-sm text-slate-500">No access selected.</p>}
          </div>
        </section>
      )}

      <div>
        <label className={`flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm ${error ? "ring-1 ring-red-500" : ""}`}>
          <input type="checkbox" className="mt-0.5" checked={Boolean(confirmed)} aria-invalid={error ? true : undefined} onChange={event => onConfirm(event.target.checked)} />
          <span>{confirmationLabel}</span>
        </label>
        <FieldMessage>{error}</FieldMessage>
      </div>
    </div>
  );
}
