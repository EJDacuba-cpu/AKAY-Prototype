import useFacilityCalendarDate from "../../hooks/useFacilityCalendarDate";
import MedicineDetailsModal from "../../components/features/medicine/MedicineDetailsModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Edit3,
  History,
  MoreVertical,
  Package,
  PackageMinus,
  PackagePlus,
  ChevronDown,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import RestrictedArea from "../../components/common/access/RestrictedArea";
import {
  ConfirmationModal,
  NoticeModal,
  PageStateWrapper,
  RefreshingIndicator,
  SearchField,
  SuccessModal,
  TablePagination,
} from "../../components/common";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Button } from "../../components/ui/button";
import usePagedRows from "../../hooks/usePagedRows";
import { resetKeyOf } from "../../utils/tablePaging";
import MedicineFormModal from "../../components/features/medicine/MedicineFormModal";
import MedicineInventoryActionModal from "../../components/features/medicine/MedicineInventoryActionModal";
import MedicineInventoryHistoryModal from "../../components/features/medicine/MedicineInventoryHistoryModal";
import {
  addBhcMedicine,
  deductMedicine,
  deleteBhcMedicine,
  formatMedicineQuantity,
  loadMedicineAvailability,
  MEDICINE_CATEGORIES,
  restockMedicine,
  updateBhcMedicine,
} from "../../services/medicineService";
import {
  BHC_EXPIRY_FILTER_OPTIONS,
  BHC_STOCK_FILTER_OPTIONS,
  EXPIRY_STATUS,
  getMedicineExpiryStatus,
  getMedicineInventoryView,
  getMedicineStockStatus,
  stockStatusTone,
} from "../../utils/medicineInventoryStatus";
import { getCurrentUser } from "../../utils/auth";
import { queryKeys } from "../../utils/queryKeys";
import {
  applyInventoryListAfterDelete,
  describeBhcMedicineDeletion,
} from "../../utils/medicineMutationSafety";
import { createSubmitGate } from "../../utils/medicineSubmitGate";

const DEFAULT_FILTERS = {
  search: "",
  category: "All Categories",
  status: "All Status",
  expiry: "All Expiry",
};

const LIST_FILTER_DEFAULTS = {
  category: DEFAULT_FILTERS.category,
  status: DEFAULT_FILTERS.status,
  expiry: DEFAULT_FILTERS.expiry,
};

const CATEGORY_OPTIONS = ["All Categories", ...MEDICINE_CATEGORIES];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const FILTER_SELECT =
  "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white py-0 pl-3 pr-8 text-[13px] text-ink-800 shadow-xs outline-none transition-colors hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";

export default function MedicineAvailability() {
  useFacilityCalendarDate();
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canManageBhcInventory = canManageBhcMedicineInventory(currentUser);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openMenuId, setOpenMenuId] = useState("");
  const [inventoryAction, setInventoryAction] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [detailsItem, setDetailsItem] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [successNotice, setSuccessNotice] = useState(null);
  const deleteGateRef = useRef(null);
  if (deleteGateRef.current == null) deleteGateRef.current = createSubmitGate();
  const {
    data: medicineItems = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.medicineAvailability("bhc", currentUser),
    queryFn: loadMedicineAvailability,
    refetchInterval: 60_000,
    retry: false,
  });

  const currentFacilityId = String(currentUser?.barangayHealthCenterId || currentUser?.barangay_health_center_id || currentUser?.bhcId || currentUser?.facilityId || "");
  const safeMedicineItems = useMemo(
    () => (Array.isArray(medicineItems) ? medicineItems : []).filter(item => currentFacilityId && !item.ruralHealthUnitId && String(item.barangayHealthCenterId || "") === currentFacilityId),
    [medicineItems, currentFacilityId],
  );
  const filteredItems = useMemo(
    () => filterMedicineItems(safeMedicineItems, filters),
    [safeMedicineItems, filters],
  );
  const { page, setPage, totalPages, pageRows } = usePagedRows(
    filteredItems,
    resetKeyOf(filters),
  );

  const lowStockCount = safeMedicineItems.filter(
    (item) => item.status === "Low Stock",
  ).length;

  const activeFilterChips = [
    filters.status !== DEFAULT_FILTERS.status && {
      key: "status",
      label: filters.status,
    },
    filters.expiry !== DEFAULT_FILTERS.expiry && {
      key: "expiry",
      label: filters.expiry,
    },
    filters.category !== DEFAULT_FILTERS.category && {
      key: "category",
      label: filters.category,
    },
  ].filter(Boolean);
  const narrowed =
    Boolean(filters.search.trim()) || activeFilterChips.length > 0;
  const itemsWord = safeMedicineItems.length === 1 ? "item" : "items";

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyListFilters(next) {
    setFilters((prev) => ({
      ...prev,
      category: next.category,
      status: next.status,
      expiry: next.expiry,
    }));
  }

  function openAddModal() {
    setSelectedItem(null);
    setModalMode("add");
  }

  function openEditModal(item) {
    setOpenMenuId("");
    setSelectedItem(item);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedItem(null);
  }

  function openInventoryAction(item, action) {
    setOpenMenuId("");
    setSelectedItem(item);
    setInventoryAction(action);
  }

  function closeInventoryAction() {
    setInventoryAction(null);
    setSelectedItem(null);
  }

  function openInventoryHistory(item) {
    setOpenMenuId("");
    setHistoryItem(item);
  }

  async function handleSubmit(payload, options = {}) {
    const nextItems =
      modalMode === "edit" && selectedItem
        ? await updateBhcMedicine(selectedItem.id, payload, options)
        : await addBhcMedicine(payload, options);

    queryClient.setQueryData(
      queryKeys.medicineAvailability("bhc", currentUser),
      Array.isArray(nextItems) ? nextItems : [],
    );
    closeModal();
    setSuccessNotice({
      title: modalMode === "edit" ? "Medicine updated" : "Medicine added",
      description:
        modalMode === "edit"
          ? `${payload.name} was saved.`
          : `${payload.name} was added to BHC inventory.`,
    });
  }

  function requestDelete(item) {
    setOpenMenuId("");
    setPendingDelete(item);
    setDeleteError("");
  }

  function cancelDelete() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!pendingDelete || !deleteGateRef.current.begin()) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const nextItems = await deleteBhcMedicine(pendingDelete.id);
      queryClient.setQueryData(
        queryKeys.medicineAvailability("bhc", currentUser),
        applyInventoryListAfterDelete(
          Array.isArray(nextItems) ? nextItems : safeMedicineItems,
          pendingDelete.id,
          { ok: true },
        ),
      );
      setSuccessNotice({
        title: "Medicine removed",
        description: `${pendingDelete.name} (Item ID ${pendingDelete.id}) was removed from BHC inventory.`,
      });
      setPendingDelete(null);
    } catch (error) {
      queryClient.setQueryData(
        queryKeys.medicineAvailability("bhc", currentUser),
        applyInventoryListAfterDelete(safeMedicineItems, pendingDelete.id, {
          ok: false,
        }),
      );
      setPendingDelete(null);
      setDeleteError(error?.message || "Unable to delete this medicine.");
    } finally {
      setDeleting(false);
      deleteGateRef.current.end();
    }
  }

  async function handleInventoryAction(payload, options = {}) {
    const result =
      inventoryAction === "restock"
        ? await restockMedicine(selectedItem.id, payload, options)
        : await deductMedicine(selectedItem.id, payload, options);
    queryClient.setQueryData(
      queryKeys.medicineAvailability("bhc", currentUser),
      Array.isArray(result.items) ? result.items : [],
    );
    await queryClient.invalidateQueries({
      queryKey: queryKeys.medicineAvailability("bhc", currentUser),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.medicineTransactions(currentUser, selectedItem.id),
    });
    closeInventoryAction();
  }

  const deleteCopy = describeBhcMedicineDeletion(pendingDelete || {});

  return (
    <DashboardLayout role="bhc" title="Health Commodities">
      <PageStateWrapper skeleton="medicine"
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={safeMedicineItems.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading medicine inventory..."
      >
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight tracking-tight text-ink-800">
              Health Commodities
            </h1>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              Manage your BHC medicine inventory.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CommoditiesFilterMenu
              applied={listFiltersOf(filters)}
              activeCount={activeFilterChips.length}
              onApply={applyListFilters}
            />
            <RestrictedArea
              locked={!canManageBhcInventory}
              label="Stock Management"
              compact
              className="shrink-0 rounded-full"
              placeholder={<AddMedicineButton />}
            >
              <AddMedicineButton onClick={openAddModal} />
            </RestrictedArea>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 text-[12px] font-medium text-ink-800">
              <Package size={13} aria-hidden="true" />
              BHC Inventory
              {lowStockCount > 0 && (
                <span
                  aria-label={`${lowStockCount} low-stock items`}
                  className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-800"
                >
                  {lowStockCount}
                </span>
              )}
            </span>
            {isFetching && safeMedicineItems.length > 0 && (
              <RefreshingIndicator label="Updating medicine inventory..." />
            )}
          </div>
          <div className="min-w-[220px] flex-1 sm:max-w-[320px]">
            <SearchField
              value={filters.search}
              onChange={(value) => updateFilter("search", value)}
              placeholder="Search name, category, item ID, or notes"
              label="Search medicines"
            />
          </div>
        </div>

      <p className="sr-only" aria-live="polite">
        {narrowed
          ? `Showing ${filteredItems.length} of ${safeMedicineItems.length} ${itemsWord}`
          : `${safeMedicineItems.length} ${itemsWord}`}
      </p>

      <div className="min-w-0 rounded-xl border border-neutral-200 bg-white">
          <MedicineTable
            items={pageRows}
            editable={canManageBhcInventory}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            onDetails={setDetailsItem}
            onEdit={openEditModal}
            onRestock={(item) => openInventoryAction(item, "restock")}
            onDeduct={(item) => openInventoryAction(item, "deduct")}
            onHistory={openInventoryHistory}
            onDelete={requestDelete}
          />

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      <MedicineFormModal
        open={!!modalMode}
        mode={modalMode || "add"}
        item={selectedItem}
        title={modalMode === "edit" ? "Edit Medicine" : "Add Medicine"}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
      <MedicineInventoryActionModal
        open={Boolean(inventoryAction)}
        mode={inventoryAction}
        item={selectedItem}
        onClose={closeInventoryAction}
        onSubmit={handleInventoryAction}
      />
      <MedicineDetailsModal key={detailsItem?.id || "closed"} open={Boolean(detailsItem)} item={detailsItem} user={currentUser} onClose={() => setDetailsItem(null)} />
      <MedicineInventoryHistoryModal
        open={Boolean(historyItem)}
        item={historyItem}
        user={currentUser}
        onClose={() => setHistoryItem(null)}
      />
      <ConfirmationModal
        open={Boolean(pendingDelete)}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmText={deleteCopy.confirmText}
        cancelText="Cancel"
        loading={deleting}
        loadingText="Deleting..."
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
      <NoticeModal
        open={Boolean(deleteError)}
        title="Unable to delete medicine"
        message={deleteError}
        onClose={() => setDeleteError("")}
      />
      <SuccessModal
        open={Boolean(successNotice)}
        title={successNotice?.title}
        description={successNotice?.description}
        buttonText="Continue"
        onClose={() => setSuccessNotice(null)}
      />
      </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function useMinWidth(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    function update() {
      setMatches(media.matches);
    }
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function MedicineTable({
  onDetails,
  items,
  editable,
  openMenuId,
  setOpenMenuId,
  onEdit,
  onRestock,
  onDeduct,
  onHistory,
  onDelete,
}) {
  const [expandedId, setExpandedId] = useState("");
  const showTable = useMinWidth("(min-width: 768px)");
  const columnCount = editable ? 5 : 4;

  useEffect(() => {
    setOpenMenuId("");
  }, [showTable, setOpenMenuId]);

  function toggleExpanded(id) {
    setExpandedId((current) => (current === id ? "" : id));
  }

  const rowProps = {
    onDetails,
    editable,
    openMenuId,
    setOpenMenuId,
    onEdit,
    onRestock,
    onDeduct,
    onHistory,
    onDelete,
  };

  if (!showTable) {
    return items.length === 0 ? (
      <MedicineEmptyState />
    ) : (
      <div className="divide-y divide-neutral-100">
        {items.map((item) => (
          <MedicineInventoryRecord
            key={item.id}
            item={item}
            inventory={getMedicineInventoryView(item)}
            expanded={expandedId === item.id}
            detailsId={`medicine-details-record-${item.id}`}
            onToggleExpanded={() => toggleExpanded(item.id)}
            {...rowProps}
          />
        ))}
      </div>
    );
  }

  return (
        <table className="w-full table-fixed text-left">
          <colgroup>
            {editable ? (
              <>
                <col className="w-[32%] lg:w-[40%]" />
                <col className="w-[16%] lg:w-[12%]" />
                <col className="w-[18%] lg:w-[16%]" />
                <col className="w-[20%] lg:w-[20%]" />
                <col className="w-[14%] lg:w-[12%]" />
              </>
            ) : (
              <>
                <col className="w-[38%] lg:w-[46%]" />
                <col className="w-[18%] lg:w-[14%]" />
                <col className="w-[22%] lg:w-[20%]" />
                <col className="w-[22%] lg:w-[20%]" />
              </>
            )}
          </colgroup>
          <thead>
            <tr className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2.5 lg:px-4">Medicine / Supply</th>
              <th className="px-2.5 py-2.5 lg:px-3">Quantity</th>
              <th className="px-2.5 py-2.5 lg:px-3">Stock</th>
              <th className="px-2.5 py-2.5 lg:px-3">Expiry</th>
              {editable && (
                <th className="px-2 py-2.5 text-right lg:px-3">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <MedicineEmptyState />
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <MedicineInventoryRow
                  key={item.id}
                  item={item}
                  inventory={getMedicineInventoryView(item)}
                  expanded={expandedId === item.id}
                  detailsId={`medicine-details-row-${item.id}`}
                  columnCount={columnCount}
                  onToggleExpanded={() => toggleExpanded(item.id)}
                  {...rowProps}
                />
              ))
            )}
          </tbody>
        </table>
  );
}

function MedicineInventoryRow({
  item,
  inventory,
  expanded,
  detailsId,
  columnCount,
  editable,
  openMenuId,
  setOpenMenuId,
  onToggleExpanded,
  onDetails,
  onEdit,
  onRestock,
  onDeduct,
  onHistory,
  onDelete,
}) {
  const categoryLabel = item.category || "Uncategorized";

  return (
    <>
      <tr className="group min-h-14 transition-colors hover:bg-neutral-100">
        <td className="overflow-hidden px-3 py-2 align-middle lg:px-4">
          <MedicineNameControl
            item={item}
            categoryLabel={categoryLabel}
            expanded={expanded}
            detailsId={detailsId}
            onToggle={onToggleExpanded}
            showMeta
          />
        </td>
        <td className="truncate px-2.5 py-2 align-middle text-sm font-medium tabular-nums text-ink-800 lg:px-3">
          {formatMedicineQuantity(item)}<span className="block text-xs font-normal text-neutral-500">recorded ? {item.stockSummary?.available ?? 0} available</span>
        </td>
        <td className="px-2.5 py-2 align-middle lg:px-3">
          <StockCell inventory={inventory} />
        </td>
        <td className="px-2.5 py-2 align-middle lg:px-3">
          <ExpiryCell
            dateLabel={inventory.expiryDateLabel}
            status={inventory.expiryStatus}
          />
        </td>
        {editable && (
          <td className="relative z-10 px-2 py-2 text-right align-middle lg:px-3">
            <RowActionMenu
              item={item}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              onEdit={onEdit}
              onRestock={onRestock}
              onDeduct={onDeduct}
              onHistory={onHistory}
              onDelete={onDelete}
            />
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="bg-neutral-50">
          <td colSpan={columnCount} className="px-3 py-2.5 lg:px-4">
            <MedicineDetails
              item={item}
              detailsId={detailsId}
              categoryLabel={categoryLabel}
              onDetails={() => onDetails(item)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function MedicineInventoryRecord({
  item,
  inventory,
  expanded,
  detailsId,
  editable,
  openMenuId,
  setOpenMenuId,
  onToggleExpanded,
  onDetails,
  onEdit,
  onRestock,
  onDeduct,
  onHistory,
  onDelete,
}) {
  const categoryLabel = item.category || "Uncategorized";

  return (
    <article>
      <div className="flex items-start gap-2 px-3 py-3">
        <div className="min-w-0 flex-1">
          <MedicineNameControl
            item={item}
            categoryLabel={categoryLabel}
            expanded={expanded}
            detailsId={detailsId}
            onToggle={onToggleExpanded}
          />
        </div>
        {editable && (
          <RowActionMenu
            item={item}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            onEdit={onEdit}
            onRestock={onRestock}
            onDeduct={onDeduct}
            onHistory={onHistory}
            onDelete={onDelete}
            touch
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3 min-[420px]:grid-cols-3">
        <RecordMetric label="Quantity">
          <span className="block truncate text-sm font-medium tabular-nums text-ink-800">
            {formatMedicineQuantity(item)}<span className="block text-xs font-normal text-neutral-500">recorded ? {item.stockSummary?.available ?? 0} available</span>
          </span>
        </RecordMetric>
        <RecordMetric label="Stock">
          <StockCell inventory={inventory} />
        </RecordMetric>
        <RecordMetric label="Expiry" className="col-span-2 min-[420px]:col-span-1">
          <ExpiryCell
            dateLabel={inventory.expiryDateLabel}
            status={inventory.expiryStatus}
          />
        </RecordMetric>
      </div>
      {expanded && (
        <div className="bg-neutral-50 px-3 py-2.5">
          <MedicineDetails
            item={item}
            detailsId={detailsId}
            categoryLabel={categoryLabel}
            onDetails={() => onDetails(item)}
          />
        </div>
      )}
    </article>
  );
}

function MedicineNameControl({
  item,
  categoryLabel,
  expanded,
  detailsId,
  onToggle,
  showMeta = false,
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={detailsId}
      onClick={onToggle}
      className={`flex w-full min-w-0 items-start gap-2 rounded-sm text-left ${FOCUS_RING}`}
    >
      <ChevronDown
        size={14}
        aria-hidden="true"
        className={`mt-0.5 shrink-0 text-neutral-400 transition-transform ${
          expanded ? "rotate-180" : ""
        }`}
      />
      <span className="min-w-0">
        <span
          className="block truncate text-sm font-semibold text-ink-800"
          title={item.name}
        >
          {item.name}
        </span>
        {showMeta ? (
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-neutral-500">
            {categoryLabel}
            <span className="tabular-nums"> · {item.id}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MedicineDetails({ item, detailsId, categoryLabel, onDetails }) {
  return (
    <dl
      id={detailsId}
      className="grid grid-cols-1 gap-x-6 gap-y-2 min-[420px]:grid-cols-2 lg:grid-cols-4"
    >
      <div><Button size="sm" variant="outline" onClick={onDetails}>View expiry groups</Button></div>
      <DetailField label="Item ID" value={item.id} tabular />
      <DetailField label="Category" value={categoryLabel} />
      <DetailField
        label="Last Updated"
        value={formatDateTime(itemUpdatedAt(item))}
      />
      <DetailField label="Notes" value={item.notes || "\u2014"} />
    </dl>
  );
}

function StockCell({ inventory }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <InventoryStamp
        label={inventory.stockStatus}
        tone={stockStatusTone(inventory.stockStatus)}
      />
      {inventory.reconciliationRequired && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-warning-700">
          Reconciliation Required
        </span>
      )}
    </div>
  );
}

function RecordMetric({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}

function MedicineEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
        <Boxes size={18} className="text-neutral-400" />
      </div>
      <p className="text-sm font-semibold text-ink-800">No medicines yet.</p>
      <p className="mt-1 text-xs text-neutral-500">
        Try adjusting your search or filters.
      </p>
    </div>
  );
}

function RowActionMenu({
  item,
  openMenuId,
  setOpenMenuId,
  onEdit,
  onRestock,
  onDeduct,
  onHistory,
  onDelete,
  touch = false,
}) {
  return (
    <ActionMenu
      item={item}
      open={openMenuId === item.id}
      touch={touch}
      onToggle={() => setOpenMenuId(openMenuId === item.id ? "" : item.id)}
      onClose={() => setOpenMenuId("")}
      onEdit={() => onEdit(item)}
      onRestock={() => onRestock(item)}
      onDeduct={() => onDeduct(item)}
      onHistory={() => onHistory(item)}
      onDelete={() => onDelete(item)}
    />
  );
}

function DetailField({ label, value, tabular = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-words text-[13px] text-ink-800 ${
          tabular ? "font-medium tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function itemUpdatedAt(item) {
  return (
    item.updated_at ||
    item.updatedAt ||
    item.created_at ||
    item.createdAt ||
    item.lastUpdated
  );
}

function filterMedicineItems(items, filters) {
  const query = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    const searchable = [
      item.id,
      item.name,
      item.category,
      item.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const matchesCategory =
      filters.category === "All Categories" ||
      item.category === filters.category;
    const matchesStatus =
      filters.status === "All Status" ||
      getMedicineStockStatus(item) === filters.status;
    const matchesExpiry =
      filters.expiry === "All Expiry" ||
      getMedicineExpiryStatus(item) === filters.expiry;

    return matchesSearch && matchesCategory && matchesStatus && matchesExpiry;
  });
}

function ActionMenu({
  item,
  open,
  touch = false,
  onToggle,
  onClose,
  onEdit,
  onRestock,
  onDeduct,
  onHistory,
  onDelete,
}) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function updatePosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 218;
    const padding = 12;
    let top = rect.bottom + 6;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - 6;
    }
    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return undefined;

    function handleClick(event) {
      if (
        btnRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      onClose();
    }

    function handleWindowChange() {
      onClose();
    }

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("scroll", handleWindowChange, true);
      window.addEventListener("resize", handleWindowChange);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open, onClose]);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          onToggle();
        }}
        className={`inline-flex items-center justify-center rounded-lg border border-[#E8ECF0] bg-white text-[#9CA3AF] transition hover:bg-[#F9FAFB] hover:text-[#0F172A] ${
          touch ? "h-11 w-11" : "h-8 w-8"
        }`}
        aria-label={`Actions for ${item.name}`}
      >
        <MoreVertical size={15} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] w-44 overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-lg"
            style={{ top: position.top, left: position.left }}
          >
            <button
              type="button"
              onClick={() => {
                onEdit();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
            >
              <Edit3 size={14} className="text-[#9CA3AF]" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                onHistory();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
            >
              <History size={14} className="text-[#9CA3AF]" />
              Inventory History
            </button>
            <button
              type="button"
              onClick={() => {
                onRestock();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
            >
              <PackagePlus size={14} className="text-[#9CA3AF]" />
              Restock
            </button>
            <button
              type="button"
              onClick={() => {
                onDeduct();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
            >
              <PackageMinus size={14} className="text-[#9CA3AF]" />
              Deduct Stock
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-red-700 transition hover:bg-red-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ExpiryCell({ dateLabel, status }) {
  const attention =
    status === EXPIRY_STATUS.EXPIRED ||
    status === EXPIRY_STATUS.EXPIRES_TODAY;

  return (
    <div
      className="flex min-w-0 flex-col items-start gap-0.5"
      title={`${dateLabel} · ${status}`}
    >
      <span className="truncate text-sm font-medium tabular-nums text-ink-700">
        {dateLabel}
      </span>
      <span
        className={`text-[11px] leading-tight ${
          attention
            ? "font-semibold text-neutral-700"
            : "font-medium text-neutral-500"
        }`}
      >
        {status}
      </span>
    </div>
  );
}

function InventoryStamp({ label, tone = "neutral", prominent = false }) {
  const map = {
    info: "border-[#a5f3fc] bg-[#ecfeff] text-[#0e7490]",
    warning: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
    danger: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
    neutral: "border-[#d1d5db] bg-[#f3f4f6] text-[#4b5563]",
  };
  const dot = {
    info: "bg-[#0891b2]",
    warning: "bg-[#f59e0b]",
    danger: "bg-[#ef4444]",
    neutral: "bg-[#9ca3af]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 uppercase tracking-wide ${
        map[tone] || map.neutral
      } ${prominent ? "text-[11px] font-extrabold" : "text-[10px] font-bold"}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot[tone] || dot.neutral}`} />
      {label}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "\u2014";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function listFiltersOf(filters) {
  return {
    category: filters.category,
    status: filters.status,
    expiry: filters.expiry,
  };
}

function CommoditiesFilterMenu({ applied, activeCount, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => listFiltersOf(applied));
  const appliedActive = activeCount > 0;
  const draftIsDefault =
    draft.category === LIST_FILTER_DEFAULTS.category &&
    draft.status === LIST_FILTER_DEFAULTS.status &&
    draft.expiry === LIST_FILTER_DEFAULTS.expiry;

  function handleOpenChange(nextOpen) {
    if (nextOpen) setDraft(listFiltersOf(applied));
    setOpen(nextOpen);
  }

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetDraft() {
    setDraft(LIST_FILTER_DEFAULTS);
  }

  function applyDraft() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="filter"
          size="sm"
          aria-pressed={appliedActive}
          className="gap-2 py-0 pl-1.5 pr-3"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              appliedActive
                ? "bg-white text-brand-700"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={2.1} aria-hidden="true" />
          </span>
          Filter
          {appliedActive && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Filters"
        className="w-[min(calc(100vw-1.5rem),370px)] max-w-[370px] overflow-hidden rounded-card p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">Filters</p>
          <PopoverClose asChild>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-ink-800 ${FOCUS_RING}`}
              aria-label="Close filters"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </PopoverClose>
        </div>
        <div className="grid grid-cols-1 gap-2.5 px-3 py-3 min-[360px]:grid-cols-2">
          <FilterSelect
            id="commodities-stock-filter"
            label="Stock"
            value={draft.status}
            options={BHC_STOCK_FILTER_OPTIONS}
            onChange={(value) => updateDraft("status", value)}
          />
          <FilterSelect
            id="commodities-expiry-filter"
            label="Expiry"
            value={draft.expiry}
            options={BHC_EXPIRY_FILTER_OPTIONS}
            onChange={(value) => updateDraft("expiry", value)}
          />
          <div className="min-[360px]:col-span-2">
            <FilterSelect
              id="commodities-category-filter"
              label="Category"
              value={draft.category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => updateDraft("category", value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={resetDraft}
            disabled={draftIsDefault}
          >
            Reset
          </Button>
          <Button type="button" variant="brand" size="compact" onClick={applyDraft}>
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({ id, label, value, options, onChange }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-wide text-neutral-600"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={FILTER_SELECT}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={2.1}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </div>
  );
}

function AddMedicineButton({ onClick }) {
  return (
    <Button
      type="button"
      variant="brand"
      size="sm"
      onClick={onClick}
      className="shrink-0 px-4"
    >
      + Add Medicine
    </Button>
  );
}

function canManageBhcMedicineInventory(user = {}) {
  return (user.permissions || []).includes("inventory.manage");
}
