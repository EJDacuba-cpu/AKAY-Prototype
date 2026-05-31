import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  Eye,
  FilePlus2,
  HeartPulse,
  MoreHorizontal,
  Plus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Activity,
  ClipboardList,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";
import { getRhuHealthRecords } from "../../services/healthRecordService";

const STORAGE_KEY = "akay_rhu_health_records";
const LEGACY_STORAGE_KEY = "rhu_health_records";
const PER_PAGE = 6;

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

  const currentRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = allRecords.filter((record) => {
      const matchesSearch =
        !query ||
        (record.patient || "").toLowerCase().includes(query) ||
        (record.id || "").toLowerCase().includes(query) ||
        (record.concern || "").toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === "All Status" || record.status === filterStatus;

      const matchesClassification =
        filterClassification === "All Classifications" ||
        inferClassification(record) === filterClassification;

      const matchesDate = !filterDate || record.date === filterDate;

      return (
        matchesSearch && matchesStatus && matchesClassification && matchesDate
      );
    });

    return filtered.sort((a, b) => {
      const aVal = String(a[sortKey] || "");
      const bVal = String(b[sortKey] || "");
      const compareValue = aVal.localeCompare(bVal);

      return sortDir === "asc" ? compareValue : -compareValue;
    });
  }, [
    allRecords,
    searchQuery,
    filterStatus,
    filterClassification,
    filterDate,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(currentRecords.length / PER_PAGE));
  const pagedRecords = currentRecords.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
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

  function applyToolbarFilters(nextFilters) {
    setFilterStatus(nextFilters.status);
    setFilterClassification(nextFilters.classification);
    setFilterDate(nextFilters.date);
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

  return (
    <DashboardLayout role="rhu" title="Health Records">
      <div className="space-y-6">
        <ListToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by patient name, record ID, or concern..."
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
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Health Record
            </Link>
          }
        />

        <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="border-b border-[#E8ECF0] px-6 py-4">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              RHU Health Records
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Records of patient visits, monitoring, and completed health
              services.
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <SortableHeader
                    label="ID"
                    sortKey="id"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="w-[130px] px-6 py-3"
                  />
                  <SortableHeader
                    label="Patient Name"
                    sortKey="patient"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="w-[220px] px-4 py-3"
                  />
                  <th className="w-[180px] px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Concern</th>
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="w-[150px] px-4 py-3"
                  />
                  <SortableHeader
                    label="Date"
                    sortKey="date"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="w-[130px] px-4 py-3"
                  />
                  <th className="w-[90px] px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F3F4F6]">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-sm text-[#9CA3AF]"
                    >
                      No records found. Try adjusting your filters or add a new
                      health record.
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="transition-colors hover:bg-[#F9FAFB]"
                    >
                      <td className="whitespace-nowrap px-6 py-3.5">
                        <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0B2E59]">
                          {record.id}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="truncate text-sm font-semibold text-[#111827]">
                          {record.patient}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 text-xs font-medium text-[#6B7280]">
                          {inferClassification(record)}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                        <p className="line-clamp-2">{record.concern}</p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5">
                        <StatusBadge status={record.status} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                        {record.date}
                      </td>

                      <td className="whitespace-nowrap px-6 py-3.5 text-right">
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

          {totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-[#E8ECF0] bg-[#F9FAFB] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#6B7280]">
                Showing{" "}
                <span className="font-medium text-[#111827]">
                  {(page - 1) * PER_PAGE + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-[#111827]">
                  {Math.min(page * PER_PAGE, currentRecords.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-[#111827]">
                  {currentRecords.length}
                </span>{" "}
                results
              </p>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#9CA3AF] transition hover:text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {Array.from(
                  { length: totalPages },
                  (_, index) => index + 1,
                ).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition ${
                      pageNumber === page
                        ? "bg-[#B91C1C] text-white shadow-sm"
                        : "text-[#6B7280] hover:bg-white"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#9CA3AF] transition hover:text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
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

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = "px-4 py-3",
}) {
  const isActive = currentSort === sortKey;

  return (
    <th
      className={`${className} cursor-pointer select-none transition-colors hover:text-[#6B7280]`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        <span className={isActive ? "text-[#111827]" : "text-[#CBD5E1]"}>
          {isActive ? (currentDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </div>
    </th>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "For Monitoring": "border-amber-200 bg-amber-50 text-amber-700",
    Completed: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || map.Active
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
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          onToggle();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#4B5563]"
        aria-label={`Open actions for ${record.patient}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] w-48 origin-top-right overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
            style={{ top: position.top, left: position.left }}
          >
            <div className="py-1">
              <Link
                to={`/rhu/health-records/${record.id}`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                <Eye size={14} className="text-[#9CA3AF]" />
                View Details
              </Link>

              <Link
                to={`/rhu/health-records/add?recordId=${record.id}&mode=follow-up`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                <FilePlus2 size={14} className="text-[#9CA3AF]" />
                Add Follow-up Record
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
