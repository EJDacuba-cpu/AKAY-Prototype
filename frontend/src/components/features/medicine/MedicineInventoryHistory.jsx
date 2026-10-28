import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/button';
import { getMedicineTransactions } from '../../../services/medicineService';
import { queryKeys } from '../../../utils/queryKeys';
import { expiryGroups, groupLabel } from '../../../utils/medicineExpiryGroups';

const labels = { opening_balance: 'Opening Balance', restock: 'Restock', dispense: 'Dispensed', adjustment_in: 'Stock Added', adjustment_out: 'Deducted', damaged_disposal: 'Damaged Stock Disposal', expired_disposal: 'Expired Stock Disposal', correction: 'Inventory Correction', physical_count: 'Complete Physical Verification', quarantine: 'Quarantined', release: 'Released', quarantine_disposal: 'Quarantined Stock Disposal' };
function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
function MovementDetails({ transaction }) {
  const allocations = Array.isArray(transaction.allocations) ? transaction.allocations : [];
  return <div className="space-y-1 text-xs leading-relaxed text-neutral-600"><p className="break-words">{transaction.reason || (transaction.transaction_type === 'dispense' ? 'Dispensed through health record' : transaction.transaction_type === 'opening_balance' ? 'Initial stock' : '—')}</p>{allocations.map((a, index) => {
    const group = a.expiry_group;
    return <p key={a.id || `${a.expiry_group_id}-${index}`}>{group ? groupLabel(group) : `Expiry Group ${a.expiry_group_id ?? 'not recorded'}`} · Outside quarantine {a.available_before} → {a.available_after}; quarantined {a.quarantined_before} → {a.quarantined_after}</p>;
  })}{Number(transaction.discrepancy) < 0 && <p className="font-medium text-alert-700">Shortage recorded: {Math.abs(transaction.discrepancy)}</p>}</div>;
}
export default function MedicineInventoryHistory({ item, user }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: queryKeys.medicineTransactions(user, item.id, page), queryFn: () => getMedicineTransactions(item.id, { page, perPage: 15 }), retry: false });
  const paginator = query.data?.data || {};
  const groups = expiryGroups(item);
  const rows = Array.isArray(paginator.data) ? paginator.data.map(transaction => ({ ...transaction,
    allocations: (Array.isArray(transaction.allocations) ? transaction.allocations : []).map(allocation => ({ ...allocation,
      expiry_group: allocation.expiry_group || groups.find(group => String(group.id) === String(allocation.expiry_group_id)),
    })),
  })) : [];
  const lastPage = Math.max(1, Number(paginator.last_page) || 1);
  const currentPage = Number(paginator.current_page) || page;
  return <section id="history" tabIndex={-1} className="scroll-mt-24 rounded-xl border border-neutral-200 bg-white outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50" aria-labelledby="medicine-history-title">
    <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-4"><div><h2 id="medicine-history-title" className="text-sm font-semibold text-ink-800">Inventory History</h2><p className="mt-1 text-xs text-neutral-600">Audited stock movements and recorded expiry-group allocations.</p></div>{query.isFetching && !query.isLoading && <span role="status" className="text-xs text-neutral-600">Updating…</span>}</div>
    {query.isLoading ? <p role="status" className="p-6 text-sm text-neutral-600">Loading inventory history…</p> : query.isError ? <div role="alert" className="space-y-3 p-6 text-sm text-neutral-600"><p>Inventory history could not be loaded.</p><Button variant="secondary" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>Try Again</Button></div> : !rows.length ? <p className="p-6 text-sm text-neutral-600">No inventory history recorded yet.</p> : <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-xs"><thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600"><tr><th className="px-4">Date / Staff</th><th className="px-3">Action</th><th className="px-3 text-right">Change</th><th className="px-3 text-right">Recorded Stock</th><th className="px-4">Reason / Groups</th></tr></thead><tbody className="divide-y divide-neutral-100">{rows.map((t, index) => { const delta = Number(t.quantity_delta) || 0; return <tr key={`${currentPage}-${index}`} className="align-top hover:bg-neutral-50"><td className="whitespace-nowrap px-4 py-3 text-neutral-600">{dateTime(t.created_at)}<p className="mt-1 font-medium text-ink-800">{t.actor?.name || '—'}</p></td><td className="px-3 py-3 font-medium text-ink-800">{labels[t.transaction_type] || t.transaction_type}</td><td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-800">{delta > 0 ? '+' : ''}{delta.toLocaleString()}</td><td className="px-3 py-3 text-right tabular-nums text-ink-800">{Number(t.quantity_before).toLocaleString()} → {Number(t.quantity_after).toLocaleString()}</td><td className="max-w-sm px-4 py-3"><MovementDetails transaction={t} /></td></tr>; })}</tbody></table></div>
      <ol className="divide-y divide-neutral-100 md:hidden">{rows.map((t, index) => <li key={`${currentPage}-${index}`} className="space-y-2 p-4"><div className="flex justify-between gap-3 text-sm font-semibold text-ink-800"><span>{labels[t.transaction_type] || t.transaction_type}</span><span className="tabular-nums">{Number(t.quantity_delta) > 0 ? '+' : ''}{t.quantity_delta}</span></div><p className="text-xs text-neutral-600">{dateTime(t.created_at)} · {t.actor?.name || '—'}</p><p className="text-xs tabular-nums text-neutral-600">Recorded Stock: {t.quantity_before} → {t.quantity_after}</p><MovementDetails transaction={t} /></li>)}</ol>
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 p-3"><p className="text-xs tabular-nums text-neutral-600">Page {currentPage} of {lastPage}</p><div className="flex gap-2"><Button variant="secondary" size="compact" disabled={currentPage <= 1 || query.isFetching} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="secondary" size="compact" disabled={currentPage >= lastPage || query.isFetching} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
    </>}
  </section>;
}
