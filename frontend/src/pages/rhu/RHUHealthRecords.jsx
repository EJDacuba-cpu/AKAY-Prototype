import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ClipboardList,
  Clock,
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
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-count { animation: countUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Data ─── */
const PER_PAGE = 6;

const healthRecords = [
  {
    id: "HR-001",
    patient: "Maria Rosa",
    concern: "Abdominal pain",
    status: "For Monitoring",
    date: "May 13, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-002",
    patient: "Juan Reyes",
    concern: "Hypertension",
    status: "Active",
    date: "May 13, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-003",
    patient: "Carmen Santos",
    concern: "Prenatal checkup",
    status: "Active",
    date: "May 12, 2026",
    recordedBy: "Grace Navalta",
  },
  {
    id: "HR-004",
    patient: "Pedro Dela Cruz",
    concern: "Persistent cough",
    status: "Completed",
    date: "May 12, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-005",
    patient: "Ana Lim",
    concern: "Fever and headache",
    status: "Active",
    date: "May 11, 2026",
    recordedBy: "Grace Navalta",
  },
  {
    id: "HR-006",
    patient: "Luis Garcia",
    concern: "Diabetes follow-up",
    status: "For Monitoring",
    date: "May 11, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-007",
    patient: "Rosa Mendoza",
    concern: "Skin rash",
    status: "Completed",
    date: "May 10, 2026",
    recordedBy: "Grace Navalta",
  },
  {
    id: "HR-008",
    patient: "Miguel Torres",
    concern: "Back pain",
    status: "Active",
    date: "May 10, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-009",
    patient: "Elena Flores",
    concern: "Prenatal checkup",
    status: "Active",
    date: "May 9, 2026",
    recordedBy: "Grace Navalta",
  },
  {
    id: "HR-010",
    patient: "Ricardo Ramos",
    concern: "High blood pressure",
    status: "For Monitoring",
    date: "May 9, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-011",
    patient: "Sofia Villanueva",
    concern: "Child immunization",
    status: "Completed",
    date: "May 8, 2026",
    recordedBy: "Grace Navalta",
  },
  {
    id: "HR-012",
    patient: "Andres Cruz",
    concern: "Chest tightness",
    status: "Active",
    date: "May 8, 2026",
    recordedBy: "Joshua Pio",
  },
  {
    id: "HR-013",
    patient: "Isabelle Reyes",
    concern: "Urinary tract infection",
    status: "Completed",
    date: "May 7, 2026",
    recordedBy: "Grace Navalta",
  },
];

const stats = [
  {
    label: "Total Records",
    value: healthRecords.length,
    icon: ClipboardList,
    color: "text-[#B91C1C]",
    bg: "bg-red-50",
  },
  {
    label: "Active Consultations",
    value: healthRecords.filter((r) => r.status === "Active").length,
    icon: HeartPulse,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    label: "For Monitoring",
    value: healthRecords.filter((r) => r.status === "For Monitoring").length,
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    label: "Completed",
    value: healthRecords.filter((r) => r.status === "Completed").length,
    icon: CheckCircle2,
    color: "text-slate-500",
    bg: "bg-slate-100",
  },
];

/* ─── Main Component ─── */
export default function RHUHealthRecords() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  /* ─── Filtered ─── */
  const filteredRecords = useMemo(() => {
    return healthRecords.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        r.patient.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.concern.toLowerCase().includes(q);
      const matchesStatus =
        filterStatus === "All Status" || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, filterStatus]);

  /* ─── Sorted ─── */
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const aVal = a[sortKey] || "";
      const bVal = b[sortKey] || "";
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRecords, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PER_PAGE));
  const pagedRecords = sortedRecords.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  /* ─── Active Filter Tags ─── */
  const activeFilters = useMemo(() => {
    const filters = [];
    if (searchQuery)
      filters.push({
        key: "search",
        label: "Search",
        value: searchQuery,
      });
    if (filterStatus !== "All Status")
      filters.push({
        key: "status",
        label: "Status",
        value: filterStatus,
      });
    return filters;
  }, [searchQuery, filterStatus]);

  /* ─── Reset page on filter change ─── */
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus]);

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
  }

  function clearAllFilters() {
    setSearchQuery("");
    setFilterStatus("All Status");
  }

  /* ─── Render ─── */
  return (
    <DashboardLayout role="rhu" title="Health Records">
      <style>{keyframes}</style>

      {/* Header */}
      <div className="anim-fade-up mb-6" style={stagger(0)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Health Records</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              Manage and review all patient consultation records received at
              this facility.
            </p>
          </div>
          <Link
            to="/rhu/health-records/add"
            className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
          >
            <Plus size={15} /> New Record
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div
        className="anim-fade-up mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={stagger(1)}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="anim-count rounded-xl border border-[#E8ECF0] bg-white p-4"
            style={stagger(i + 1)}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}
              >
                <s.icon size={16} className={s.color} />
              </div>
              <div>
                <p className="text-xl font-bold text-[#1A1A1A]">{s.value}</p>
                <p className="text-[11px] font-medium text-[#9CA3AF]">
                  {s.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="anim-fade-up rounded-t-2xl border border-b-0 border-[#E8ECF0] bg-white p-5"
        style={stagger(2)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Record
            </label>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Patient name, record ID, or complaint..."
                className="h-11 w-full rounded-xl border border-[#E8ECF0] bg-white pl-10 pr-4 text-sm text-[#1A1A1A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
              />
            </div>
          </div>
          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
          >
            <option>All Status</option>
            <option>Active</option>
            <option>For Monitoring</option>
            <option>Completed</option>
          </FilterSelect>
        </div>

        {/* Active Filter Tags */}
        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[#9CA3AF]">
              Active:
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => clearFilter(f.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2.5 py-1 text-[11px] font-medium text-[#6B7280] transition hover:border-red-200 hover:text-[#B91C1C]"
              >
                {f.label}: {f.value}
                <X size={11} />
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div
        className="anim-fade-up overflow-hidden rounded-b-2xl border border-t-0 border-[#E8ECF0] bg-white shadow-sm"
        style={stagger(3)}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead>
              <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <SortableHeader
                  label="Record ID"
                  sortKey="id"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="px-5"
                />
                <SortableHeader
                  label="Patient"
                  sortKey="patient"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3">Chief Complaint</th>
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Date"
                  sortKey="date"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3">Recorded By</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-16 text-center text-sm text-[#9CA3AF]"
                  >
                    No health records found matching your criteria.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                  >
                    <td className="px-5 py-4">
                      <span className="rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#B91C1C]">
                        {record.id}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">
                        {record.patient}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#6B7280]">
                      {record.concern}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#9CA3AF]">
                      {record.date}
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#6B7280]">
                      {record.recordedBy}
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
          <div className="flex items-center justify-between border-t border-[#F3F4F6] px-5 py-3.5">
            <p className="text-[12px] text-[#9CA3AF]">
              Showing{" "}
              <span className="font-semibold text-[#6B7280]">
                {(page - 1) * PER_PAGE + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-[#6B7280]">
                {Math.min(page * PER_PAGE, sortedRecords.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-[#6B7280]">
                {sortedRecords.length}
              </span>{" "}
              records
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8ECF0] text-[#6B7280] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-semibold transition ${
                    p === page
                      ? "bg-[#B91C1C] text-white"
                      : "border border-[#E8ECF0] text-[#6B7280] hover:bg-[#F9FAFB]"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8ECF0] text-[#6B7280] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
──────────────────────────────────────────── */

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-white px-4 pr-10 text-sm text-[#1A1A1A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
        }}
      >
        {children}
      </select>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = "px-4",
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`cursor-pointer select-none py-3 transition hover:text-[#B91C1C] ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span
          className={`text-[10px] transition ${
            isActive ? "text-[#B91C1C]" : "text-[#D1D5DB]"
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
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "For Monitoring": "bg-amber-50 text-amber-700 border-amber-200",
    Completed: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
        m[status] || m.Active
      }`}
    >
      {status}
    </span>
  );
}

function ActionMenu({ record, open, onToggle, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={onToggle}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#6B7280]"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-lg">
          <div className="py-1">
            <MenuLink
              to={`/rhu/health-records/${record.id}`}
              icon={<Eye size={14} />}
            >
              View Record Details
            </MenuLink>
            <MenuLink
              to={`/rhu/health-records/add?recordId=${record.id}`}
              icon={<FilePlus2 size={14} />}
            >
              Add Follow-up Record
            </MenuLink>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, children }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#374151] transition hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
    >
      <span className="text-[#9CA3AF]">{icon}</span>
      {children}
    </Link>
  );
}

