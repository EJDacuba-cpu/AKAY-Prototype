import useFacilityCalendarDate from "../../../hooks/useFacilityCalendarDate";
import { useId } from 'react';
import { Input } from '../../ui/input';
import { eligibleGroups, groupLabel, previewFefo } from '../../../utils/medicineExpiryGroups';

// Preview only. The server locks groups and validates final allocations on save.
export default function MedicineAllocationFields({ medicine, quantity, value = {}, onChange, disabled = false }) {
  useFacilityCalendarDate();
  const id = useId();
  if (!medicine) return null;
  const groups = eligibleGroups(medicine);
  const manual = Array.isArray(value.allocations);
  const preview = manual ? { allocations: value.allocations, shortage: Math.max(0, Number(quantity || 0) - value.allocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0)) } : previewFefo(medicine, quantity);
  function setGroup(groupId, raw) {
    const allocations = value.allocations.filter(a => Number(a.expiry_group_id) !== Number(groupId));
    if (raw !== '' && Number(raw) !== 0) allocations.push({ expiry_group_id: Number(groupId), quantity: Number(raw) });
    onChange({ ...value, allocations });
  }
  return <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
    <label className="flex items-center gap-2 font-medium" htmlFor={`${id}-manual`}>
      <input id={`${id}-manual`} type="checkbox" disabled={disabled} checked={manual} onChange={e => {
        const next = { ...value };
        if (e.target.checked) { next.allocations = previewFefo(medicine, quantity).allocations; next.override_reason = ''; }
        else { delete next.allocations; delete next.override_reason; delete next.overrideReason; }
        onChange(next);
      }} />Choose actual expiry groups manually
    </label>
    {!manual && <p className="text-xs text-neutral-600">Automatic FEFO: earliest eligible expiry first. Final quantities are checked when saved; this preview does not reserve stock.</p>}
    {manual ? <>
      {groups.map(g => <label key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-xs" htmlFor={`${id}-${g.id}`}>
        <span>{groupLabel(g)} · {g.available_quantity} available</span>
        <Input id={`${id}-${g.id}`} type="number" min="0" max={g.available_quantity} step="1" className="w-28" disabled={disabled}
          value={value.allocations.find(a => Number(a.expiry_group_id) === Number(g.id))?.quantity ?? ''} onChange={e => setGroup(g.id, e.target.value)} />
      </label>)}
      {!groups.length && <p className="text-xs text-neutral-600">No eligible recorded groups.</p>}
      <label htmlFor={`${id}-reason`} className="block text-xs">Override reason (required)
        <Input id={`${id}-reason`} className="mt-1" disabled={disabled} value={value.override_reason ?? value.overrideReason ?? ''} maxLength={1000} onChange={e => onChange({ ...value, override_reason: e.target.value })} />
      </label>
    </> : <ul className="space-y-1 text-xs text-neutral-600">{preview.allocations.map(a => <li key={a.expiry_group_id}>{groupLabel(groups.find(g => Number(g.id) === a.expiry_group_id))}: {a.quantity} {medicine.unit}</li>)}</ul>}
    {preview.shortage > 0 && <p className="text-xs font-medium text-amber-800">Unallocated actual dispensing: {preview.shortage} {medicine.unit}. Confirm only what was actually given; this records a shortage requiring reconciliation.</p>}
  </div>;
}
