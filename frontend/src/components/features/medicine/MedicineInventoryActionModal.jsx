import { useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ModalButton, ModalShell } from '../../common';
import { Input } from '../../ui/input';
import { DatePickerField } from '../../common/forms/DatePickerField';
import { createIdempotencyKey } from '../../../utils/idempotency';
import { batchIdLabel, groupLabel, matchingRestockBatches } from '../../../utils/medicineExpiryGroups';
import { actionGroups, validateStockAction } from '../../../utils/medicineLedger';
import { formatStockQuantity } from '../../../utils/medicineInventoryPreview';

export const STOCK_ACTION_LABELS = { restock: 'Restock', deduct: 'Deduct Stock', quarantine: 'Quarantine Stock', release: 'Release Stock', quarantine_disposal: 'Dispose Stock' };
const descriptions = {
  restock: 'Record received stock as a new stock batch by default. Add to an existing batch only when you explicitly confirm a verified lot match.',
  deduct: 'Record removal from stock outside quarantine.',
  quarantine: 'Move selected stock into quarantine. Stock stays recorded until it is disposed.',
  release: 'Return quarantined stock to the available pool. Stock stays recorded; expired stock cannot be released.',
  quarantine_disposal: 'Record disposal of quarantined stock. Stock stays recorded until this disposal is confirmed.',
};
const fieldClass = 'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 disabled:bg-neutral-100';

// One mounted form per action; refetches never reset entries or its operation key.
export default function MedicineInventoryActionModal({ open, mode, item, initialGroupId = '', onClose, onSubmit }) {
  const [form, setForm] = useState({
    expiryDate: '',
    expiryNotApplicable: false,
    manufacturerLotNumber: '',
    restockExisting: false,
    restock_expiry_group_id: '',
    expiry_group_id: String(initialGroupId),
    quantity: '',
    reason: '',
  });
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
  const matches = restock ? matchingRestockBatches(item, form) : [];
  const quarantinedPool = mode === 'release' || mode === 'quarantine_disposal';
  const maximum = group ? Number(quarantinedPool ? group.quarantined_quantity : group.available_quantity) : 2147483647;
  function update(field, value) {
    setForm(current => {
      const next = { ...current, [field]: value };
      if (['expiryDate', 'expiryNotApplicable', 'manufacturerLotNumber'].includes(field)) {
        next.restockExisting = false;
        next.restock_expiry_group_id = '';
      }
      return next;
    });
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
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        expiry_group_id: Number(form.expiry_group_id),
        reason: form.reason.trim(),
        manufacturerLotNumber: form.manufacturerLotNumber.trim(),
      };
      if (restock && form.restockExisting && form.restock_expiry_group_id) {
        payload.restock_expiry_group_id = Number(form.restock_expiry_group_id);
      }
      await onSubmit(payload, { idempotencyKey: operationKey });
    } catch (failure) {
      setError(failure?.message || 'Unable to record this movement. Review the current stock and try again.');
    } finally { gate.current = false; setPending(false); }
  }
  return <ModalShell open title={title} subtitle={item.name} size="lg" onClose={onClose} closeDisabled={pending} dismissOnBackdrop={!pending} dismissOnEscape={!pending}
    footer={<><ModalButton onClick={onClose} disabled={pending}>Cancel</ModalButton><ModalButton type="submit" form={id} primary disabled={pending || (!restock && !groups.length)}>{pending && <LoaderCircle size={14} className="animate-spin" />}{pending ? 'Saving…' : `Confirm ${title}`}</ModalButton></>}>
    <form id={id} onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-neutral-600">{descriptions[mode]}</p>
      <p className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm text-ink-800">Recorded Stock: <strong className="tabular-nums">{formatStockQuantity(item.quantity, item.unit)}</strong></p>
      {restock ? <div className="space-y-3">
        <p className="text-xs text-neutral-600">Default action creates a new stock batch. Batch ID is assigned after save.</p>
        <div className="space-y-2">
          <label htmlFor={`${id}-lot`} className="block text-xs font-semibold text-neutral-600">Manufacturer Lot Number <span className="font-normal">(optional)</span></label>
          <Input id={`${id}-lot`} value={form.manufacturerLotNumber} disabled={pending} maxLength={120} onChange={e => update('manufacturerLotNumber', e.target.value)} />
        </div>
        <DatePickerField
          label="Received Stock Expiry"
          name={`${id}-expiry`}
          value={form.expiryDate}
          disabled={pending || form.expiryNotApplicable}
          error={errors.expiryDate}
          allowClear
          onChange={(value) => update('expiryDate', value)}
        />
        {item.itemType === 'health_supply' && <label className="flex items-start gap-2 text-xs text-neutral-600"><input type="checkbox" className="mt-0.5 accent-brand-600" checked={form.expiryNotApplicable} disabled={pending} onChange={e => { update('expiryNotApplicable', e.target.checked); update('expiryDate', ''); }} />Not Applicable — no manufacturer-defined expiry</label>}
        {matches.length > 0 && (
          <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <label className="flex items-start gap-2 text-xs text-ink-800">
              <input
                type="checkbox"
                className="mt-0.5 accent-brand-600"
                checked={form.restockExisting}
                disabled={pending}
                onChange={(e) => {
                  const checked = e.target.checked;
                  update('restockExisting', checked);
                  update('restock_expiry_group_id', checked ? String(matches[0].id) : '');
                }}
              />
              Add to an existing verified stock batch instead of creating a new batch
            </label>
            {form.restockExisting && (
              <select
                className={fieldClass}
                value={form.restock_expiry_group_id}
                disabled={pending}
                onChange={(e) => update('restock_expiry_group_id', e.target.value)}
              >
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>{batchIdLabel(match)} · {groupLabel(match)} · {match.available_quantity} available</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div> : <div className="space-y-2">
        <label htmlFor={`${id}-group`} className="block text-xs font-semibold text-neutral-600">Stock Batch</label>
        <select id={`${id}-group`} required className={fieldClass} value={form.expiry_group_id} disabled={pending || Boolean(initialGroupId)} aria-invalid={Boolean(errors.expiry_group_id)} aria-describedby={`${id}-group-note`} onChange={e => update('expiry_group_id', e.target.value)}>
          <option value="">Select a stock batch</option>{groups.map(g => <option key={g.id} value={g.id}>{groupLabel(g)} · {quarantinedPool ? g.quarantined_quantity : g.available_quantity} {quarantinedPool ? 'quarantined' : 'outside quarantine'}</option>)}
        </select>
        <p id={`${id}-group-note`} className="text-xs text-neutral-600">{group ? `${maximum.toLocaleString()} ${item.unit || 'units'} ${quarantinedPool ? 'in quarantine' : 'outside quarantine'}.` : groups.length ? 'Choose the batch physically involved in this movement.' : 'No stock batches are available for this action.'}</p>
        {errors.expiry_group_id && <p role="alert" className="text-xs text-alert-700">{errors.expiry_group_id}</p>}
      </div>}
      <div className="space-y-2"><label htmlFor={`${id}-quantity`} className="block text-xs font-semibold text-neutral-600">Quantity ({item.unit || 'units'})</label><Input id={`${id}-quantity`} type="number" min="1" max={maximum} step="1" required value={form.quantity} disabled={pending} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined} onChange={e => update('quantity', e.target.value)} />{errors.quantity && <p id={`${id}-quantity-error`} role="alert" className="text-xs text-alert-700">{errors.quantity}</p>}</div>
      <div className="space-y-2"><label htmlFor={`${id}-reason`} className="block text-xs font-semibold text-neutral-600">Reason</label><textarea id={`${id}-reason`} required maxLength={1000} rows={3} value={form.reason} disabled={pending} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} onChange={e => update('reason', e.target.value)} className={`${fieldClass} h-auto resize-y py-2.5`} />{errors.reason && <p id={`${id}-reason-error`} role="alert" className="text-xs text-alert-700">{errors.reason}</p>}</div>
      {error && <p role="alert" className="rounded-lg bg-alert-50 p-3 text-sm text-alert-700">{error}</p>}
    </form>
  </ModalShell>;
}
