import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Edit3,
  Eye,
  History,
  MoreVertical,
  Package,
  PackagePlus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import RestrictedArea from "../../components/common/access/RestrictedArea";
import {
  ConfirmationModal,
  FixedTable,
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
import usePagedRows from "../../hooks/usePagedRows";
import { resetKeyOf } from "../../utils/tablePaging";
import MedicineFormModal from "../../components/features/medicine/MedicineFormModal";
import MedicineInventoryActionModal from "../../components/features/medicine/MedicineInventoryActionModal";
import MedicineInventoryHistoryModal from "../../components/features/medicine/MedicineInventoryHistoryModal";
import {
  addBhcMedicine,
  adjustMedicine,
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
  expiryStatusTone,
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
const PILL_FILTER =
  "inline-flex h-9 items-center gap-2 rounded-full border py-0 pl-1.5 pr-3 text-[13px] font-medium shadow-xs transition-colors";
const FILTER_SELECT =
  "h-8 w-full min-w-0 rounded-none border border-neutral-200 bg-white px-2.5 text-[13px] text-ink-800 shadow-xs outline-none transition-colors hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";
const PILL_SECONDARY =
  "inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12px] font-medium text-neutral-700 shadow-xs transition-colors hover:bg-neutral-50";
const PILL_PRIMARY =
  "inline-flex h-8 items-center justify-center rounded-full bg-brand-600 px-3.5 text-[12px] font-medium text-white shadow-xs transition-colors hover:bg-brand-700";

export default function MedicineAvailability() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const canManageBhcInventory = canManageBhcMedicineInventory(currentUser);
  const [activeTab, setActiveTab] = useState("bhc");
  const [bhcFilters, setBhcFilters] = useState(DEFAULT_FILTERS);
  const [rhuFilters, setRhuFilters] = useState(DEFAULT_FILTERS);
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openMenuId, setOpenMenuId] = useState("");
  const [inventoryAction, setInventoryAction] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [successNotice, setSuccessNotice] = useState(null);
  const deleteGateRef = useRef(null);
  if (!deleteGateRef.current) deleteGateRef.current = createSubmitGate();
  const {
    data: medicineItems = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.medicineAvailability("bhc"),
    queryFn: loadMedicineAvailability,
    retry: false,
  });

  const safeMedicineItems = useMemo(
    () => (Array.isArray(medicineItems) ? medicineItems : []),
    [medicineItems],
  );
  const bhcItems = useMemo(
    () => safeMedicineItems.filter((item) => !item.ruralHealthUnitId),
    [safeMedicineItems],
  );
  const rhuItems = useMemo(
    () => safeMedicineItems.filter((item) => item.ruralHealthUnitId),
    [safeMedicineItems],
  );

  const activeItems = activeTab === "bhc" ? bhcItems : rhuItems;
  const filters = activeTab === "bhc" ? bhcFilters : rhuFilters;
  const setFilters = activeTab === "bhc" ? setBhcFilters : setRhuFilters;

  const filteredItems = useMemo(
    () => filterMedicineItems(activeItems, filters),
    [activeItems, filters],
  );
  const { page, setPage, totalPages, pageRows } = usePagedRows(
    filteredItems,
    resetKeyOf(activeTab, filters),
  );

  const lowStockCount = bhcItems.filter(
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
  const itemsWord = activeItems.length === 1 ? "item" : "items";

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
        ? await updateBhcMedicine(selectedItem.id, payload)
        : await addBhcMedicine(payload, options);

    queryClient.setQueryData(
      queryKeys.medicineAvailability("bhc"),
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
        queryKeys.medicineAvailability("bhc"),
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
        queryKeys.medicineAvailability("bhc"),
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

  async function handleInventoryAction(payload) {
    const result =
      inventoryAction === "restock"
        ? await restockMedicine(selectedItem.id, payload)
        : await adjustMedicine(selectedItem.id, payload);
    queryClient.setQueryData(
      queryKeys.medicineAvailability("bhc"),
      Array.isArray(result.items) ? result.items : [],
    );
    await queryClient.invalidateQueries({
      queryKey: queryKeys.medicineAvailability("bhc"),
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
              Review BHC stock and RHU availability.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CommoditiesFilterMenu
              key={activeTab}
              applied={listFiltersOf(filters)}
              activeCount={activeFilterChips.length}
              onApply={applyListFilters}
            />
            {activeTab === "bhc" ? (
              <RestrictedArea
                locked={!canManageBhcInventory}
                label="Stock Management"
                compact
                className="shrink-0 rounded-full"
                placeholder={<AddMedicineButton />}
              >
                <AddMedicineButton onClick={openAddModal} />
              </RestrictedArea>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div
            role="tablist"
            aria-label="Inventory source"
            className="flex w-fit items-center gap-0.5 rounded-full bg-neutral-100 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "bhc"}
              onClick={() => setActiveTab("bhc")}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
                activeTab === "bhc"
                  ? "bg-white text-ink-800 shadow-xs"
                  : "text-neutral-600 hover:text-ink-800"
              }`}
            >
              <Package size={13} aria-hidden="true" />
              BHC Inventory
              {lowStockCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-800">
                  {lowStockCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "rhu"}
              onClick={() => setActiveTab("rhu")}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
                activeTab === "rhu"
                  ? "bg-white text-ink-800 shadow-xs"
                  : "text-neutral-600 hover:text-ink-800"
              }`}
            >
              <Eye size={13} aria-hidden="true" />
              RHU Availability
              <span className="rounded-full bg-brand-50 px-1.5 py-px text-[9px] font-bold text-brand-700">
                View-only
              </span>
            </button>
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

      <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2">
          <span aria-live="polite" className="text-[12px] text-neutral-600">
            {narrowed
              ? `Showing ${filteredItems.length} of ${activeItems.length} ${itemsWord}`
              : `${activeItems.length} ${itemsWord}`}
          </span>
          {isFetching && safeMedicineItems.length > 0 && (
            <RefreshingIndicator label="Updating medicine inventory..." />
          )}
        </div>

        <MedicineTable
          items={pageRows}
          editable={activeTab === "bhc" && canManageBhcInventory}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onEdit={openEditModal}
          onRestock={(item) => openInventoryAction(item, "restock")}
          onAdjust={(item) => openInventoryAction(item, "adjust")}
          onHistory={openInventoryHistory}
          onDelete={requestDelete}
        />

        <div className="mt-auto">
          <TablePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
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

function MedicineTable({
  items,
  editable,
  openMenuId,
  setOpenMenuId,
  onEdit,
  onRestock,
  onAdjust,
  onHistory,
  onDelete,
}) {
  return (
    <FixedTable minWidth="min-w-[1120px]">
        <thead>
          <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            <th className="px-6 py-3">Item ID</th>
            <th className="px-4 py-3">Medicine / Supply Name</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Quantity + Unit</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Expiry</th>
            <th className="px-4 py-3">Last Updated</th>
            <th className="px-4 py-3">Notes</th>
            {editable && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>

        <tbody className="divide-y divide-[#F3F4F6]">
          {items.length === 0 ? (
            <tr>
              <td colSpan={editable ? 9 : 8} className="px-6 py-0 text-center">
                <div className="flex min-h-[var(--akay-empty-h,260px)] flex-col items-center justify-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6]">
                    <Boxes size={20} className="text-[#9CA3AF]" />
                  </div>
                  <p className="text-sm font-semibold text-[#0F172A]">
                    No medicines yet.
                  </p>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    Try adjusting your search or filters.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const inventory = getMedicineInventoryView(item);
              return (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                <td className="whitespace-nowrap px-6 py-3.5">
                  <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0F172A]">
                    {item.id}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3.5">
                  <p className="text-sm font-semibold text-[#1A1A1A]">
                    {item.name}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3.5">
                  <CategoryBadge category={item.category} />
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium tabular-nums text-[#111827]">
                  {formatMedicineQuantity(item)}
                </td>

                <td className="px-4 py-3.5">
                  <div className="flex flex-col items-start gap-1">
                    <InventoryStamp
                      label={inventory.stockStatus}
                      tone={stockStatusTone(inventory.stockStatus)}
                    />
                    {inventory.reconciliationRequired && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#b45309]">
                        Reconciliation Required
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3.5">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-sm text-[#4b5563]">
                      {inventory.expiryDateLabel}
                    </span>
                    <InventoryStamp
                      label={inventory.expiryStatus}
                      tone={expiryStatusTone(inventory.expiryStatus)}
                      prominent={
                        inventory.expiryStatus === "Expired" ||
                        inventory.expiryStatus === "Expires Today"
                      }
                    />
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                  {formatDateTime(
                    item.updated_at ||
                      item.updatedAt ||
                      item.created_at ||
                      item.createdAt ||
                      item.lastUpdated,
                  )}
                </td>

                <td className="max-w-[220px] truncate px-4 py-3.5 text-sm text-[#6B7280]">
                  {item.notes || "-"}
                </td>

                {editable && (
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <ActionMenu
                      item={item}
                      open={openMenuId === item.id}
                      onToggle={() =>
                        setOpenMenuId(openMenuId === item.id ? "" : item.id)
                      }
                      onClose={() => setOpenMenuId("")}
                      onEdit={() => onEdit(item)}
                      onRestock={() => onRestock(item)}
                      onAdjust={() => onAdjust(item)}
                      onHistory={() => onHistory(item)}
                      onDelete={() => onDelete(item)}
                    />
                  </td>
                )}
                </tr>
              );
            })
          )}
        </tbody>
    </FixedTable>
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
  onToggle,
  onClose,
  onEdit,
  onRestock,
  onAdjust,
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
    if (!open) return;

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

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);
    return () => {
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
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white text-[#9CA3AF] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
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
                onAdjust();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#0F172A]"
            >
              <SlidersHorizontal size={14} className="text-[#9CA3AF]" />
              Adjust Stock
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

function CategoryBadge({ category }) {
  const map = {
    "Basic Medicines": "bg-slate-100 text-slate-700",
    Vaccines: "bg-violet-50 text-violet-700",
    "Medical Supplies": "bg-slate-100 text-slate-600",
    "Maternal Care Supplies": "bg-rose-50 text-rose-700",
    "Child Health Supplies": "bg-emerald-50 text-emerald-700",
    "Referral-related Resources": "bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[category] || "bg-slate-100 text-slate-600"
      }`}
    >
      {category}
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
        <button
          type="button"
          className={`${PILL_FILTER} ${FOCUS_RING} ${
            appliedActive
              ? "border-brand-200 bg-brand-50 text-brand-800"
              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
          }`}
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
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Filters"
        className="w-[min(calc(100vw-1.5rem),370px)] max-w-[370px] overflow-visible rounded-none p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">Filters</p>
          <PopoverClose asChild>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-none text-neutral-500 hover:bg-neutral-100 hover:text-ink-800 ${FOCUS_RING}`}
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
          <button
            type="button"
            onClick={resetDraft}
            disabled={draftIsDefault}
            className={`${PILL_SECONDARY} ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={applyDraft}
            className={`${PILL_PRIMARY} ${FOCUS_RING}`}
          >
            Apply Filters
          </button>
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
    </div>
  );
}

function AddMedicineButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-brand-600 px-4 text-[13px] font-medium text-white shadow-xs transition-colors hover:bg-brand-700 ${FOCUS_RING}`}
    >
      + Add Medicine
    </button>
  );
}

function canManageBhcMedicineInventory(user = {}) {
  return (user.permissions || []).includes("inventory.manage");
}
