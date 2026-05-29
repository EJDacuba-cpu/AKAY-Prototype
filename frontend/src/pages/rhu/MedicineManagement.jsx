import { Link } from "react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Edit3,
  PackagePlus,
  RotateCcw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

const MEDICINE_STATUS_TABS = [
  { key: "All Status", label: "All Items", icon: Boxes },
  { key: "Available", label: "Available", icon: CheckCircle2 },
  { key: "Low Stock", label: "Low Stock", icon: AlertTriangle },
  { key: "Unavailable", label: "Unavailable", icon: XCircle },
];

export default function MedicineManagement() {
  const [items, setItems] = useState([
    {
      id: "MED-001",
      name: "Paracetamol",
      category: "Basic Medicines",
      quantity: 120,
      unit: "pcs",
      status: "Available",
      lastUpdated: "May 14, 2026",
      notes: "Available for common fever and pain cases.",
    },
    {
      id: "MED-002",
      name: "Amoxicillin",
      category: "Basic Medicines",
      quantity: 15,
      unit: "pcs",
      status: "Low Stock",
      lastUpdated: "May 14, 2026",
      notes: "Limited supply. Coordinate before referral.",
    },
    {
      id: "MED-003",
      name: "Tetanus Vaccine",
      category: "Vaccines",
      quantity: 0,
      unit: "vials",
      status: "Unavailable",
      lastUpdated: "May 14, 2026",
      notes: "Currently unavailable.",
    },
    {
      id: "MED-004",
      name: "Prenatal Vitamins",
      category: "Maternal Care Supplies",
      quantity: 45,
      unit: "pcs",
      status: "Available",
      lastUpdated: "May 13, 2026",
      notes: "Available for maternal care referrals.",
    },
    {
      id: "MED-005",
      name: "Syringe",
      category: "Medical Supplies",
      quantity: 20,
      unit: "pcs",
      status: "Low Stock",
      lastUpdated: "May 13, 2026",
      notes: "Low supply. Restock needed soon.",
    },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [filterStatus, setFilterStatus] = useState("All Status");

  function updateStatus(id, newStatus) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: newStatus,
              lastUpdated: "May 14, 2026",
            }
          : item,
      ),
    );
  }

  const availableCount = items.filter(
    (item) => item.status === "Available",
  ).length;

  const lowStockCount = items.filter(
    (item) => item.status === "Low Stock",
  ).length;

  const unavailableCount = items.filter(
    (item) => item.status === "Unavailable",
  ).length;

  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query);
    const matchesCategory =
      filterCategory === "All Categories" || item.category === filterCategory;
    const matchesStatus =
      filterStatus === "All Status" || item.status === filterStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const activeFilters = [
    searchQuery && { key: "search", label: searchQuery },
    filterCategory !== "All Categories" && {
      key: "category",
      label: filterCategory,
    },
    filterStatus !== "All Status" && { key: "status", label: filterStatus },
  ].filter(Boolean);

  const hasActiveFilters = activeFilters.length > 0;

  function clearFilters() {
    setSearchQuery("");
    setFilterCategory("All Categories");
    setFilterStatus("All Status");
  }

  function removeFilter(key) {
    if (key === "search") setSearchQuery("");
    if (key === "category") setFilterCategory("All Categories");
    if (key === "status") setFilterStatus("All Status");
  }

  return (
    <DashboardLayout role="rhu" title="Medicine Management">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Medicine Management
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Update RHU medicine and referral-related resource availability.
          </p>
        </div>

        <Link
          to="/rhu/medicine-management/add"
          className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#092347]"
        >
          <PackagePlus size={15} />
          Add Item
        </Link>
      </div>

      <div className="mb-4 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid items-end gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Medicine / Item ID
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search medicine name or item ID..."
              />
            </div>
          </div>

          <FilterSelect
            label="Category"
            value={filterCategory}
            onChange={setFilterCategory}
          >
            <option>All Categories</option>
            <option>Basic Medicines</option>
            <option>Vaccines</option>
            <option>Medical Supplies</option>
            <option>Maternal Care Supplies</option>
            <option>Child Health Supplies</option>
            <option>Referral-related Resources</option>
          </FilterSelect>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => removeFilter(filter.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
              >
                {filter.label}
                <X size={10} />
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#0B2E59]"
              >
                <RotateCcw size={11} />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1">
        {MEDICINE_STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filterStatus === tab.key;
          const count =
            tab.key === "All Status"
              ? items.length
              : items.filter((item) => item.status === tab.key).length;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterStatus(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700"
              }`}
            >
              <Icon size={12} className={isActive ? "text-[#0B2E59]" : ""} />
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                  isActive
                    ? "bg-[#0B2E59]/10 text-[#0B2E59]"
                    : "bg-slate-300/70 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Medicine and Resource Inventory
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Items shown here are visible to BHC users as medicine
              availability.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {filteredItems.length} of {items.length} items
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Item ID</th>
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6]">
                      <Boxes size={20} className="text-[#9CA3AF]" />
                    </div>
                    <p className="text-sm font-semibold text-[#0B2E59]">
                      No medicines found
                    </p>
                    <p className="mt-1 text-xs text-[#9CA3AF]">
                      Try adjusting your search or filters.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0B2E59]">
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
                    {item.quantity} {item.unit}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={item.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                    {item.lastUpdated}
                  </td>

                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.notes}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <Edit3 size={14} />
                      </button>

                      <button
                        onClick={() => updateStatus(item.id, "Available")}
                        className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Available
                      </button>

                      <button
                        onClick={() => updateStatus(item.id, "Low Stock")}
                        className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Low
                      </button>

                      <button
                        onClick={() => updateStatus(item.id, "Unavailable")}
                        className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        None
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span> Medicine
          Management is for RHU availability tracking only. It supports referral
          coordination but does not handle pharmacy dispensing, billing, or
          prescription transactions.
        </p>
      </div>
    </DashboardLayout>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none"
      >
        {children}
      </select>
    </div>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`flex-shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Available: "bg-emerald-50 text-emerald-700",
    "Low Stock": "bg-amber-50 text-amber-700",
    Unavailable: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function CategoryBadge({ category }) {
  const map = {
    "Basic Medicines": "bg-blue-50 text-blue-700",
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

