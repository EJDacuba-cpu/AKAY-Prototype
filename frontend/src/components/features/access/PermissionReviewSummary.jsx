import { ShieldAlert, TriangleAlert } from "lucide-react";
import { PERMISSION_CATALOG, PERMISSION_GROUPS } from "../../../utils/actionPermissions";
import { SourceChip, TierChip } from "./AccessChips";

export function requiredConfirmations(review) {
  return ["reviewed", ...(review.requiresAcknowledgement ? ["overrides"] : []), ...(review.hasCritical ? ["critical"] : [])];
}

export function confirmationsComplete(review, confirmations) {
  return requiredConfirmations(review).every(key => confirmations[key]);
}

const CALLOUT_TONES = {
  critical: "border-red-200 bg-red-50 text-red-900",
  sensitive: "border-amber-200 bg-amber-50 text-amber-900",
  override: "border-slate-200 bg-white text-slate-800",
};

function Callout({ tone, icon: Icon, title, rows }) {
  return (
    <section className={`rounded-lg border p-3 ${CALLOUT_TONES[tone]}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {Icon && <Icon size={15} aria-hidden="true" />}
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs">
        {rows.map(row => (
          <li key={row.key}>
            <strong>{row.label}</strong> ({row.key}): {row.note}{row.facilityNote ? ` ${row.facilityNote}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Confirm({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Pre-save review: every duty grouped by module, overrides flagged by tier, and the confirmations saving requires. */
export default function PermissionReviewSummary({ review, name, details = [], confirmations, onConfirm }) {
  const who = name?.trim() || "this staff member";
  const groups = PERMISSION_GROUPS
    .map(group => ({
      ...group,
      rows: review.rows.filter(row => row.group === group.key),
      removed: review.removed.filter(key => PERMISSION_CATALOG[key]?.group === group.key),
    }))
    .filter(group => group.rows.length || group.removed.length);
  const otherOverrides = review.overrides.filter(row => row.tier === "override");
  const overrideCount = review.overrides.length;

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

      <section aria-labelledby="review-permissions-title">
        <h2 id="review-permissions-title" className="text-sm font-semibold text-slate-900">Permissions ({review.rows.length})</h2>
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {groups.map(group => (
            <div key={group.key} className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
              <ul className="mt-1.5 space-y-1">
                {group.rows.map(row => (
                  <li key={row.key} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-slate-800">{row.label}</span>
                    <code className="text-[11px] text-slate-400">{row.key}</code>
                    {row.tier ? <TierChip tier={row.tier} /> : <SourceChip source={row.source} />}
                    {row.added && <SourceChip source="new" />}
                  </li>
                ))}
                {group.removed.map(key => (
                  <li key={key} className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
                    <span className="line-through">{PERMISSION_CATALOG[key]?.label || key}</span>
                    <code className="text-[11px]">{key}</code>
                    <SourceChip source="removed" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!groups.length && <p className="p-3 text-sm text-slate-500">No permissions selected.</p>}
        </div>
      </section>

      {review.critical.length > 0 && (
        <Callout tone="critical" icon={ShieldAlert} title="Licensed clinical acts outside a clinical designation" rows={review.critical} />
      )}
      {review.sensitive.length > 0 && <Callout tone="sensitive" icon={TriangleAlert} title="Sensitive access" rows={review.sensitive} />}
      {otherOverrides.length > 0 && <Callout tone="override" title="Other overrides" rows={otherOverrides} />}

      <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
        <Confirm checked={confirmations.reviewed} onChange={value => onConfirm("reviewed", value)}>
          I have reviewed and confirm these permissions for {who}.
        </Confirm>
        {review.requiresAcknowledgement && (
          <Confirm checked={confirmations.overrides} onChange={value => onConfirm("overrides", value)}>
            I authorize the {overrideCount} override{overrideCount === 1 ? "" : "s"} above for {who}.
          </Confirm>
        )}
        {review.hasCritical && (
          <Confirm checked={confirmations.critical} onChange={value => onConfirm("critical", value)}>
            <span className="font-semibold text-red-800">
              I confirm {who} may perform licensed clinical acts without a Midwife, Nurse, or Doctor designation.
            </span>
          </Confirm>
        )}
      </div>
    </div>
  );
}
