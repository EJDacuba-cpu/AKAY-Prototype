import useFacilityCalendarDate from "../../../hooks/useFacilityCalendarDate";
import { useId } from "react";
import { Input } from "../../ui/input";
import { allocationsMatch, eligibleGroups, groupLabel, previewFefo } from "../../../utils/medicineExpiryGroups";

function fieldClass(invalid) {
  return invalid
    ? "border-alert-700 ring-2 ring-alert-700/15"
    : "border-neutral-200 focus-visible:border-ink-400 focus-visible:ring-ink-400/30";
}

// Preview only. The server locks groups and validates final allocations on save.
export default function MedicineAllocationFields({
  medicine, quantity, value = {}, onChange, disabled = false, error = "",
}) {
  useFacilityCalendarDate();
  const id = useId();
  if (!medicine) return null;
  const groups = eligibleGroups(medicine);
  const manual = Array.isArray(value.allocations);
  const automatic = previewFefo(medicine, quantity);
  const preview = manual
    ? {
        allocations: value.allocations,
        shortage: Math.max(0, Number(quantity || 0) - value.allocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0)),
      }
    : automatic;
  const reasonRequired = manual && !allocationsMatch(value.allocations, automatic.allocations);
  const reasonError = Boolean(error && /reason|explain why/i.test(error));
  const allocationError = Boolean(error && !reasonError);
  function setGroup(groupId, raw) {
    const allocations = value.allocations.filter((a) => Number(a.expiry_group_id) !== Number(groupId));
    if (raw !== "" && Number(raw) !== 0) allocations.push({ expiry_group_id: Number(groupId), quantity: Number(raw) });
    onChange({ ...value, allocations });
  }
  return (
    <div className="space-y-3 border-t border-neutral-200 pt-3 text-sm">
      <label className="flex items-start gap-2 text-sm text-ink-800" htmlFor={`${id}-manual`}>
        <input
          id={`${id}-manual`}
          type="checkbox"
          disabled={disabled}
          checked={manual}
          className="mt-0.5 accent-brand-600"
          onChange={(e) => {
            const next = { ...value };
            if (e.target.checked) {
              next.allocations = previewFefo(medicine, quantity).allocations;
              next.override_reason = "";
            } else {
              delete next.allocations;
              delete next.override_reason;
              delete next.overrideReason;
            }
            onChange(next);
          }}
        />
        Choose stock by expiry date
      </label>
      {!manual && (
        <p className="text-xs leading-relaxed text-neutral-600">
          Stock is taken from the earliest expiry date first. This preview does not reserve stock; quantities are checked when the visit is saved.
        </p>
      )}
      {manual ? (
        <>
          {groups.map((g) => (
            <label key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-800" htmlFor={`${id}-${g.id}`}>
              <span>{groupLabel(g)} · {g.available_quantity} available</span>
              <Input
                id={`${id}-${g.id}`}
                type="number"
                min="0"
                max={g.available_quantity}
                step="1"
                className={`h-9 w-28 shadow-none ${fieldClass(allocationError)}`}
                disabled={disabled}
                aria-invalid={allocationError || undefined}
                value={value.allocations.find((a) => Number(a.expiry_group_id) === Number(g.id))?.quantity ?? ""}
                onChange={(e) => setGroup(g.id, e.target.value)}
              />
            </label>
          ))}
          {!groups.length && <p className="text-xs text-neutral-600">No dated stock is available to dispense.</p>}
          <label htmlFor={`${id}-reason`} className="block text-xs font-semibold text-neutral-600">
            Reason for this stock choice {reasonRequired && <span className="text-alert-700">*</span>}
            <Input
              id={`${id}-reason`}
              className={`mt-1 h-9 shadow-none ${fieldClass(reasonError)}`}
              disabled={disabled}
              aria-invalid={reasonError || undefined}
              aria-describedby={reasonError ? `${id}-reason-error` : `${id}-reason-hint`}
              value={value.override_reason ?? value.overrideReason ?? ""}
              maxLength={1000}
              onChange={(e) => onChange({ ...value, override_reason: e.target.value })}
            />
          </label>
          <p id={`${id}-reason-hint`} className="text-xs text-neutral-600">Why these expiry dates were used instead of the usual order.</p>
        </>
      ) : (
        <ul className="space-y-1 text-xs text-neutral-600">
          {preview.allocations.map((a) => (
            <li key={a.expiry_group_id}>{groupLabel(groups.find((g) => Number(g.id) === a.expiry_group_id))}: {a.quantity} {medicine.unit}</li>
          ))}
        </ul>
      )}
      {preview.recordIssue ? (
        <p role="status" className="text-xs font-medium leading-relaxed text-alert-700">
          Recorded stock is available, but no dated expiry group can be allocated. Refresh inventory or verify expiry dates. This is not a confirmed physical shortage.
        </p>
      ) : preview.shortage > 0 ? (
        <p role="status" className="text-xs font-medium leading-relaxed text-alert-700">
          Shortage: {preview.shortage} {medicine.unit} cannot come from recorded stock. Confirm only what was actually given. This will be recorded for later verification.
        </p>
      ) : null}
      {error && (
        <p id={reasonError ? `${id}-reason-error` : undefined} role="alert" className="text-xs font-medium text-alert-700">
          {error}
        </p>
      )}
    </div>
  );
}
