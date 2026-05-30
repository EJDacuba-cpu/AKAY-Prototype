import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  Eye,
  FilePlus2,
  HeartPulse,
  MoreHorizontal,
  Plus,
  Search,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  ClipboardList,
  Clock,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";
import { getRhuHealthRecords } from "../../services/healthRecordService";

/* ─── Constants ─── */
const STORAGE_KEY = "akay_rhu_health_records";
const LEGACY_STORAGE_KEY = "rhu_health_records";
const PER_PAGE = 6;

/* ─── Component ─── */
export default function RHUHealthRecords() {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filterClassification, setFilterClassification] = useState(
    "All Classifications",
  );
  const [filterDate, setFilterDate] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  /* ─── Load Data from LocalStorage ─── */
  useEffect(() => {
    const loadRecords = async () => {
      try {
        const parsed = await getRhuHealthRecords();
        setAllRecords(Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        console.error("Failed to load health records:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRecords();

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
        loadRecords();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  /* ─── Logic Helpers ─── */
  function inferClassification(record) {
    if (!record) return "General Consultation";
    const concern = (record.concern || "").toLowerCase();
    if (concern.includes("prenatal") || concern.includes("pregnan")) {
      return "Maternal";
    }
    if (concern.includes("immunization") || concern.includes("vaccine")) {
      return "Immunization";
    }
    if (concern.includes("hypertension") || concern.includes("diabetes")) {
      return "Senior Citizen";
    }
    return "General Consultation";
  }

  const STATUS_TABS = [
    { key: "All Status", label: "All Records", icon: ClipboardList },
    { key: "Active", label: "Active", icon: HeartPulse },
    { key: "For Monitoring", label: "Monitoring", icon: Activity },
    { key: "Completed", label: "Completed", icon: CheckCircle2 },
  ];

  /* ─── Filtered & Sorted ─── */
  const processedRecords = () => {
    let result = allRecords.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (r.patient && r.patient.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.concern && r.concern.toLowerCase().includes(q));
      const matchesStatus =
        filterStatus === "All Status" || r.status === filterStatus;
      const matchesClassification =
        filterClassification === "All Classifications" ||
        inferClassification(r) === filterClassification;

      const matchesDate = !filterDate || r.date === filterDate;

      return (
        matchesSearch && matchesStatus && matchesClassification && matchesDate
      );
    });

    return result.sort((a, b) => {
      const aVal = a[sortKey] || "";
      const bVal = b[sortKey] || "";
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  // Compute filtered records on render or via useMemo. Since no counts are needed, simple computation is fine.
  // But let's keep it performant.
  const currentRecords = processedRecords();

  const totalPages = Math.max(1, Math.ceil(currentRecords.length / PER_PAGE));
  const pagedRecords = currentRecords.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  /* ─── Handlers ─── */
  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilter(key) {
    if (key === "search") setSearchQuery("");
    if (key === "status") setFilterStatus("All Status");
    if (key === "classification") {
      setFilterClassification("All Classifications");
    }
    if (key === "date") setFilterDate("");
  }

  function clearAllFilters() {
    setSearchQuery("");
    setFilterStatus("All Status");
    setFilterClassification("All Classifications");
    setFilterDate("");
  }

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus, filterClassification, filterDate]);

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Health Records">
        <div className="flex h-64 items-center justify-center text-slate-400">
          Loading records...
        </div>
      </DashboardLayout>
    );
  }

  const activeFilters = [
    searchQuery && { key: "search", label: `Search: ${searchQuery}` },
    filterStatus !== "All Status" && { key: "status", label: filterStatus },
    filterClassification !== "All Classifications" && {
      key: "classification",
      label: filterClassification,
    },
    filterDate && { key: "date", label: filterDate },
  ].filter(Boolean);

  const toolbarFilters = [
    {
      key: "status",
      label: "Record Type / Status",
      value: filterStatus,
      options: ["All Status", "Active", "For Monitoring", "Completed"],
    },
    {
      key: "classification",
      label: "Patient Classification",
      value: filterClassification,
      options: [
        "All Classifications",
        "General Consultation",
        "Maternal",
        "Immunization",
        "Senior Citizen",
      ],
    },
    {
      key: "date",
      label: "Date of Visit",
      value: filterDate,
      type: "date",
    },
  ];

  function applyToolbarFilters(nextFilters) {
    setFilterStatus(nextFilters.status);
    setFilterClassification(nextFilters.classification);
    setFilterDate(nextFilters.date);
  }

  return (
    <DashboardLayout role="rhu" title="Health Records">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-slate-900">
              Health Records
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Comprehensive log of patient consultations and treatments.
            </p>
          </div>
        </div>

        <ListToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by patient name or record type..."
          chip={`● ${currentRecords.length.toLocaleString()} Records`}
          filters={toolbarFilters}
          activeFilterCount={
            activeFilters.filter((filter) => filter.key !== "search").length
          }
          activeFilters={activeFilters}
          onApplyFilters={applyToolbarFilters}
          onClearFilters={clearAllFilters}
          onRemoveFilter={clearFilter}
          actions={
            <Link
              to="/rhu/health-records/add"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#092347]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Health Record
            </Link>
          }
        />

        {/* Table Area */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <SortableHeader
                    label="ID"
                    sortKey="id"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-6 py-4"
                  />
                  <SortableHeader
                    label="Patient Name"
                    sortKey="patient"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <th className="px-4 py-4">Classification</th>
                  <th className="px-4 py-4">Concern</th>
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <SortableHeader
                    label="Date"
                    sortKey="date"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <th className="px-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-sm text-slate-400"
                    >
                      No records found. Try adjusting your filters or add a new
                      health record.
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="group transition-colors hover:bg-slate-50/30"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-medium text-slate-500">
                          {record.id}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-900">
                          {record.patient}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                          {inferClassification(record)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {record.concern}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {record.date}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <ActionMenu
                          record={record}
                          open={openMenuId === record.id}
                          onToggle={() =>
                            setOpenMenuId(
                              openMenuId === record.id ? null : record.id,
                            )
                          }
                          onClose={() => setOpenMenuId(null)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/30">
              <p className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-900">
                  {(page - 1) * PER_PAGE + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-slate-900">
                  {Math.min(page * PER_PAGE, currentRecords.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-slate-900">
                  {currentRecords.length}
                </span>{" "}
                results
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-white hover:border-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                        p === page
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-white hover:border-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
──────────────────────────────────────────── */

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-8 text-sm text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/5"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      {children}
    </select>
  );
}

function FilterTag({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
    >
      {label}
      <X size={10} className="text-slate-400" />
    </button>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = "px-4 py-4",
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`${className} cursor-pointer select-none transition-colors hover:text-slate-600`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        <span
          className={`text-[10px] ${
            isActive ? "text-slate-900" : "text-slate-300"
          }`}
        >
          {isActive ? (currentDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </div>
    </th>
  );
}

function StatusBadge({ status }) {
  const m = {
    Active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "For Monitoring": "bg-amber-50 text-amber-700 border border-amber-200",
    Completed: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        m[status] || m.Active
      }`}
    >
      {status}
    </span>
  );
}

function ActionMenu({ record, open, onToggle, onClose }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 110;
    const padding = 12;
    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - 8;
    }
    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return undefined;

    function handleMouseDown(event) {
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

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open, onClose]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        onClick={() => {
          if (!open) updatePosition();
          onToggle();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-48 origin-top-right overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
          style={{ top: position.top, left: position.left }}
        >
          <div className="py-1">
            <Link
              to={`/rhu/health-records/${record.id}`}
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Eye size={14} className="text-slate-400" />
              View Details
            </Link>
            <Link
              to={`/rhu/health-records/add?recordId=${record.id}&mode=follow-up`}
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <FilePlus2 size={14} className="text-slate-400" />
              Add Follow-up Record
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
