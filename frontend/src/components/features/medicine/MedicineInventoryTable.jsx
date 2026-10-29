import { Link } from 'react-router';
import { Eye, History, MoreVertical, PackageMinus, PackagePlus, ShieldAlert } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../ui/dropdown-menu';
import { Button } from '../../ui/button';
import { getMedicineInventoryView, stockStatusTone, expiryStatusTone } from '../../../utils/medicineInventoryStatus';
import { inventoryActions, ledgerQuantity, medicineDetailsPath } from '../../../utils/medicineLedger';

const icons = { details: Eye, restock: PackagePlus, deduct: PackageMinus, quarantine: ShieldAlert, history: History };
export function LedgerStamp({ label, tone = 'neutral', appearance = 'badge' }) {
  const tones = { info: 'border-info-100 bg-info-50 text-info-700', warning: 'border-warning-100 bg-warning-50 text-warning-700', danger: 'border-alert-100 bg-alert-50 text-alert-700', neutral: 'border-neutral-200 bg-neutral-100 text-neutral-600' };
  return <span data-tone={tone} className={`medicine-inventory-status inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone] || tones.neutral} ${appearance === 'plain' ? 'medicine-inventory-status--plain' : ''}`}><span aria-hidden="true" className="medicine-inventory-status-dot size-1.5 rounded-full bg-current" />{label}</span>;
}
export function MedicineQuantity({ item }) {
  const { recorded, available, differs } = ledgerQuantity(item);
  return <div className="text-sm font-medium tabular-nums text-ink-800"><span>{recorded.toLocaleString()} {item.unit}</span>{differs && <span className="mt-0.5 block text-xs font-normal text-neutral-600">{available.toLocaleString()} available to dispense</span>}</div>;
}
function MedicineName({ item, role }) {
  return <div className="min-w-0"><Link to={medicineDetailsPath(role, item.id)} className="block truncate rounded-sm text-sm font-semibold text-ink-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50" title={item.name}>{item.name}</Link><p className="mt-0.5 truncate text-[11px] text-neutral-600">{item.category || 'Uncategorized'} · <span className="tabular-nums">Item {item.id}</span></p></div>;
}
function StockStatus({ item }) {
  const view = getMedicineInventoryView(item);
  return <div className="space-y-1"><LedgerStamp label={view.stockStatus} tone={stockStatusTone(view.stockStatus)} />{item.reconciliationRequired && <LedgerStamp label="Reconciliation Required" tone="warning" />}</div>;
}
export function MedicineRowActions({ item, role, canManage, onAction }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label={`Actions for ${item.name}`}><MoreVertical size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="border-neutral-200 text-ink-800">
    {inventoryActions(canManage).map(action => {
      const Icon = icons[action.key];
      if (action.key === 'details' || action.key === 'history') return <DropdownMenuItem key={action.key} asChild className="focus:bg-neutral-100 focus:text-ink-800"><Link to={medicineDetailsPath(role, item.id, action.key === 'history')}><Icon size={15} />{action.label}</Link></DropdownMenuItem>;
      return <DropdownMenuItem key={action.key} disabled={action.disabled} onSelect={() => onAction?.(item, action.key)} className="focus:bg-neutral-100 focus:text-ink-800"><Icon size={15} />{action.label}</DropdownMenuItem>;
    })}
  </DropdownMenuContent></DropdownMenu>;
}
export default function MedicineInventoryTable({ items = [], role, canManage = false, onAction }) {
  if (!items.length) return <div className="medicine-inventory-empty px-4 py-14 text-center"><p className="text-sm font-semibold text-ink-800">No medicines found.</p><p className="mt-1 text-xs text-neutral-600">Adjust the search or filters, or add an item to your inventory.</p></div>;
  return <>
    <div className="hidden md:block"><table className="w-full table-fixed text-left"><caption className="sr-only">{role.toUpperCase()} medicine inventory</caption><colgroup><col className="w-[34%]" /><col className="w-[21%]" /><col className="w-[21%]" /><col className="w-[18%]" /><col className="w-[6%]" /></colgroup>
      <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600"><tr><th className="px-4">Medicine / Supply</th><th className="px-3">Quantity</th><th className="px-3">Stock</th><th className="px-3">Expiry</th><th className="px-2"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody className="divide-y divide-neutral-100">{items.map(item => { const view = getMedicineInventoryView(item); return <tr key={item.id} className="h-14 transition-colors hover:bg-neutral-50"><td className="px-4 py-2"><MedicineName item={item} role={role} /></td><td className="px-3 py-2"><MedicineQuantity item={item} /></td><td className="px-3 py-2"><StockStatus item={item} /></td><td className="px-3 py-2"><LedgerStamp label={view.expiryStatus} tone={expiryStatusTone(view.expiryStatus)} /></td><td className="px-2 text-right"><MedicineRowActions item={item} role={role} canManage={canManage} onAction={onAction} /></td></tr>; })}</tbody>
    </table></div>
    <div className="divide-y divide-neutral-100 md:hidden">{items.map(item => { const view = getMedicineInventoryView(item); return <article key={item.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><MedicineName item={item} role={role} /><MedicineRowActions item={item} role={role} canManage={canManage} onAction={onAction} /></div><div className="flex flex-wrap items-start justify-between gap-3"><MedicineQuantity item={item} /><StockStatus item={item} /></div><LedgerStamp label={view.expiryStatus} tone={expiryStatusTone(view.expiryStatus)} /></article>; })}</div>
  </>;
}
