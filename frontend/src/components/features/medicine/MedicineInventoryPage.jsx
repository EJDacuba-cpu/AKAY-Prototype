import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../layout/DashboardLayout';
import { FilteredEmptyPanel, PageStateWrapper, RefreshingIndicator, SearchField, SearchFilterCluster, TablePagination } from '../../common';
import { Button } from '../../ui/button';
import MedicineInventoryTable from './MedicineInventoryTable';
import MedicineInventoryFilters from './MedicineInventoryFilters';
import MedicineFormModal from './MedicineFormModal';
import MedicineActionDialog from './MedicineActionDialog';
import usePagedRows from '../../../hooks/usePagedRows';
import useFacilityCalendarDate from '../../../hooks/useFacilityCalendarDate';
import { getCurrentUser } from '../../../utils/auth';
import { queryKeys } from '../../../utils/queryKeys';
import { fixedTableVars, resetKeyOf, tableBodyHeight } from '../../../utils/tablePaging';
import { getMedicineExpiryStatus, getMedicineStockStatus } from '../../../utils/medicineInventoryStatus';
import { retainCalendarData } from '../../../utils/medicineLedger';
import { addBhcMedicine, addRhuMedicine, loadMedicineAvailability } from '../../../services/medicineService';

const defaults = { search: '', category: 'All Categories', status: 'All Status', expiry: 'All Expiry' };
function MedicineInventoryWorkspace({ role }) {
  useFacilityCalendarDate();
  const user = getCurrentUser();
  const client = useQueryClient();
  const canManage = (user?.permissions || []).includes('inventory.manage');
  const [filters, setFilters] = useState(defaults);
  const [dialog, setDialog] = useState(null);
  const listKey = queryKeys.medicineAvailability(role, user);
  const query = useQuery({ queryKey: listKey, queryFn: loadMedicineAvailability, placeholderData: (data, previous) => retainCalendarData(data, previous, listKey), refetchInterval: 60_000, retry: false });
  const facilityId = String(role === 'rhu' ? user?.ruralHealthUnitId || user?.rural_health_unit_id || user?.rhuId || user?.facilityId || '' : user?.barangayHealthCenterId || user?.barangay_health_center_id || user?.bhcId || user?.facilityId || '');
  const items = useMemo(() => (Array.isArray(query.data) ? query.data : []).filter(item => facilityId && (role === 'rhu' ? !item.barangayHealthCenterId && String(item.ruralHealthUnitId) === facilityId : !item.ruralHealthUnitId && String(item.barangayHealthCenterId) === facilityId)), [query.data, role, facilityId]);
  const filtered = useMemo(() => items.filter(item => {
    const search = filters.search.trim().toLowerCase();
    return (!search || [item.name, item.category, item.id, item.notes].filter(Boolean).join(' ').toLowerCase().includes(search))
      && (filters.category === defaults.category || item.category === filters.category)
      && (filters.status === defaults.status || getMedicineStockStatus(item) === filters.status)
      && (filters.expiry === defaults.expiry || getMedicineExpiryStatus(item) === filters.expiry);
  }), [items, filters]);
  const { page, setPage, totalPages, pageRows } = usePagedRows(filtered, resetKeyOf(filters));
  const activeCount = ['category', 'status', 'expiry'].filter(key => filters[key] !== defaults[key]).length;
  async function add(payload, options) {
    await (role === 'rhu' ? addRhuMedicine : addBhcMedicine)(payload, options);
    await client.invalidateQueries({ queryKey: queryKeys.medicineAvailability(role, user) });
    setDialog(null); toast.success('Medicine added to inventory.');
  }
  return (
    <DashboardLayout role={role} title="Medicine and Supply">
      <PageStateWrapper skeleton="medicine" skeletonOptions={{ columns: [34, 21, 21, 18, 6], minWidth: 0 }} isLoading={query.isPending} isError={query.isError} isFetching={query.isFetching} hasData={Array.isArray(query.data)} error={query.error} onRetry={() => query.refetch()} loadingMessage="Loading medicine inventory…">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[17px] font-bold tracking-tight text-ink-800">{role === "rhu" ? "Inventory" : "Medicine and Supply"}</h1>
              <p className="mt-1 text-[13px] text-neutral-600">{role === "rhu" ? "RHU medicine and supply inventory." : `${role.toUpperCase()} medicine and supply inventory.`}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SearchFilterCluster
                search={
                  <SearchField
                    value={filters.search}
                    onChange={(search) => setFilters((current) => ({ ...current, search }))}
                    placeholder="Search name, category, item ID, or notes"
                    label="Search medicines"
                  />
                }
                filter={
                  <MedicineInventoryFilters
                    applied={filters}
                    activeCount={activeCount}
                    activeFilters={[
                      { key: "status", fieldLabel: "Status", value: filters.status, reset: defaults.status },
                      { key: "expiry", fieldLabel: "Expiry", value: filters.expiry, reset: defaults.expiry },
                      { key: "category", fieldLabel: "Category", value: filters.category, reset: defaults.category },
                    ]
                      .filter((chip) => chip.value !== chip.reset)
                      .map((chip) => ({
                        key: chip.key,
                        label: `${chip.fieldLabel}: ${chip.value}`,
                      }))}
                    onApply={(next) => setFilters((current) => ({ ...current, ...next }))}
                    onRemoveFilter={(key) => setFilters((current) => ({ ...current, [key]: defaults[key] }))}
                    onClearAll={() => setFilters((current) => ({ ...defaults, search: current.search }))}
                  />
                }
              />
              <Button variant="brand" size="sm" disabled={!canManage} title={!canManage ? "Inventory management permission required" : undefined} onClick={() => setDialog({ mode: "add" })}>
                <PackagePlus size={14} />Add Medicine
              </Button>
            </div>
          </div>
          {query.isError && Array.isArray(query.data) && <p role="status" className="text-sm text-warning-700">Unable to refresh inventory. The last loaded values are shown.</p>}
          {(() => {
            const narrowed = Boolean(filters.search.trim()) || activeCount > 0;
            if (narrowed && filtered.length === 0) {
              return (
                <FilteredEmptyPanel
                  title="No medicines match"
                  description="Try a different search, or clear filters to see the full inventory again."
                  onClear={() => setFilters(defaults)}
                  clearLabel="Clear search and filters"
                />
              );
            }
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p aria-live="polite" className="text-xs tabular-nums text-neutral-600">{filtered.length} of {items.length} items</p>
                  {query.isFetching && Array.isArray(query.data) && <RefreshingIndicator label="Updating inventory…" />}
                </div>
                <div className="medicine-inventory-sheet min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white" style={{ "--medicine-inventory-height": `${tableBodyHeight()}px`, ...fixedTableVars() }}>
                  <div className="medicine-inventory-body akay-fixed-table">
                    <MedicineInventoryTable items={pageRows} role={role} canManage={canManage} onAction={(item, mode) => { if (canManage) setDialog({ mode, medicineId: item.id }); }} />
                  </div>
                  <div className="medicine-inventory-pagination">
                    <TablePagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      alwaysShow
                    />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </PageStateWrapper>
      {canManage && dialog?.mode === "add" && <MedicineFormModal open mode="add" onClose={() => setDialog(null)} onSubmit={add} />}
      {canManage && dialog?.medicineId && <MedicineActionDialog key={`${dialog.medicineId}-${dialog.mode}`} intent={dialog} user={user} role={role} onClose={() => setDialog(null)} />}
    </DashboardLayout>
  );
}

export default function MedicineInventoryPage({ role }) {
  const user = getCurrentUser();
  return <MedicineInventoryWorkspace key={queryKeys.medicineAvailability(role, user).slice(0, -1).join(':')} role={role} />;
}
