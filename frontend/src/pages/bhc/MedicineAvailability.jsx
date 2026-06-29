import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes,
  Edit3,
  Eye,
  MoreVertical,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import MedicineFormModal from "../../components/features/medicine/MedicineFormModal";
import {
  addBhcMedicine,
  BHC_MEDICINES_UPDATED_EVENT,
  deleteBhcMedicine,
  formatMedicineQuantity,
  getBhcMedicines,
  getMedicineExpiryStatus,
  getRhuMedicines,
  MEDICINE_CATEGORIES,
  RHU_MEDICINES_UPDATED_EVENT,
  updateBhcMedicine,
} from "../../services/medicineService";

const DEFAULT_FILTERS = {
  search: "",
  category: "All Categories",
  status: "All Status",
  expiry: "All Expiry",
};

export default function MedicineAvailability() {
  const [activeTab, setActiveTab] = useState("bhc");
  const [bhcItems, setBhcItems] = useState([]);
  const [rhuItems, setRhuItems] = useState([]);
  const [bhcFilters, setBhcFilters] = useState(DEFAULT_FILTERS);
  const [rhuFilters, setRhuFilters] = useState(DEFAULT_FILTERS);
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openMenuId, setOpenMenuId] = useState("");

  useEffect(() => {
    function loadBhcItems() {
      setBhcItems(getBhcMedicines());
    }

    function loadRhuItems() {
      setRhuItems(getRhuMedicines());
    }

    function loadAllItems() {
      loadBhcItems();
      loadRhuItems();
    }

    loadAllItems();

    window.addEventListener(BHC_MEDICINES_UPDATED_EVENT, loadBhcItems);
    window.addEventListener(RHU_MEDICINES_UPDATED_EVENT, loadRhuItems);

    return () => {
      window.removeEventListener(BHC_MEDICINES_UPDATED_EVENT, loadBhcItems);
      window.removeEventListener(RHU_MEDICINES_UPDATED_EVENT, loadRhuItems);
    };
  }, []);

  const activeItems = activeTab === "bhc" ? bhcItems : rhuItems;
  const filters = activeTab === "bhc" ? bhcFilters : rhuFilters;
  const setFilters = activeTab === "bhc" ? setBhcFilters : setRhuFilters;

  const filteredItems = useMemo(
    () => filterMedicineItems(activeItems, filters),
    [activeItems, filters],
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
      options: ["All Status", "Available", "Low Stock", "Unavailable"],
    },
    {
      key: "expiry",
      label: "Expiry Status",
      value: filters.expiry,
      options: ["All Expiry", "Valid", "Expiring Soon", "Expired"],
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

  function handleSubmit(payload) {
    const nextItems =
      modalMode === "edit" && selectedItem
        ? updateBhcMedicine(selectedItem.id, payload)
        : addBhcMedicine(payload);

    setBhcItems(nextItems);
    closeModal();
  }

  function handleDelete(item) {
    setOpenMenuId("");
    const confirmed = window.confirm(`Delete ${item.name} from BHC inventory?`);
    if (!confirmed) return;
    setBhcItems(deleteBhcMedicine(item.id));
  }

  return (
    <DashboardLayout role="bhc" title="Medicine Availability">
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
            <button
              type="button"
              onClick={openAddModal}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
            >
              <Plus size={15} />
              Add Medicine
            </button>
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

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
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

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {filteredItems.length} of {activeItems.length} items
          </span>
        </div>

        <MedicineTable
          items={filteredItems}
          editable={activeTab === "bhc"}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onEdit={openEditModal}
          onDelete={handleDelete}
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
    </DashboardLayout>
  );
}

function MedicineTable({
  items,
  editable,
  openMenuId,
  setOpenMenuId,
  onEdit,
  onDelete,
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left">
        <thead>
          <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            <th className="px-6 py-3">Item ID</th>
            <th className="px-4 py-3">Medicine / Supply Name</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Quantity + Unit</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Expiry Date</th>
            <th className="px-4 py-3">Last Updated</th>
            <th className="px-4 py-3">Notes</th>
            {editable && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>

        <tbody className="divide-y divide-[#F3F4F6]">
          {items.length === 0 ? (
            <tr>
              <td colSpan={editable ? 9 : 8} className="px-6 py-20 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6]">
                  <Boxes size={20} className="text-[#9CA3AF]" />
                </div>
                <p className="text-sm font-semibold text-[#0F172A]">
                  No medicines yet.
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Try adjusting your search or filters.
                </p>
              </td>
            </tr>
          ) : (
            items.map((item) => (
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

                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                  {formatMedicineQuantity(item)}
                </td>

                <td className="whitespace-nowrap px-4 py-3.5">
                  <StatusBadge status={item.status} />
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                  <div className="flex flex-col gap-1">
                    <span>{formatDate(item.expiryDate)}</span>
                    <ExpiryBadge status={getMedicineExpiryStatus(item)} />
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                  <div>
                    <p>{item.lastUpdated}</p>
                    <p className="mt-0.5 text-[10px] text-[#BCC3CD]">
                      {item.updatedBy}
                    </p>
                  </div>
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
                      onDelete={() => onDelete(item)}
                    />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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
      item.updatedBy,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const matchesCategory =
      filters.category === "All Categories" ||
      item.category === filters.category;
    const matchesStatus =
      filters.status === "All Status" || item.status === filters.status;
    const matchesExpiry =
      filters.expiry === "All Expiry" ||
      getMedicineExpiryStatus(item) === filters.expiry;

    return matchesSearch && matchesCategory && matchesStatus && matchesExpiry;
  });
}

function ActionMenu({ item, open, onToggle, onClose, onEdit, onDelete }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function updatePosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 96;
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

function StatusBadge({ status }) {
  const map = {
    Available: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Low Stock": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Unavailable: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {status}
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

function ExpiryBadge({ status }) {
  const map = {
    Valid: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Expiring Soon": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Expired: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`w-fit rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[status] || map.Valid
      }`}
    >
      {status}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
