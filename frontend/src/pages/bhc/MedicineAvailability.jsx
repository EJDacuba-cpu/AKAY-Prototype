import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Search,
  XCircle,
  Eye,
  Pill,
  Stethoscope,
  Plus,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  X,
  Package,
  TrendingDown,
  TrendingUp,
  History,
  RotateCcw,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes overlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-count   { animation: countUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-slide-in { animation: slideIn 0.35s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-overlay  { animation: overlayIn 0.25s ease both; }
  .shake { animation: shake 0.3s ease; }
`;

const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Data ─── */
const initialBHCItems = [
  {
    id: "BHC-001",
    name: "Paracetamol 500mg",
    category: "Basic Medicines",
    quantity: 85,
    unit: "pcs",
    status: "Available",
    threshold: 20,
    lastUpdated: "May 13, 2026",
    updatedBy: "Midwife Cruz",
    notes: "For common fever and pain.",
    history: [
      {
        date: "May 13, 2026",
        type: "out",
        qty: 5,
        note: "Dispensed to patient",
      },
      { date: "May 12, 2026", type: "in", qty: 30, note: "Restocked from RHU" },
      {
        date: "May 10, 2026",
        type: "out",
        qty: 10,
        note: "Dispensed to patients",
      },
    ],
  },
  {
    id: "BHC-002",
    name: "Amoxicillin 250mg",
    category: "Basic Medicines",
    quantity: 12,
    unit: "pcs",
    status: "Low Stock",
    threshold: 20,
    lastUpdated: "May 13, 2026",
    updatedBy: "Midwife Cruz",
    notes: "Antibiotic for bacterial infections.",
    history: [
      {
        date: "May 13, 2026",
        type: "out",
        qty: 8,
        note: "Dispensed to patients",
      },
      { date: "May 9, 2026", type: "in", qty: 20, note: "Restocked from RHU" },
    ],
  },
  {
    id: "BHC-003",
    name: "Oral Rehydration Salts",
    category: "Basic Medicines",
    quantity: 60,
    unit: "sachets",
    status: "Available",
    threshold: 15,
    lastUpdated: "May 12, 2026",
    updatedBy: "BHW Santos",
    notes: "For dehydration cases.",
    history: [
      {
        date: "May 12, 2026",
        type: "out",
        qty: 5,
        note: "Dispensed to patient",
      },
      { date: "May 8, 2026", type: "in", qty: 40, note: "Restocked from RHU" },
    ],
  },
  {
    id: "BHC-004",
    name: "Prenatal Vitamins",
    category: "Maternal Care Supplies",
    quantity: 30,
    unit: "pcs",
    status: "Available",
    threshold: 10,
    lastUpdated: "May 11, 2026",
    updatedBy: "Midwife Cruz",
    notes: "For pregnant mothers in the area.",
    history: [
      {
        date: "May 11, 2026",
        type: "out",
        qty: 5,
        note: "Distributed to prenatal patients",
      },
      { date: "May 5, 2026", type: "in", qty: 50, note: "Restocked from RHU" },
    ],
  },
  {
    id: "BHC-005",
    name: "Disposable Syringe 5ml",
    category: "Medical Supplies",
    quantity: 8,
    unit: "pcs",
    status: "Low Stock",
    threshold: 15,
    lastUpdated: "May 13, 2026",
    updatedBy: "BHW Santos",
    notes: "For injections and vaccinations.",
    history: [
      {
        date: "May 13, 2026",
        type: "out",
        qty: 7,
        note: "Used for vaccination",
      },
      { date: "May 6, 2026", type: "in", qty: 30, note: "Restocked from RHU" },
    ],
  },
  {
    id: "BHC-006",
    name: "Cotton Balls",
    category: "Medical Supplies",
    quantity: 0,
    unit: "packs",
    status: "Unavailable",
    threshold: 5,
    lastUpdated: "May 10, 2026",
    updatedBy: "BHW Santos",
    notes: "Out of stock. Pending RHU restock.",
    history: [
      {
        date: "May 10, 2026",
        type: "out",
        qty: 5,
        note: "Used up during clinic day",
      },
    ],
  },
  {
    id: "BHC-007",
    name: "Ibuprofen 200mg",
    category: "Basic Medicines",
    quantity: 45,
    unit: "pcs",
    status: "Available",
    threshold: 15,
    lastUpdated: "May 12, 2026",
    updatedBy: "Midwife Cruz",
    notes: "For pain and inflammation.",
    history: [
      {
        date: "May 12, 2026",
        type: "out",
        qty: 5,
        note: "Dispensed to patients",
      },
      { date: "May 7, 2026", type: "in", qty: 50, note: "Restocked from RHU" },
    ],
  },
  {
    id: "BHC-008",
    name: "Antiseptic Solution",
    category: "Medical Supplies",
    quantity: 3,
    unit: "bottles",
    status: "Low Stock",
    threshold: 5,
    lastUpdated: "May 11, 2026",
    updatedBy: "BHW Santos",
    notes: "For wound cleaning and disinfection.",
    history: [
      {
        date: "May 11, 2026",
        type: "out",
        qty: 2,
        note: "Used during wound care",
      },
      { date: "May 3, 2026", type: "in", qty: 10, note: "Restocked from RHU" },
    ],
  },
];

const rhuItems = [
  {
    id: "MED-001",
    name: "Paracetamol",
    category: "Basic Medicines",
    quantity: "120 pcs",
    status: "Available",
    lastUpdated: "May 13, 2026",
    notes: "Available for common fever and pain cases.",
  },
  {
    id: "MED-002",
    name: "Amoxicillin",
    category: "Basic Medicines",
    quantity: "15 pcs",
    status: "Low Stock",
    lastUpdated: "May 13, 2026",
    notes: "Limited supply. Coordinate with RHU before referral.",
  },
  {
    id: "MED-003",
    name: "Tetanus Vaccine",
    category: "Vaccines",
    quantity: "0 pcs",
    status: "Unavailable",
    lastUpdated: "May 13, 2026",
    notes: "Currently unavailable at RHU.",
  },
  {
    id: "MED-004",
    name: "Prenatal Vitamins",
    category: "Maternal Care Supplies",
    quantity: "45 pcs",
    status: "Available",
    lastUpdated: "May 12, 2026",
    notes: "Available for maternal care referrals.",
  },
  {
    id: "MED-005",
    name: "Syringe",
    category: "Medical Supplies",
    quantity: "20 pcs",
    status: "Low Stock",
    lastUpdated: "May 12, 2026",
    notes: "Low supply. RHU update required soon.",
  },
  {
    id: "MED-006",
    name: "Oral Rehydration Salts",
    category: "Basic Medicines",
    quantity: "80 pcs",
    status: "Available",
    lastUpdated: "May 11, 2026",
    notes: "Available for dehydration-related cases.",
  },
];

const categories = [
  "Basic Medicines",
  "Vaccines",
  "Medical Supplies",
  "Maternal Care Supplies",
  "Child Health Supplies",
  "Referral-related Resources",
];
const units = [
  "pcs",
  "sachets",
  "bottles",
  "packs",
  "vials",
  "boxes",
  "ml",
  "mg",
];

/* ─── Main ─── */
export default function MedicineInventory() {
  const [activeTab, setActiveTab] = useState("bhc");
  const [bhcItems, setBhcItems] = useState(initialBHCItems);

  const [bhcFilters, setBhcFilters] = useState({
    search: "",
    category: "All Categories",
    status: "All Status",
  });
  const [rhuFilters, setRhuFilters] = useState({
    search: "",
    category: "All Categories",
    status: "All Status",
  });

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Selected item
  const [selectedItem, setSelectedItem] = useState(null);

  // Form states
  const [addForm, setAddForm] = useState({
    name: "",
    category: "Basic Medicines",
    quantity: "",
    unit: "pcs",
    threshold: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    quantity: "",
    unit: "",
    threshold: "",
    notes: "",
  });
  const [stockForm, setStockForm] = useState({ type: "in", qty: "", note: "" });

  // Sort state
  const [sortField, setSortField] = useState("id");
  const [sortDir, setSortDir] = useState("asc");

  // Computed stats for BHC
  const bhcStats = {
    available: bhcItems.filter((i) => i.status === "Available").length,
    lowStock: bhcItems.filter((i) => i.status === "Low Stock").length,
    unavailable: bhcItems.filter((i) => i.status === "Unavailable").length,
    total: bhcItems.length,
  };

  // Filtered BHC items
  const filteredBHC = bhcItems
    .filter((item) => {
      const matchSearch =
        !bhcFilters.search ||
        item.name.toLowerCase().includes(bhcFilters.search.toLowerCase()) ||
        item.id.toLowerCase().includes(bhcFilters.search.toLowerCase());
      const matchCat =
        bhcFilters.category === "All Categories" ||
        item.category === bhcFilters.category;
      const matchStatus =
        bhcFilters.status === "All Status" || item.status === bhcFilters.status;
      return matchSearch && matchCat && matchStatus;
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "quantity") {
        valA = a.quantity;
        valB = b.quantity;
      } else if (sortField === "category") {
        valA = a.category.toLowerCase();
        valB = b.category.toLowerCase();
      } else if (sortField === "status") {
        valA = a.status;
        valB = b.status;
      } else {
        valA = a.id;
        valB = b.id;
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  // Filtered RHU items
  const filteredRHU = rhuItems.filter((item) => {
    const matchSearch =
      !rhuFilters.search ||
      item.name.toLowerCase().includes(rhuFilters.search.toLowerCase()) ||
      item.id.toLowerCase().includes(rhuFilters.search.toLowerCase());
    const matchCat =
      rhuFilters.category === "All Categories" ||
      item.category === rhuFilters.category;
    const matchStatus =
      rhuFilters.status === "All Status" || item.status === rhuFilters.status;
    return matchSearch && matchCat && matchStatus;
  });

  const computeStatus = (qty, threshold) => {
    if (qty <= 0) return "Unavailable";
    if (qty <= threshold) return "Low Stock";
    return "Available";
  };

  const nextId = () => {
    const maxNum = bhcItems.reduce((max, item) => {
      const num = parseInt(item.id.replace("BHC-", ""), 10);
      return num > max ? num : max;
    }, 0);
    return `BHC-${String(maxNum + 1).padStart(3, "0")}`;
  };

  const today = () =>
    new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Handlers
  const handleAdd = () => {
    const qty = parseInt(addForm.quantity, 10) || 0;
    const threshold = parseInt(addForm.threshold, 10) || 10;
    if (!addForm.name.trim()) return;
    const newItem = {
      id: nextId(),
      name: addForm.name.trim(),
      category: addForm.category,
      quantity: qty,
      unit: addForm.unit,
      status: computeStatus(qty, threshold),
      threshold,
      lastUpdated: today(),
      updatedBy: "Midwife Cruz",
      notes: addForm.notes.trim(),
      history:
        qty > 0
          ? [{ date: today(), type: "in", qty, note: "Initial stock added" }]
          : [],
    };
    setBhcItems([newItem, ...bhcItems]);
    setShowAddModal(false);
    setAddForm({
      name: "",
      category: "Basic Medicines",
      quantity: "",
      unit: "pcs",
      threshold: "",
      notes: "",
    });
  };

  const handleEdit = () => {
    if (!selectedItem || !editForm.name.trim()) return;
    const qty = parseInt(editForm.quantity, 10) || 0;
    const threshold = parseInt(editForm.threshold, 10) || 10;
    setBhcItems(
      bhcItems.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              name: editForm.name.trim(),
              category: editForm.category,
              quantity: qty,
              unit: editForm.unit,
              threshold,
              status: computeStatus(qty, threshold),
              notes: editForm.notes.trim(),
              lastUpdated: today(),
              updatedBy: "Midwife Cruz",
            }
          : item,
      ),
    );
    setShowEditModal(false);
    setSelectedItem(null);
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    setBhcItems(bhcItems.filter((item) => item.id !== selectedItem.id));
    setShowDeleteModal(false);
    setSelectedItem(null);
  };

  const handleStock = () => {
    if (!selectedItem) return;
    const qty = parseInt(stockForm.qty, 10) || 0;
    if (qty <= 0) return;
    const item = bhcItems.find((i) => i.id === selectedItem.id);
    if (!item) return;
    const newQty =
      stockForm.type === "in"
        ? item.quantity + qty
        : Math.max(0, item.quantity - qty);
    const newHistory = [
      {
        date: today(),
        type: stockForm.type,
        qty,
        note:
          stockForm.note.trim() ||
          (stockForm.type === "in" ? "Stock added" : "Stock dispensed"),
      },
      ...item.history,
    ];
    setBhcItems(
      bhcItems.map((i) =>
        i.id === selectedItem.id
          ? {
              ...i,
              quantity: newQty,
              status: computeStatus(newQty, i.threshold),
              lastUpdated: today(),
              updatedBy: "Midwife Cruz",
              history: newHistory,
            }
          : i,
      ),
    );
    setShowStockModal(false);
    setSelectedItem(null);
    setStockForm({ type: "in", qty: "", note: "" });
  };

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      threshold: String(item.threshold),
      notes: item.notes,
    });
    setShowEditModal(true);
  };
  const openDelete = (item) => {
    setSelectedItem(item);
    setShowDeleteModal(true);
  };
  const openStock = (item) => {
    setSelectedItem(item);
    setStockForm({ type: "in", qty: "", note: "" });
    setShowStockModal(true);
  };
  const openHistory = (item) => {
    setSelectedItem(item);
    setShowHistoryModal(true);
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field)
      return <ArrowUpDown size={11} className="text-[#D1D5DB]" />;
    return sortDir === "asc" ? (
      <ArrowUp size={11} className="text-[#2563EB]" />
    ) : (
      <ArrowDown size={11} className="text-[#2563EB]" />
    );
  };

  const clearFilters = () => {
    if (activeTab === "bhc")
      setBhcFilters({
        search: "",
        category: "All Categories",
        status: "All Status",
      });
    else
      setRhuFilters({
        search: "",
        category: "All Categories",
        status: "All Status",
      });
  };

  const hasActiveFilters =
    activeTab === "bhc"
      ? bhcFilters.search !== "" ||
        bhcFilters.category !== "All Categories" ||
        bhcFilters.status !== "All Status"
      : rhuFilters.search !== "" ||
        rhuFilters.category !== "All Categories" ||
        rhuFilters.status !== "All Status";

  return (
    <DashboardLayout role="bhc" title="Medicine Inventory">
      <style>{keyframes}</style>

      {/* ═══════════════════════════════════════════════════════════════
          TOP NAVIGATION: TABS + ACTION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] p-1">
          <button
            onClick={() => setActiveTab("bhc")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
              activeTab === "bhc"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <Package
              size={13}
              className={activeTab === "bhc" ? "text-[#0B2E59]" : ""}
            />
            BHC Inventory
            {bhcStats.lowStock > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FEF3C7] px-1 text-[9px] font-bold text-[#B45309]">
                {bhcStats.lowStock}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("rhu")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
              activeTab === "rhu"
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <Eye
              size={13}
              className={activeTab === "rhu" ? "text-[#0B2E59]" : ""}
            />
            RHU Availability
            <span className="rounded-md bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-bold text-[#2563EB]">
              View-only
            </span>
          </button>
        </div>

        {activeTab === "bhc" && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Medicine
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT: TABLE (LEFT) + SIDEBAR (RIGHT)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-start gap-6">
        {/* ── Left Table Content ── */}
        <div className="min-w-0 flex-1">
          {activeTab === "bhc" ? (
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                      <th className="whitespace-nowrap px-6 py-3">Item ID</th>
                      <th
                        className="cursor-pointer whitespace-nowrap px-4 py-3 select-none"
                        onClick={() => toggleSort("name")}
                      >
                        <div className="flex items-center gap-1">
                          Item Name <SortIcon field="name" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer whitespace-nowrap px-4 py-3 select-none"
                        onClick={() => toggleSort("category")}
                      >
                        <div className="flex items-center gap-1">
                          Category <SortIcon field="category" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer whitespace-nowrap px-4 py-3 select-none"
                        onClick={() => toggleSort("quantity")}
                      >
                        <div className="flex items-center gap-1">
                          Quantity <SortIcon field="quantity" />
                        </div>
                      </th>
                      <th
                        className="cursor-pointer whitespace-nowrap px-4 py-3 select-none"
                        onClick={() => toggleSort("status")}
                      >
                        <div className="flex items-center gap-1">
                          Status <SortIcon field="status" />
                        </div>
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">
                        Last Updated
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F8FAFC]">
                    {filteredBHC.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-24 text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                            <Boxes size={20} className="text-[#94A3B8]" />
                          </div>
                          <p className="text-[13px] font-semibold text-[#334155]">
                            No medicines found
                          </p>
                          <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                            Try adjusting your search or filters
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredBHC.map((item) => (
                        <tr
                          key={item.id}
                          className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                        >
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 font-mono text-[11px] font-semibold text-[#0B2E59]">
                              {item.id}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#0B2E59] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#2563EB]">
                                <Boxes size={14} />
                              </div>
                              <div>
                                <span className="block text-[12.5px] font-semibold text-[#0F172A]">
                                  {item.name}
                                </span>
                                <span className="block text-[10px] text-[#94A3B8]">
                                  Threshold: {item.threshold} {item.unit}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <CategoryBadge category={item.category} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <span className="text-[12.5px] font-semibold text-[#0F172A]">
                              {item.quantity}
                            </span>
                            <span className="ml-1 text-[11px] text-[#94A3B8]">
                              {item.unit}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-[12px] text-[#94A3B8]">
                            {item.lastUpdated}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openHistory(item)}
                                title="View History"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#F1F5F9] hover:text-[#64748B]"
                              >
                                <History size={14} />
                              </button>
                              <button
                                onClick={() => openStock(item)}
                                title="Adjust Stock"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                              >
                                <ArrowUpDown size={14} />
                              </button>
                              <button
                                onClick={() => openEdit(item)}
                                title="Edit"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#FFFBEB] hover:text-[#D97706]"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => openDelete(item)}
                                title="Delete"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] px-6 py-3.5">
                <p className="text-[11px] text-[#94A3B8]">
                  Showing {filteredBHC.length} of {bhcItems.length} items
                </p>
                <div className="flex items-center gap-1">
                  <button className="flex h-8 items-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-medium text-[#94A3B8] cursor-not-allowed">
                    Prev
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59] text-[11px] font-semibold text-white shadow-sm">
                    1
                  </button>
                  <button className="flex h-8 items-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-medium text-[#94A3B8] cursor-not-allowed">
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                      <th className="whitespace-nowrap px-6 py-3">Item ID</th>
                      <th className="whitespace-nowrap px-4 py-3">Item Name</th>
                      <th className="whitespace-nowrap px-4 py-3">Category</th>
                      <th className="whitespace-nowrap px-4 py-3">Quantity</th>
                      <th className="whitespace-nowrap px-4 py-3">Status</th>
                      <th className="whitespace-nowrap px-4 py-3">
                        Last Updated
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F8FAFC]">
                    {filteredRHU.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-24 text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                            <Boxes size={20} className="text-[#94A3B8]" />
                          </div>
                          <p className="text-[13px] font-semibold text-[#334155]">
                            No medicines found
                          </p>
                          <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                            Try adjusting your search or filters
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredRHU.map((item) => (
                        <tr
                          key={item.id}
                          className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                        >
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 font-mono text-[11px] font-semibold text-[#0B2E59]">
                              {item.id}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#0B2E59] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#2563EB]">
                                <Boxes size={14} />
                              </div>
                              <span className="text-[12.5px] font-semibold text-[#0F172A]">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <CategoryBadge category={item.category} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-[12.5px] font-medium text-[#64748B]">
                            {item.quantity}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-[12px] text-[#94A3B8]">
                            {item.lastUpdated}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-4 text-[12px] text-[#64748B]">
                            {item.notes}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] px-6 py-3.5">
                <p className="text-[11px] text-[#94A3B8]">
                  Page 1 of 1 · {filteredRHU.length} total items
                </p>
                <div className="flex items-center gap-1">
                  <button className="flex h-8 items-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-medium text-[#94A3B8] cursor-not-allowed">
                    Prev
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59] text-[11px] font-semibold text-white shadow-sm">
                    1
                  </button>
                  <button className="flex h-8 items-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-medium text-[#94A3B8] cursor-not-allowed">
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Filter Sidebar ── */}
        <aside className="w-[260px] shrink-0">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-[#0F172A]">
                Filters
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] font-medium text-[#0B2E59] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* BHC Compact Stats */}
            {activeTab === "bhc" && (
              <div className="mb-5 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[#334155]">
                    <CheckCircle2 size={12} className="text-[#059669]" />{" "}
                    Available
                  </div>
                  <span className="text-[11px] font-bold text-[#059669]">
                    {bhcStats.available}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-[#FFFBEB] px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[#92400E]">
                    <AlertTriangle size={12} className="text-[#D97706]" /> Low
                    Stock
                  </div>
                  <span className="text-[11px] font-bold text-[#D97706]">
                    {bhcStats.lowStock}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-[#FEF2F2] px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[#991B1B]">
                    <XCircle size={12} className="text-[#DC2626]" /> Unavailable
                  </div>
                  <span className="text-[11px] font-bold text-[#DC2626]">
                    {bhcStats.unavailable}
                  </span>
                </div>
              </div>
            )}

            {/* RHU View Only Notice */}
            {activeTab === "rhu" && (
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] p-3">
                <Eye size={12} className="mt-0.5 shrink-0 text-[#2563EB]" />
                <p className="text-[10px] leading-relaxed text-[#1D4ED8]">
                  Read-only view of RHU medicine availability for coordination.
                </p>
              </div>
            )}

            <div className="space-y-5">
              {/* Search */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Search Medicine
                </label>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                  />
                  <input
                    type="text"
                    value={
                      activeTab === "bhc"
                        ? bhcFilters.search
                        : rhuFilters.search
                    }
                    onChange={(e) =>
                      activeTab === "bhc"
                        ? setBhcFilters((p) => ({
                            ...p,
                            search: e.target.value,
                          }))
                        : setRhuFilters((p) => ({
                            ...p,
                            search: e.target.value,
                          }))
                    }
                    placeholder="Name or ID..."
                    className="h-[34px] w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[12px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Category
                </label>
                <select
                  value={
                    activeTab === "bhc"
                      ? bhcFilters.category
                      : rhuFilters.category
                  }
                  onChange={(e) =>
                    activeTab === "bhc"
                      ? setBhcFilters((p) => ({
                          ...p,
                          category: e.target.value,
                        }))
                      : setRhuFilters((p) => ({
                          ...p,
                          category: e.target.value,
                        }))
                  }
                  className="h-[34px] w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Status
                </label>
                <select
                  value={
                    activeTab === "bhc" ? bhcFilters.status : rhuFilters.status
                  }
                  onChange={(e) =>
                    activeTab === "bhc"
                      ? setBhcFilters((p) => ({ ...p, status: e.target.value }))
                      : setRhuFilters((p) => ({ ...p, status: e.target.value }))
                  }
                  className="h-[34px] w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Status</option>
                  <option>Available</option>
                  <option>Low Stock</option>
                  <option>Unavailable</option>
                </select>
              </div>
            </div>

            {/* Low Stock Alert in Sidebar */}
            {activeTab === "bhc" && bhcStats.lowStock > 0 && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
                <AlertTriangle
                  size={12}
                  className="mt-0.5 shrink-0 text-[#D97706]"
                />
                <p className="text-[10px] leading-relaxed text-[#92400E]">
                  <span className="font-bold">Low Stock:</span>{" "}
                  {bhcItems
                    .filter((i) => i.status === "Low Stock")
                    .map((i) => i.name)
                    .join(", ")}
                </p>
              </div>
            )}

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] py-2 text-[11px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#334155]"
              >
                <RotateCcw size={11} />
                Reset All Filters
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ═══════════ MODALS ═══════════ */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Add New Medicine">
          <div className="space-y-4">
            <FormField label="Medicine Name" required>
              <input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                placeholder="e.g. Paracetamol 500mg"
                className={inputClass}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Category">
                <select
                  value={addForm.category}
                  onChange={(e) =>
                    setAddForm({ ...addForm, category: e.target.value })
                  }
                  className={selectClass}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Unit">
                <select
                  value={addForm.unit}
                  onChange={(e) =>
                    setAddForm({ ...addForm, unit: e.target.value })
                  }
                  className={selectClass}
                >
                  {units.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Initial Quantity" required>
                <input
                  type="number"
                  min="0"
                  value={addForm.quantity}
                  onChange={(e) =>
                    setAddForm({ ...addForm, quantity: e.target.value })
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Low Stock Threshold">
                <input
                  type="number"
                  min="0"
                  value={addForm.threshold}
                  onChange={(e) =>
                    setAddForm({ ...addForm, threshold: e.target.value })
                  }
                  placeholder="10"
                  className={inputClass}
                />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm({ ...addForm, notes: e.target.value })
                }
                placeholder="Optional notes about this medicine..."
                rows={3}
                className={inputClass + " resize-none"}
              />
            </FormField>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#F3F4F6] pt-5">
            <button
              onClick={() => setShowAddModal(false)}
              className="h-10 rounded-xl border border-[#E8ECF0] bg-white px-5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addForm.name.trim()}
              className="h-10 rounded-xl bg-[#0B2E59] px-6 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all hover:bg-[#0A2548] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Add Medicine
            </button>
          </div>
        </Modal>
      )}

      {showEditModal && selectedItem && (
        <Modal onClose={() => setShowEditModal(false)} title="Edit Medicine">
          <div className="space-y-4">
            <div className="rounded-lg border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#BCC3CD]">
                Item ID
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[#0B2E59]">
                {selectedItem.id}
              </p>
            </div>
            <FormField label="Medicine Name" required>
              <input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className={inputClass}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Category">
                <select
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({ ...editForm, category: e.target.value })
                  }
                  className={selectClass}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Unit">
                <select
                  value={editForm.unit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, unit: e.target.value })
                  }
                  className={selectClass}
                >
                  {units.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Quantity" required>
                <input
                  type="number"
                  min="0"
                  value={editForm.quantity}
                  onChange={(e) =>
                    setEditForm({ ...editForm, quantity: e.target.value })
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField label="Low Stock Threshold">
                <input
                  type="number"
                  min="0"
                  value={editForm.threshold}
                  onChange={(e) =>
                    setEditForm({ ...editForm, threshold: e.target.value })
                  }
                  className={inputClass}
                />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
                rows={3}
                className={inputClass + " resize-none"}
              />
            </FormField>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#F3F4F6] pt-5">
            <button
              onClick={() => setShowEditModal(false)}
              className="h-10 rounded-xl border border-[#E8ECF0] bg-white px-5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleEdit}
              disabled={!editForm.name.trim()}
              className="h-10 rounded-xl bg-[#0B2E59] px-6 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all hover:bg-[#0A2548] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {showStockModal && selectedItem && (
        <Modal
          onClose={() => setShowStockModal(false)}
          title="Adjust Stock"
          width="sm"
        >
          <div className="mb-5 rounded-lg border border-[#F3F4F6] bg-[#FAFBFC] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF]">
                <Pill size={18} className="text-[#2563EB]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0B2E59]">
                  {selectedItem.name}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Current stock:{" "}
                  <span className="font-semibold text-[#0F172A]">
                    {selectedItem.quantity} {selectedItem.unit}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <FormField label="Adjustment Type">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStockForm({ ...stockForm, type: "in" })}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-xs font-semibold transition-all ${stockForm.type === "in" ? "border-[#059669] bg-[#ECFDF5] text-[#047857]" : "border-[#E8ECF0] bg-white text-[#6B7280] hover:border-[#D1D5DB]"}`}
                >
                  <TrendingUp size={15} /> Stock In
                </button>
                <button
                  onClick={() => setStockForm({ ...stockForm, type: "out" })}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-xs font-semibold transition-all ${stockForm.type === "out" ? "border-[#DC2626] bg-[#FEF2F2] text-[#B91C1C]" : "border-[#E8ECF0] bg-white text-[#6B7280] hover:border-[#D1D5DB]"}`}
                >
                  <TrendingDown size={15} /> Stock Out
                </button>
              </div>
            </FormField>
            <FormField label="Quantity" required>
              <input
                type="number"
                min="1"
                max={
                  stockForm.type === "out" ? selectedItem.quantity : undefined
                }
                value={stockForm.qty}
                onChange={(e) =>
                  setStockForm({ ...stockForm, qty: e.target.value })
                }
                placeholder="Enter quantity"
                className={inputClass}
              />
              {stockForm.type === "out" &&
                parseInt(stockForm.qty, 10) > selectedItem.quantity && (
                  <p className="mt-1.5 text-[11px] text-[#DC2626]">
                    Cannot exceed current stock ({selectedItem.quantity})
                  </p>
                )}
            </FormField>
            <FormField label="Reason / Note">
              <input
                value={stockForm.note}
                onChange={(e) =>
                  setStockForm({ ...stockForm, note: e.target.value })
                }
                placeholder={
                  stockForm.type === "in"
                    ? "e.g. Restocked from RHU"
                    : "e.g. Dispensed to patient"
                }
                className={inputClass}
              />
            </FormField>
            {parseInt(stockForm.qty, 10) > 0 && (
              <div
                className={`rounded-lg border p-3.5 ${stockForm.type === "in" ? "border-[#A7F3D0] bg-[#ECFDF5]" : "border-[#FECACA] bg-[#FEF2F2]"}`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider ${stockForm.type === "in" ? "text-[#047857]" : "text-[#B91C1C]"}`}
                >
                  New Stock Preview
                </p>
                <p
                  className={`mt-1 text-lg font-bold ${stockForm.type === "in" ? "text-[#047857]" : "text-[#B91C1C]"}`}
                >
                  {stockForm.type === "in"
                    ? selectedItem.quantity + (parseInt(stockForm.qty, 10) || 0)
                    : Math.max(
                        0,
                        selectedItem.quantity -
                          (parseInt(stockForm.qty, 10) || 0),
                      )}{" "}
                  <span className="text-sm font-medium opacity-70">
                    {selectedItem.unit}
                  </span>
                </p>
              </div>
            )}
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#F3F4F6] pt-5">
            <button
              onClick={() => setShowStockModal(false)}
              className="h-10 rounded-xl border border-[#E8ECF0] bg-white px-5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleStock}
              disabled={
                !stockForm.qty ||
                parseInt(stockForm.qty, 10) <= 0 ||
                (stockForm.type === "out" &&
                  parseInt(stockForm.qty, 10) > selectedItem.quantity)
              }
              className={`h-10 rounded-xl px-6 text-xs font-semibold text-white shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${stockForm.type === "in" ? "bg-[#059669] shadow-[#059669]/20 hover:bg-[#047857]" : "bg-[#DC2626] shadow-[#DC2626]/20 hover:bg-[#B91C1C]"}`}
            >
              {stockForm.type === "in" ? "Add Stock" : "Remove Stock"}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteModal && selectedItem && (
        <Modal
          onClose={() => setShowDeleteModal(false)}
          title="Delete Medicine"
          width="sm"
        >
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FEF2F2]">
              <Trash2 size={24} className="text-[#DC2626]" />
            </div>
            <p className="text-sm font-semibold text-[#0F172A]">
              Delete {selectedItem.name}?
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#64748B]">
              This will permanently remove{" "}
              <span className="font-semibold text-[#0F172A]">
                {selectedItem.name}
              </span>{" "}
              ({selectedItem.id}) and all its stock history from your BHC
              inventory. This action cannot be undone.
            </p>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 border-t border-[#F3F4F6] pt-5">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="h-10 rounded-xl border border-[#E8ECF0] bg-white px-5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="h-10 rounded-xl bg-[#DC2626] px-6 text-xs font-semibold text-white shadow-md shadow-[#DC2626]/20 transition-all hover:bg-[#B91C1C]"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {showHistoryModal && selectedItem && (
        <Modal
          onClose={() => setShowHistoryModal(false)}
          title="Stock History"
          width="md"
        >
          <div className="mb-4 rounded-lg border border-[#F3F4F6] bg-[#FAFBFC] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF]">
                <Pill size={18} className="text-[#2563EB]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0B2E59]">
                  {selectedItem.name}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  {selectedItem.id} · Current:{" "}
                  <span className="font-semibold text-[#0F172A]">
                    {selectedItem.quantity} {selectedItem.unit}
                  </span>
                </p>
              </div>
            </div>
          </div>
          {selectedItem.history.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F4F6]">
                <History size={22} className="text-[#D1D5DB]" />
              </div>
              <p className="text-sm font-medium text-[#94A3B8]">
                No history recorded
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selectedItem.history.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3.5 transition-colors hover:bg-[#FAFBFC]"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${entry.type === "in" ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEF2F2] text-[#DC2626]"}`}
                  >
                    {entry.type === "in" ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${entry.type === "in" ? "text-[#047857]" : "text-[#B91C1C]"}`}
                      >
                        {entry.type === "in" ? "+" : "-"}
                        {entry.qty} {selectedItem.unit}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-[#94A3B8]">
                        {entry.date}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#64748B] truncate">
                      {entry.note}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </DashboardLayout>
  );
}

/* ─── Shared Styles ─── */
const inputClass =
  "h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm outline-none transition-all duration-200 placeholder:text-[#BCC3CD] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10";
const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm outline-none transition-all duration-200 focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10";

/* ─── Modal ─── */
function Modal({ children, onClose, title, width = "md" }) {
  const widthMap = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="anim-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`anim-slide-in relative w-full ${widthMap[width]} rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl shadow-black/10`}
      >
        <div className="flex items-center justify-between border-b border-[#F3F4F6] px-6 py-4">
          <h3 className="text-sm font-bold text-[#0B2E59]">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#F1F5F9] hover:text-[#64748B]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ─── Form Field ─── */
function FormField({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label}
        {required && <span className="ml-0.5 text-[#DC2626]">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const map = {
    Available: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
    "Low Stock": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    Unavailable: { bg: "#FEF2F2", text: "#B91C1C", dot: "#EF4444" },
  };
  const s = map[status] || map.Available;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}

/* ─── Category Badge ─── */
function CategoryBadge({ category }) {
  const map = {
    "Basic Medicines": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
    Vaccines: { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" },
    "Medical Supplies": { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
    "Maternal Care Supplies": {
      bg: "#FFF1F2",
      text: "#BE123C",
      border: "#FECDD3",
    },
    "Child Health Supplies": {
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    },
    "Referral-related Resources": {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
    },
  };
  const s = map[category] || map["Medical Supplies"];
  return (
    <span
      className="inline-block rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      {category}
    </span>
  );
}
