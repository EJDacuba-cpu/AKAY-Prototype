import { useState } from "react";
import {
  Boxes,
  Eye,
  Pill,
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
  MoreVertical,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";

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

const DEFAULT_ITEM_CATEGORY = "Basic Medicines";
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

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
    status: "All Status",
    category: "All Categories",
  });
  const [rhuFilters, setRhuFilters] = useState({
    search: "",
    status: "All Status",
    category: "All Categories",
  });

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Selected item / row menu
  const [selectedItem, setSelectedItem] = useState(null);
  const [openActionMenu, setOpenActionMenu] = useState(null);

  // Form states
  const [addForm, setAddForm] = useState({
    name: "",
    quantity: "",
    unit: "pcs",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    quantity: "",
    unit: "",
    notes: "",
  });

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
        item.category.toLowerCase().includes(bhcFilters.search.toLowerCase()) ||
        item.id.toLowerCase().includes(bhcFilters.search.toLowerCase());
      const matchStatus =
        bhcFilters.status === "All Status" || item.status === bhcFilters.status;
      const matchCategory =
        bhcFilters.category === "All Categories" ||
        item.category === bhcFilters.category;
      return matchSearch && matchStatus && matchCategory;
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "quantity") {
        valA = a.quantity;
        valB = b.quantity;
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
      item.category.toLowerCase().includes(rhuFilters.search.toLowerCase()) ||
      item.id.toLowerCase().includes(rhuFilters.search.toLowerCase());
    const matchStatus =
      rhuFilters.status === "All Status" || item.status === rhuFilters.status;
    const matchCategory =
      rhuFilters.category === "All Categories" ||
      item.category === rhuFilters.category;
    return matchSearch && matchStatus && matchCategory;
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
    const threshold = DEFAULT_LOW_STOCK_THRESHOLD;
    if (!addForm.name.trim()) return;
    const newItem = {
      id: nextId(),
      name: addForm.name.trim(),
      category: DEFAULT_ITEM_CATEGORY,
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
      quantity: "",
      unit: "pcs",
      notes: "",
    });
  };

  const handleEdit = () => {
    if (!selectedItem || !editForm.name.trim()) return;
    const qty = parseInt(editForm.quantity, 10) || 0;
    const threshold = selectedItem.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    setBhcItems(
      bhcItems.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              name: editForm.name.trim(),
              category: selectedItem.category,
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

  const openEdit = (item) => {
    setOpenActionMenu(null);
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      notes: item.notes,
    });
    setShowEditModal(true);
  };
  const openDelete = (item) => {
    setOpenActionMenu(null);
    setSelectedItem(item);
    setShowDeleteModal(true);
  };
  const openHistory = (item) => {
    setOpenActionMenu(null);
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
        status: "All Status",
        category: "All Categories",
      });
    else
      setRhuFilters({
        search: "",
        status: "All Status",
        category: "All Categories",
      });
  };

  const hasActiveFilters =
    activeTab === "bhc"
      ? bhcFilters.search !== "" ||
        bhcFilters.status !== "All Status" ||
        bhcFilters.category !== "All Categories"
      : rhuFilters.search !== "" ||
        rhuFilters.status !== "All Status" ||
        rhuFilters.category !== "All Categories";

  const currentFilters = activeTab === "bhc" ? bhcFilters : rhuFilters;
  const currentCount =
    activeTab === "bhc" ? filteredBHC.length : filteredRHU.length;

  const activeFilters = [
    currentFilters.search && {
      key: "search",
      label: `Search: ${currentFilters.search}`,
    },
    currentFilters.category !== "All Categories" && {
      key: "category",
      label: currentFilters.category,
    },
    currentFilters.status !== "All Status" && {
      key: "status",
      label: currentFilters.status,
    },
  ].filter(Boolean);

  const updateActiveFilter = (key, value) => {
    const updater = (prev) => ({ ...prev, [key]: value });
    if (activeTab === "bhc") setBhcFilters(updater);
    else setRhuFilters(updater);
  };

  const removeFilter = (key) => {
    if (key === "search") updateActiveFilter("search", "");
    if (key === "category") updateActiveFilter("category", "All Categories");
    if (key === "status") updateActiveFilter("status", "All Status");
  };

  const medicineFilterFields = [
    {
      key: "category",
      label: "Category",
      value: currentFilters.category,
      options: [
        "All Categories",
        "Basic Medicines",
        "Vaccines",
        "Medical Supplies",
        "Maternal Care Supplies",
      ],
    },
    {
      key: "status",
      label: "Stock Status",
      value: currentFilters.status,
      options: ["All Status", "Available", "Low Stock", "Unavailable"],
    },
  ];

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

      </div>

      <ListToolbar
        searchValue={currentFilters.search}
        onSearchChange={(value) => updateActiveFilter("search", value)}
        searchPlaceholder="Search by medicine name or category..."
        chip={`● ${currentCount.toLocaleString()} Items`}
        filters={medicineFilterFields}
        activeFilterCount={
          activeFilters.filter((filter) => filter.key !== "search").length
        }
        activeFilters={activeFilters}
        onApplyFilters={(nextFilters) => {
          const updater = (prev) => ({ ...prev, ...nextFilters });
          if (activeTab === "bhc") setBhcFilters(updater);
          else setRhuFilters(updater);
        }}
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
        actions={
          activeTab === "bhc" ? (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Medicine
            </button>
          ) : null
        }
      />

      <div className="min-w-0">
        <div className="min-w-0">
          {activeTab === "bhc" ? (
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left">
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
                        <td colSpan={6} className="px-6 py-24 text-center">
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
                            <div className="relative flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenActionMenu(
                                    openActionMenu === item.id ? null : item.id,
                                  )
                                }
                                title="Open actions"
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                                  openActionMenu === item.id
                                    ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                                    : "border-transparent text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#64748B]"
                                }`}
                              >
                                <MoreVertical size={15} />
                              </button>

                              {openActionMenu === item.id && (
                                <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl shadow-slate-900/10">
                                  <button
                                    type="button"
                                    onClick={() => openHistory(item)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                                  >
                                    <History size={14} />
                                    View History
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(item)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] font-medium text-[#475569] transition-colors hover:bg-[#FFFBEB] hover:text-[#D97706]"
                                  >
                                    <Pencil size={14} />
                                    Edit Details
                                  </button>
                                  <div className="my-1 border-t border-[#F1F5F9]" />
                                  <button
                                    type="button"
                                    onClick={() => openDelete(item)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] font-medium text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              )}
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
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                      <th className="whitespace-nowrap px-6 py-3">Item ID</th>
                      <th className="whitespace-nowrap px-4 py-3">Item Name</th>
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
                        <td colSpan={6} className="px-6 py-24 text-center">
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
      </div>

      {/* ═══════════ MODALS ═══════════ */}
      {showAddModal && (
        <Modal
          onClose={() => setShowAddModal(false)}
          title="Add Medicine / Supply"
          width="sm"
        >
          <div className="space-y-3">
            <FormField label="Medicine / Supply Name" required>
              <input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                placeholder="e.g. Paracetamol 500mg"
                className={inputClass}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity" required>
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

            <FormField label="Notes">
              <textarea
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm({ ...addForm, notes: e.target.value })
                }
                placeholder="Optional notes..."
                rows={2}
                className={inputClass + " min-h-[70px] resize-none py-2.5"}
              />
            </FormField>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#F3F4F6] pt-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="h-9 rounded-lg border border-[#E8ECF0] bg-white px-4 text-[11px] font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addForm.name.trim()}
              className="h-9 rounded-lg bg-[#0B2E59] px-4 text-[11px] font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all hover:bg-[#0A2548] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Add Medicine
            </button>
          </div>
        </Modal>
      )}

      {showEditModal && selectedItem && (
        <Modal
          onClose={() => setShowEditModal(false)}
          title="Edit Medicine / Supply"
          width="sm"
        >
          <div className="mb-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-[#0F172A]">
                  {selectedItem.name}
                </p>
                <p className="text-[10.5px] text-[#94A3B8]">
                  Current: {selectedItem.quantity} {selectedItem.unit}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-[#BFDBFE] bg-white px-2 py-1 font-mono text-[10px] font-semibold text-[#0B2E59]">
                {selectedItem.id}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <FormField label="Medicine / Supply Name" required>
              <input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className={inputClass}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
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

            <FormField label="Notes">
              <textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
                rows={2}
                className={inputClass + " min-h-[70px] resize-none py-2.5"}
              />
            </FormField>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#F3F4F6] pt-4">
            <button
              onClick={() => setShowEditModal(false)}
              className="h-9 rounded-lg border border-[#E8ECF0] bg-white px-4 text-[11px] font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              onClick={handleEdit}
              disabled={!editForm.name.trim()}
              className="h-9 rounded-lg bg-[#0B2E59] px-4 text-[11px] font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all hover:bg-[#0A2548] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Save Changes
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
  "h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-[13px] outline-none transition-all duration-200 placeholder:text-[#BCC3CD] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10";
const selectClass =
  "h-9 w-full appearance-none rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-[13px] outline-none transition-all duration-200 focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10";

/* ─── Modal ─── */
function Modal({ children, onClose, title, width = "md" }) {
  const widthMap = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="anim-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`anim-slide-in relative flex max-h-[calc(100vh-1.5rem)] w-full ${widthMap[width]} flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-2xl shadow-black/10`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#F3F4F6] px-4 py-3">
          <h3 className="text-[13px] font-bold text-[#0B2E59]">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#94A3B8] transition-all hover:bg-[#F1F5F9] hover:text-[#64748B]"
          >
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
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
