import { Link } from "react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Edit3,
  PackagePlus,
  Search,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

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

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Available Items"
          value={availableCount}
          icon={<CheckCircle2 size={17} />}
          color="green"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          icon={<AlertTriangle size={17} />}
          color="amber"
        />
        <StatCard
          title="Unavailable Items"
          value={unavailableCount}
          icon={<XCircle size={17} />}
          color="red"
        />
        <StatCard
          title="Total Items"
          value={items.length}
          icon={<Boxes size={17} />}
          color="navy"
        />
      </div>

      <div className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Item
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search medicine or resource..."
              />
            </div>
          </div>

          <FilterSelect label="Category">
            <option>All Categories</option>
            <option>Basic Medicines</option>
            <option>Vaccines</option>
            <option>Medical Supplies</option>
            <option>Maternal Care Supplies</option>
            <option>Child Health Supplies</option>
            <option>Referral-related Resources</option>
          </FilterSelect>

          <FilterSelect label="Availability">
            <option>All Status</option>
            <option>Available</option>
            <option>Low Stock</option>
            <option>Unavailable</option>
          </FilterSelect>

          <div className="flex items-end">
            <button className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-white px-3 text-xs font-medium text-[#6B7280] hover:bg-[#F9FAFB]">
              Clear Filters
            </button>
          </div>
        </div>
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
            {items.length} items
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
              {items.map((item) => (
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
              ))}
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

function FilterSelect({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none">
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

