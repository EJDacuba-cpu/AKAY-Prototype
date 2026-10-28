import { useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ModalButton, ModalShell } from '../../common';
import { Input } from '../../ui/input';
import { createIdempotencyKey } from '../../../utils/idempotency';
import { groupLabel } from '../../../utils/medicineExpiryGroups';
import { actionGroups, validateStockAction } from '../../../utils/medicineLedger';
import { formatStockQuantity } from '../../../utils/medicineInventoryPreview';

export const STOCK_ACTION_LABELS = { restock: 'Restock', deduct: 'Deduct Stock', quarantine: 'Quarantine Stock', release: 'Release Stock', quarantine_disposal: 'Dispose Stock' };
const descriptions = {
  restock: 'Record received stock in its expiry group.',
  deduct: 'Record removal from stock outside quarantine.',
  quarantine: 'Move selected stock into quarantine. Stock stays recorded until it is disposed.',
  release: 'Return quarantined stock to the available pool. Stock stays recorded; expired stock cannot be released.',
  quarantine_disposal: 'Record disposal of quarantined stock. Stock stays recorded until this disposal is confirmed.',
};
const fieldClass = 'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 disabled:bg-neutral-100';

// One mounted form per action; refetches never reset entries or its operation key.
export default function MedicineInventoryActionModal({ open, mode, item, initialGroupId = '', onClose, onSubmit }) {
  const [form, setForm] = useState({ expiryDate: '', expiryNotApplicable: false, expiry_group_id: String(initialGroupId), quantity: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [operationKey] = useState(createIdempotencyKey);
  const gate = useRef(false);
  const id = useId();
  if (!open || !item) return null;
  const title = STOCK_ACTION_LABELS[mode];
  const restock = mode === 'restock';
  const groups = actionGroups(item, mode);
  const group = groups.find(g => String(g.id) === form.expiry_group_id);
  const quarantinedPool = mode === 'release' || mode === 'quarantine_disposal';
  const maximum = group ? Number(quarantinedPool ? group.quarantined_quantity : group.available_quantity) : 2147483647;
  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: '' }));
    setError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (gate.current) return;
    const issues = validateStockAction(mode, item, form);
    setErrors(issues);
    if (Object.keys(issues).length) return;
    gate.current = true; setPending(true); setError('');
    try {
      await onSubmit({ ...form, quantity: Number(form.quantity), expiry_group_id: Number(form.expiry_group_id), reason: form.reason.trim() }, { idempotencyKey: operationKey });
    } catch (failure) {
      setError(failure?.message || 'Unable to record this movement. Review the current stock and try again.');
    } finally { gate.current = false; setPending(false); }
  }
  return <ModalShell open title={title} subtitle={item.name} size="lg" onClose={onClose} closeDisabled={pending} dismissOnBackdrop={!pending} dismissOnEscape={!pending}
    footer={<><ModalButton onClick={onClose} disabled={pending}>Cancel</ModalButton><ModalButton type="submit" form={id} primary disabled={pending || (!restock && !groups.length)}>{pending && <LoaderCircle size={14} className="animate-spin" />}{pending ? 'Saving…' : `Confirm ${title}`}</ModalButton></>}>
    <form id={id} onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-neutral-600">{descriptions[mode]}</p>
      <p className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm text-ink-800">Recorded Stock: <strong className="tabular-nums">{formatStockQuantity(item.quantity, item.unit)}</strong></p>
      {restock ? <div className="space-y-2">
        <label htmlFor={`${id}-expiry`} className="block text-xs font-semibold text-neutral-600">Received Stock Expiry</label>
        <Input id={`${id}-expiry`} type="date" value={form.expiryDate} disabled={pending || form.expiryNotApplicable} aria-invalid={Boolean(errors.expiryDate)} aria-describedby={errors.expiryDate ? `${id}-expiry-error` : undefined} onChange={e => update('expiryDate', e.target.value)} />
        {item.itemType === 'health_supply' && <label className="flex items-start gap-2 text-xs text-neutral-600"><input type="checkbox" className="mt-0.5 accent-brand-600" checked={form.expiryNotApplicable} disabled={pending} onChange={e => { update('expiryNotApplicable', e.target.checked); update('expiryDate', ''); }} />Not Applicable — no manufacturer-defined expiry</label>}
        {errors.expiryDate && <p id={`${id}-expiry-error`} role="alert" className="text-xs text-alert-700">{errors.expiryDate}</p>}
      </div> : <div className="space-y-2">
        <label htmlFor={`${id}-group`} className="block text-xs font-semibold text-neutral-600">Expiry Group</label>
        <select id={`${id}-group`} required className={fieldClass} value={form.expiry_group_id} disabled={pending || Boolean(initialGroupId)} aria-invalid={Boolean(errors.expiry_group_id)} aria-describedby={`${id}-group-note`} onChange={e => update('expiry_group_id', e.target.value)}>
          <option value="">Select an expiry group</option>{groups.map(g => <option key={g.id} value={g.id}>{groupLabel(g)} · {quarantinedPool ? g.quarantined_quantity : g.available_quantity} {quarantinedPool ? 'quarantined' : 'outside quarantine'}</option>)}
        </select>
        <p id={`${id}-group-note`} className="text-xs text-neutral-600">{group ? `${maximum.toLocaleString()} ${item.unit || 'units'} ${quarantinedPool ? 'in quarantine' : 'outside quarantine'}.` : groups.length ? 'Choose the group physically involved in this movement.' : 'No stock groups are available for this action.'}</p>
        {errors.expiry_group_id && <p role="alert" className="text-xs text-alert-700">{errors.expiry_group_id}</p>}
      </div>}
      <div className="space-y-2"><label htmlFor={`${id}-quantity`} className="block text-xs font-semibold text-neutral-600">Quantity ({item.unit || 'units'})</label><Input id={`${id}-quantity`} type="number" min="1" max={maximum} step="1" required value={form.quantity} disabled={pending} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined} onChange={e => update('quantity', e.target.value)} />{errors.quantity && <p id={`${id}-quantity-error`} role="alert" className="text-xs text-alert-700">{errors.quantity}</p>}</div>
      <div className="space-y-2"><label htmlFor={`${id}-reason`} className="block text-xs font-semibold text-neutral-600">Reason</label><textarea id={`${id}-reason`} required maxLength={1000} rows={3} value={form.reason} disabled={pending} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} onChange={e => update('reason', e.target.value)} className={`${fieldClass} h-auto resize-y py-2.5`} />{errors.reason && <p id={`${id}-reason-error`} role="alert" className="text-xs text-alert-700">{errors.reason}</p>}</div>
      {error && <p role="alert" className="rounded-lg bg-alert-50 p-3 text-sm text-alert-700">{error}</p>}
    </form>
  </ModalShell>;
}
