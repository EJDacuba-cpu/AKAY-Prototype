import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit3, PackageMinus, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ConfirmationModal, PageStateWrapper } from '../../components/common';
import { Button } from '../../components/ui/button';
import MedicineFormModal from '../../components/features/medicine/MedicineFormModal';
import MedicineActionDialog from '../../components/features/medicine/MedicineActionDialog';
import MedicineInventoryHistory from '../../components/features/medicine/MedicineInventoryHistory';
import { LedgerStamp } from '../../components/features/medicine/MedicineInventoryTable';
import { getMedicineDetails, updateBhcMedicine, updateRhuMedicine, deleteBhcMedicine, deleteRhuMedicine } from '../../services/medicineService';
import { getCurrentUser } from '../../utils/auth';
import { inventoryPath, medicineDetailsKey, orderedExpiryGroups, groupActions, ledgerQuantity, retainCalendarData } from '../../utils/medicineLedger';
import { groupExpired, groupLabel } from '../../utils/medicineExpiryGroups';
import { queryKeys } from '../../utils/queryKeys';
import useFacilityCalendarDate from '../../hooks/useFacilityCalendarDate';

const groupLabels = { quarantine: 'Quarantine', release: 'Release', quarantine_disposal: 'Dispose' };
function GroupButtons({ group, canManage, active, onAction }) {
  return <div className="flex flex-wrap gap-1.5">{groupActions(group, canManage, active).map(mode => <Button key={mode} variant="secondary" size="compact" onClick={() => onAction?.(mode, group.id)}>{groupLabels[mode]}</Button>)}</div>;
}
function GroupState({ group }) {
  const expired = groupExpired(group);
  const label = expired ? 'Expired' : Number(group.available_quantity) > 0 ? 'Ready to Dispense' : Number(group.quarantined_quantity) > 0 ? 'In Quarantine' : 'No Stock';
  return <LedgerStamp label={label} tone={expired ? 'danger' : Number(group.available_quantity) > 0 ? 'info' : 'neutral'} />;
}
export function MedicineDetailsContent({ medicine, role, canManage, onAction, onEdit, onRemove, history }) {
  const groups = orderedExpiryGroups(medicine);
  const { recorded, available } = ledgerQuantity(medicine);
  const summary = medicine.stockSummary || medicine.stock_summary || {};
  const counts = [['Recorded Stock', recorded], ['Available for Dispensing', available], ['Quarantined Stock', summary.quarantined ?? 0], ['Expired Stock', summary.expired ?? 0], ['Unassigned Stock', summary.unassigned ?? 0]];
  const active = medicine.is_active !== false;
  return <div className="space-y-5">
    <Link to={inventoryPath(role)} className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-neutral-600 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"><ArrowLeft size={14} />Back to Health Commodities</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h1 className="break-words text-xl font-bold tracking-tight text-ink-800">{medicine.name}</h1><p className="mt-1 text-xs text-neutral-600">Item <span className="tabular-nums">{medicine.id}</span> · {medicine.itemType === 'health_supply' ? 'Health Supply' : 'Medicine'} · {medicine.category || 'Uncategorized'}{!active && ' · Archived'}</p></div>
      {canManage && <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={onEdit}><Edit3 size={14} />Edit Details</Button><Button variant="secondary" size="sm" onClick={() => onAction?.('deduct')}><PackageMinus size={14} />Deduct Stock</Button><Button variant="brand" size="sm" disabled={!active} onClick={() => onAction?.('restock')}><PackagePlus size={14} />Restock</Button></div>}
    </div>
    {medicine.reconciliationRequired && <p role="status" className="text-sm leading-relaxed text-ink-800"><LedgerStamp label="Reconciliation Required" tone="warning" /><span className="mt-2 block">A dispensing shortage is still recorded. Complete physical verification is required to clear it.</span></p>}
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-labelledby="medicine-summary-title"><h2 id="medicine-summary-title" className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-ink-800">Stock Summary</h2><dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 lg:grid-cols-5">{counts.map(([label, quantity]) => <div key={label}><dt className="text-xs text-neutral-600">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-ink-800">{Number(quantity).toLocaleString()} <span className="font-normal text-neutral-600">{medicine.unit}</span></dd></div>)}</dl><dl className="grid gap-4 border-t border-neutral-200 p-4 sm:grid-cols-2"><div><dt className="text-xs text-neutral-600">Low Stock Threshold</dt><dd className="mt-1 text-sm tabular-nums text-ink-800">{medicine.lowStockThreshold ?? 10} {medicine.unit}</dd></div><div><dt className="text-xs text-neutral-600">Notes</dt><dd className="mt-1 break-words text-sm text-ink-800">{medicine.notes || 'No notes recorded.'}</dd></div></dl></section>
    <section id="expiry-groups" className="scroll-mt-24 overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-labelledby="medicine-groups-title"><div className="border-b border-neutral-200 p-4"><h2 id="medicine-groups-title" className="text-sm font-semibold text-ink-800">Expiry Groups</h2><p className="mt-1 text-xs text-neutral-600">Earliest expiry first (FEFO). Expired and quarantined stock cannot be dispensed.</p></div>
      {!groups.length ? <p className="p-6 text-sm text-neutral-600">No expiry groups recorded. Unassigned stock is not available for dispensing.</p> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-xs"><thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600"><tr><th className="px-4">Expiry Date</th><th className="px-3 text-right">Available to Dispense</th><th className="px-3 text-right">Quarantined</th><th className="px-3">Status</th>{canManage && <th className="px-4">Group Actions</th>}</tr></thead><tbody className="divide-y divide-neutral-100">{groups.map(group => <tr key={group.id} className="h-14 hover:bg-neutral-50"><td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-ink-800">{groupLabel(group)}</td><td className="px-3 py-3 text-right tabular-nums text-ink-800">{groupExpired(group) ? 0 : group.available_quantity}{groupExpired(group) && Number(group.available_quantity) > 0 && <p className="mt-1 text-[11px] text-alert-700">{group.available_quantity} expired</p>}</td><td className="px-3 py-3 text-right tabular-nums text-ink-800">{group.quarantined_quantity}</td><td className="px-3 py-3"><GroupState group={group} /></td>{canManage && <td className="px-4 py-3"><GroupButtons group={group} canManage={canManage} active={active} onAction={onAction} /></td>}</tr>)}</tbody></table></div>
        <div className="divide-y divide-neutral-100 md:hidden">{groups.map(group => <article key={group.id} className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold tabular-nums text-ink-800">{groupLabel(group)}</h3><GroupState group={group} /></div><p className="text-xs tabular-nums text-neutral-600">{groupExpired(group) ? `${group.available_quantity} expired outside quarantine` : `${group.available_quantity} available to dispense`} · {group.quarantined_quantity} quarantined</p><GroupButtons group={group} canManage={canManage} active={active} onAction={onAction} /></article>)}</div>
      </>}
    </section>
    {history}
    {canManage && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4" aria-labelledby="medicine-management-title"><div><h2 id="medicine-management-title" className="text-sm font-semibold text-ink-800">Item Management</h2><p className="mt-1 max-w-xl text-xs leading-relaxed text-neutral-600">Remove an item from active inventory. Items with stock or history are archived; unused zero-stock items may be permanently deleted.</p></div><Button variant="secondary" size="sm" className="text-alert-700" disabled={!active} onClick={onRemove}>Remove Item</Button></section>}
  </div>;
}

function MedicineDetailsRoute({ role, medicineId }) {
  useFacilityCalendarDate();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const user = getCurrentUser();
  const canManage = (user?.permissions || []).includes('inventory.manage');
  const [dialog, setDialog] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const gate = useRef(false);
  const focusedHistory = useRef('');
  const detailsKey = medicineDetailsKey(user, medicineId);
  const query = useQuery({ queryKey: detailsKey, queryFn: () => getMedicineDetails(medicineId), placeholderData: (data, previous) => retainCalendarData(data, previous, detailsKey), retry: false });
  useEffect(() => {
    if (query.data && location.hash === '#history' && focusedHistory.current !== location.key) {
      const section = document.getElementById('history');
      section?.scrollIntoView({ block: 'start' });
      section?.focus({ preventScroll: true });
      focusedHistory.current = location.key;
    }
  }, [medicineId, location.hash, location.key, query.data]);
  async function edit(payload, options) {
    const update = role === 'rhu' ? updateRhuMedicine : updateBhcMedicine;
    await update(medicineId, payload, options);
    await Promise.all([client.invalidateQueries({ queryKey: medicineDetailsKey(user, medicineId) }), client.invalidateQueries({ queryKey: queryKeys.medicineAvailability(role, user) })]);
    setDialog(null); toast.success('Medicine details updated.');
  }
  async function remove() {
    if (gate.current || !canManage) return;
    gate.current = true; setRemoving(true); setRemoveError('');
    try {
      await (role === 'rhu' ? deleteRhuMedicine : deleteBhcMedicine)(medicineId);
      await client.invalidateQueries({ queryKey: queryKeys.medicineAvailability(role, user) });
      client.removeQueries({ queryKey: queryKeys.medicineTransactions(user, medicineId) });
      toast.success('Item removed from active inventory.'); navigate(inventoryPath(role));
    } catch (failure) { setRemoveError(failure.message || 'Unable to remove this item.'); setDialog(null); }
    finally { gate.current = false; setRemoving(false); }
  }
  return <DashboardLayout role={role} title="Medicine Details"><PageStateWrapper skeleton="medicine" isLoading={query.isLoading} isError={query.isError} hasData={Boolean(query.data)} error={query.error} onRetry={() => query.refetch()} loadingMessage="Loading medicine details…">
    {query.data && <MedicineDetailsContent medicine={query.data} role={role} canManage={canManage} onEdit={() => setDialog({ mode: 'edit', item: query.data })} onRemove={() => setDialog({ mode: 'remove' })} onAction={(mode, groupId) => setDialog({ mode, groupId, medicineId })} history={<MedicineInventoryHistory key={medicineId} item={query.data} user={user} />} />}
    {removeError && <p role="alert" className="mt-3 text-sm text-alert-700">{removeError}</p>}
  </PageStateWrapper>
    {canManage && dialog?.mode === 'edit' && <MedicineFormModal open mode="edit" item={dialog.item} onClose={() => setDialog(null)} onSubmit={edit} />}
    {canManage && dialog?.medicineId && <MedicineActionDialog key={`${medicineId}-${dialog.mode}-${dialog.groupId || ''}`} intent={dialog} user={user} role={role} onClose={() => setDialog(null)} />}
    <ConfirmationModal open={canManage && dialog?.mode === 'remove'} title="Remove inventory item?" description={`${query.data?.name || 'This item'} (Item ${medicineId}) will be removed from active inventory. Stock and recorded history are retained through archival. An unused zero-stock item may be permanently deleted.`} confirmText="Remove Item" loading={removing} onCancel={() => { if (!removing) setDialog(null); }} onConfirm={remove} />
  </DashboardLayout>;
}

export default function MedicineDetailsPage({ role }) {
  const { medicineId } = useParams();
  const user = getCurrentUser();
  return <MedicineDetailsRoute key={`${role}-${medicineDetailsKey(user, medicineId).slice(0, -1).join(':')}`} role={role} medicineId={medicineId} />;
}
