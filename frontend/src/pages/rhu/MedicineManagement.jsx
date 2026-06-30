import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Edit3,
  MoreVertical,
  PackagePlus,
  Trash2,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar, TablePagination } from "../../components/common";
import MedicineFormModal from "../../components/features/medicine/MedicineFormModal";
import {
  addRhuMedicine,
  deleteRhuMedicine,
  formatMedicineQuantity,
  getMedicineExpiryStatus,
  getRhuMedicines,
  MEDICINE_CATEGORIES,
  refreshRhuMedicines,
  RHU_MEDICINES_UPDATED_EVENT,
  updateRhuMedicine,
} from "../../services/medicineService";

const MEDICINE_STATUS_TABS = [
  { key: "All Status", label: "All Items", icon: Boxes },
  { key: "Available", label: "Available", icon: CheckCircle2 },
  { key: "Low Stock", label: "Low Stock", icon: AlertTriangle },
  { key: "Unavailable", label: "Unavailable", icon: XCircle },
];

const DEFAULT_FILTERS = {
  search: "",
  category: "All Categories",
  status: "All Status",
  expiry: "All Expiry",
};

export default function MedicineManagement() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openMenuId, setOpenMenuId] = useState("");

  useEffect(() => {
    async function loadItems() {
      setItems(getRhuMedicines());
      setItems(await refreshRhuMedicines());
    }

    loadItems();

    window.addEventListener(RHU_MEDICINES_UPDATED_EVENT, loadItems);

    return () => {
      window.removeEventListener(RHU_MEDICINES_UPDATED_EVENT, loadItems);
    };
  }, []);

  const filteredItems = useMemo(
    () => filterMedicineItems(items, filters),
    [items, filters],
  );

  const tabCounts = useMemo(() => {
    const baseItems = filterMedicineItems(items, {
      ...filters,
      status: "All Status",
    });

    return MEDICINE_STATUS_TABS.reduce((acc, tab) => {
      acc[tab.key] =
        tab.key === "All Status"
          ? baseItems.length
          : baseItems.filter((item) => item.status === tab.key).length;
      return acc;
    }, {});
  }, [items, filters]);

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

  async function handleSubmit(payload) {
    const nextItems =
      modalMode === "edit" && selectedItem
        ? await updateRhuMedicine(selectedItem.id, payload)
        : await addRhuMedicine(payload);

    setItems(nextItems);
    closeModal();
  }

  async function handleDelete(item) {
    setOpenMenuId("");
    const confirmed = window.confirm(`Delete ${item.name} from RHU inventory?`);
    if (!confirmed) return;
    setItems(await deleteRhuMedicine(item.id));
  }

  return (
    <DashboardLayout role="rhu" title="Medicine Management">
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
          <button
            type="button"
            onClick={openAddModal}
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
          >
            <PackagePlus size={15} />
            Add Medicine
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1">
        {MEDICINE_STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filters.status === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => updateFilter("status", tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700"
              }`}
            >
              <Icon size={12} className={isActive ? "text-[#0F172A]" : ""} />
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                  isActive
                    ? "bg-[#FEF2F2] text-[#B91C1C]"
                    : "bg-slate-300/70 text-slate-600"
                }`}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Medicine and Resource Inventory
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Items shown here are visible to BHC users as RHU medicine
              availability.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {filteredItems.length} of {items.length} items
          </span>
        </div>

        <div className="w-full flex-1 overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left">
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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-0 text-center">
                    <div className="flex min-h-[260px] flex-col items-center justify-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6]">
                        <Boxes size={20} className="text-[#9CA3AF]" />
                      </div>
                      <p className="text-sm font-semibold text-[#0F172A]">
                        No medicines yet. Tap Add Medicine to start.
                      </p>
                      <p className="mt-1 text-xs text-[#9CA3AF]">
                        Try adjusting your search or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
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

                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <ActionMenu
                        item={item}
                        open={openMenuId === item.id}
                        onToggle={() =>
                          setOpenMenuId(openMenuId === item.id ? "" : item.id)
                        }
                        onClose={() => setOpenMenuId("")}
                        onEdit={() => openEditModal(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-auto">
          <TablePagination currentPage={1} totalPages={1} />
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
    </DashboardLayout>
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
