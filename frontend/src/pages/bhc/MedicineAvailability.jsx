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
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import RestrictedArea from "../../components/common/access/RestrictedArea";
import {
  ConfirmationModal,
  FixedTable,
  ListToolbar,
  NoticeModal,
  PageStateWrapper,
  RefreshingIndicator,
  SuccessModal,
  TablePagination,
} from "../../components/common";
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

  const activeFilters = [
    filters.category !== "All Categories" && {
      key: "category",
      label: filters.category,
    },
    filters.status !== "All Status" && {
      key: "status",
      label: filters.status,
    },
    filters.expiry !== "All Expiry" && {
      key: "expiry",
      label: filters.expiry,
    },
  ].filter(Boolean);

  const toolbarFilters = [
    {
      key: "category",
      label: "Category",
      value: filters.category,
      options: ["All Categories", ...MEDICINE_CATEGORIES],
    },
    {
      key: "status",
      label: "Stock Status",
      value: filters.status,
      options: BHC_STOCK_FILTER_OPTIONS,
    },
    {
      key: "expiry",
      label: "Expiry Status",
      value: filters.expiry,
      options: BHC_EXPIRY_FILTER_OPTIONS,
    },
  ];

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    if (key === "search") updateFilter("search", "");
    if (key === "category") updateFilter("category", "All Categories");
    if (key === "status") updateFilter("status", "All Status");
    if (key === "expiry") updateFilter("expiry", "All Expiry");
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
    <DashboardLayout role="bhc" title="Medicine Availability">
      <PageStateWrapper skeleton="medicine"
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={safeMedicineItems.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading medicine inventory..."
      >
      <div className="space-y-4">
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) => updateFilter("search", value)}
          searchPlaceholder="Search by medicine name, category, item ID, or notes..."
          filters={toolbarFilters}
          activeFilterCount={
            activeFilters.filter((filter) => filter.key !== "search").length
          }
          activeFilters={activeFilters}
          onApplyFilters={(nextFilters) =>
            setFilters((prev) => ({ ...prev, ...nextFilters }))
          }
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          actions={
            activeTab === "bhc" ? (
              <RestrictedArea
                locked={!canManageBhcInventory}
                label="Stock Management"
                compact
                className="shrink-0 rounded-lg"
                placeholder={<AddMedicineButton />}
              >
                <AddMedicineButton onClick={openAddModal} />
              </RestrictedArea>
            ) : null
          }
        />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit items-center gap-1.5 rounded-lg bg-[#F1F5F9] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("bhc")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
              activeTab === "bhc"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <Package
              size={13}
              className={activeTab === "bhc" ? "text-[#0F172A]" : ""}
            />
            BHC Inventory
            {lowStockCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FEF3C7] px-1 text-[9px] font-bold text-[#B45309]">
                {lowStockCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rhu")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
              activeTab === "rhu"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <Eye
              size={13}
              className={activeTab === "rhu" ? "text-[#0F172A]" : ""}
            />
            RHU Availability
            <span className="rounded-md bg-[#FEF2F2] px-1.5 py-0.5 text-[9px] font-bold text-[#B91C1C]">
              View-only
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              {activeTab === "bhc"
                ? "BHC Medicine Inventory"
                : "RHU Medicine Availability"}
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              {activeTab === "bhc"
                ? "Local BHC stock managed by BHC staff."
                : "Read-only RHU availability for referral planning."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isFetching && safeMedicineItems.length > 0 && (
              <RefreshingIndicator label="Updating medicine inventory..." />
            )}
            <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
              {filteredItems.length} of {activeItems.length} items
            </span>
          </div>
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

function AddMedicineButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
    >
      <Plus size={15} />
      Add Medicine
    </button>
  );
}

function canManageBhcMedicineInventory(user = {}) {
  return (user.permissions || []).includes("inventory.manage");
}
