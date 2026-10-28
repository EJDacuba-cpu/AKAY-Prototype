import useFacilityCalendarDate from "../../../hooks/useFacilityCalendarDate";
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalButton, ModalShell } from '../../common';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { getMedicineDetails, medicineGroupAction } from '../../../services/medicineService';
import { expiryGroups, groupExpired, groupLabel } from '../../../utils/medicineExpiryGroups';
import { getFacilityCalendarDate } from '../../../utils/medicineInventoryStatus';
import { queryKeys } from '../../../utils/queryKeys';
import { createIdempotencyKey } from '../../../utils/idempotency';

const labels = { quarantine: 'Quarantine', release: 'Release', quarantine_disposal: 'Dispose' };

export default function MedicineDetailsModal({ open, item, user, onClose }) {
  useFacilityCalendarDate();
  const client = useQueryClient();
  const [action, setAction] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const gate = useRef(false);
  const key = [...queryKeys.medicineTransactions(user, item?.id), 'details', getFacilityCalendarDate()];
  const query = useQuery({ queryKey: key, queryFn: () => getMedicineDetails(item.id), enabled: Boolean(open && item?.id), retry: false });
  if (!open || !item) return null;
  const medicine = query.data;
  const canManage = (user?.permissions || []).includes('inventory.manage');
  const groups = expiryGroups(medicine);
  function begin(group, type) {
    setAction({ group, type, key: createIdempotencyKey() }); setQuantity(''); setReason(''); setError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (gate.current) return;
    const maximum = Number(action.type === 'quarantine' ? action.group.available_quantity : action.group.quarantined_quantity);
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > maximum) { setError(`Enter a whole quantity from 1 to ${maximum}.`); return; }
    if (!reason.trim()) { setError('Enter the reason for this stock movement.'); return; }
    gate.current = true; setPending(true); setError('');
    try {
      await medicineGroupAction(item.id, { action: action.type, expiry_group_id: action.group.id, quantity: Number(quantity), reason: reason.trim() }, { idempotencyKey: action.key });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['medicine-availability'] }),
        client.invalidateQueries({ queryKey: queryKeys.medicineTransactions(user, item.id) }),
      ]);
      toast.success(`${labels[action.type]} recorded.`); setAction(null);
    } catch (failure) { setError(failure.message || 'Unable to record this stock movement. Your entries are retained.'); }
    finally { gate.current = false; setPending(false); }
  }
  return <ModalShell open title="Medicine Details" subtitle={item.name} size="wide" onClose={onClose} closeDisabled={pending} dismissOnBackdrop={!pending} dismissOnEscape={!pending}>
    {query.isLoading ? <p role="status">Loading expiry groups…</p> : query.isError ? <div role="alert"><p>Unable to load medicine details.</p><Button onClick={() => query.refetch()}>Retry</Button></div> : medicine && <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-neutral-500">Category</dt><dd>{medicine.category || '—'}</dd></div><div><dt className="text-neutral-500">Item type</dt><dd>{medicine.itemType === 'health_supply' ? 'Health supply' : 'Medicine'}</dd></div><div className="col-span-2"><dt className="text-neutral-500">Notes</dt><dd>{medicine.notes || '—'}</dd></div></dl>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-5">{['recorded', 'available', 'quarantined', 'expired', 'unassigned'].map(name => <div key={name}><dt className="text-xs capitalize text-neutral-600">{name === 'available' ? 'Eligible available' : name}</dt><dd className="mt-1 font-semibold tabular-nums text-ink-800">{medicine.stockSummary?.[name] ?? 0} <span className="text-xs font-normal">{medicine.unit}</span></dd></div>)}</dl>
      {medicine.reconciliationRequired && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Reconciliation Required. Only complete physical verification can clear this discrepancy.</p>}
      {!groups.length ? <p className="py-4 text-sm text-neutral-600">No expiry groups recorded. Unassigned stock is not eligible for dispensing.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-3 text-left font-semibold">Expiry groups</caption><thead className="border-b text-xs text-neutral-500"><tr><th className="p-2">Expiry</th><th className="p-2">Available pool</th><th className="p-2">Quarantined</th><th className="p-2">State</th>{canManage && <th className="p-2">Actions</th>}</tr></thead><tbody>{groups.map(group => <tr key={group.id} className="border-b border-neutral-100"><td className="p-2 whitespace-nowrap">{groupLabel(group)}</td><td className="p-2 tabular-nums">{group.available_quantity}</td><td className="p-2 tabular-nums">{group.quarantined_quantity}</td><td className="p-2">{groupExpired(group) ? 'Expired · unavailable' : Number(group.available_quantity) ? 'Eligible' : 'No available stock'}</td>{canManage && <td className="p-2"><div className="flex flex-wrap gap-1">{Number(group.available_quantity) > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => begin(group, 'quarantine')}>Quarantine</Button>}{Number(group.quarantined_quantity) > 0 && <>{!groupExpired(group) && <Button size="sm" variant="outline" disabled={pending} onClick={() => begin(group, 'release')}>Release</Button>}<Button size="sm" variant="outline" disabled={pending} onClick={() => begin(group, 'quarantine_disposal')}>Dispose</Button></>}</div></td>}</tr>)}</tbody></table></div>}
      {action && canManage && <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-200 p-4">
        <p className="font-semibold">{labels[action.type]} · {groupLabel(action.group)}</p>
        <p className="text-xs text-neutral-600">{action.type === 'quarantine_disposal' ? 'This reduces quarantined stock and recorded on-hand stock.' : 'This transfers stock between the available and quarantined pools. Recorded stock stays the same.'}</p>
        <label className="block text-sm">Quantity<Input className="mt-1" type="number" min="1" step="1" required value={quantity} disabled={pending} onChange={e => setQuantity(e.target.value)} /></label>
        <label className="block text-sm">Reason<Input className="mt-1" required maxLength={1000} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><ModalButton disabled={pending} onClick={() => setAction(null)}>Cancel</ModalButton><ModalButton type="submit" primary disabled={pending}>{pending ? 'Saving…' : `Confirm ${labels[action.type]}`}</ModalButton></div>
      </form>}
    </div>}
  </ModalShell>;
}
