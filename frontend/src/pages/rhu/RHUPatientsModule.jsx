import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  FilePlus2,
  Users,
  UserCheck,
  X,
  ChevronLeft,
  ChevronRight,
  Baby,
  UserRound,
  AlertTriangle,
} from "lucide-react";

import DashboardLayout from "../../layouts/DashboardLayout";

/* ─── KEYFRAMES ─── */

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes menuOpen {
    from { opacity: 0; transform: scale(0.92) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes menuClose {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to   { opacity: 0; transform: scale(0.92) translateY(-4px); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .menu-open    { animation: menuOpen  0.2s cubic-bezier(0.22,1,0.36,1) both; }
  .menu-close   { animation: menuClose 0.15s cubic-bezier(0.55,0,1,0.45) both; }
`;

const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

const PER_PAGE = 8;

/* ─── DATA ─── */

const initialPatients = [
  {
    id: "P-001",
    name: "Maria Rosa",
    ageSex: "31/F",
    barangay: "Bagumbayan",
    contact: "0917-123-4567",
    category: "Pregnant Patient",
    urgency: "Urgent",
    type: "Referred",
    lastVisit: "May 13, 2026",
    status: "For Referral",
  },
  {
    id: "P-002",
    name: "Juan Reyes",
    ageSex: "65/M",
    barangay: "Balubad",
    contact: "0918-234-5678",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 13, 2026",
    status: "For Monitoring",
  },
  {
    id: "P-003",
    name: "John Cruz",
    ageSex: "45/M",
    barangay: "Bambang",
    contact: "0919-345-6789",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 12, 2026",
    status: "Active",
  },
  {
    id: "P-004",
    name: "David Perez",
    ageSex: "44/M",
    barangay: "Matungao",
    contact: "0920-456-7890",
    category: "Immunization",
    urgency: "Routine",
    type: "Referred",
    lastVisit: "May 12, 2026",
    status: "Completed",
  },
  {
    id: "P-005",
    name: "Antonio Santos",
    ageSex: "29/M",
    barangay: "San Francisco",
    contact: "0921-567-8901",
    category: "General Consultation",
    urgency: "Urgent",
    type: "Walk-in",
    lastVisit: "May 11, 2026",
    status: "Active",
  },
  {
    id: "P-006",
    name: "Ana Liza Mendoza",
    ageSex: "27/F",
    barangay: "Bagumbayan",
    contact: "0922-678-9012",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 11, 2026",
    status: "Active",
  },
  {
    id: "P-007",
    name: "Rosa Linda Garcia",
    ageSex: "68/F",
    barangay: "Balubad",
    contact: "0923-789-0123",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 10, 2026",
    status: "For Monitoring",
  },
  {
    id: "P-008",
    name: "Carlos Dela Cruz",
    ageSex: "52/M",
    barangay: "Bambang",
    contact: "0924-890-1234",
    category: "General Consultation",
    urgency: "Urgent",
    type: "Referred",
    lastVisit: "May 10, 2026",
    status: "For Referral",
  },
  {
    id: "P-009",
    name: "Elena Domingo",
    ageSex: "34/F",
    barangay: "Matungao",
    contact: "0925-901-2345",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 9, 2026",
    status: "Active",
  },
  {
    id: "P-010",
    name: "Ricardo Torres",
    ageSex: "71/M",
    barangay: "San Francisco",
    contact: "0926-012-3456",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Referred",
    lastVisit: "May 9, 2026",
    status: "Completed",
  },
  {
    id: "P-011",
    name: "Grace Villanueva",
    ageSex: "23/F",
    barangay: "Bagumbayan",
    contact: "0927-123-4570",
    category: "Immunization",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 8, 2026",
    status: "Completed",
  },
  {
    id: "P-012",
    name: "Mark Anthony Lim",
    ageSex: "38/M",
    barangay: "Balubad",
    contact: "0928-234-5681",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 8, 2026",
    status: "For Monitoring",
  },
  {
    id: "P-013",
    name: "Carmen Aquino",
    ageSex: "60/F",
    barangay: "Bambang",
    contact: "0929-345-6792",
    category: "Senior Citizen",
    urgency: "Urgent",
    type: "Referred",
    lastVisit: "May 7, 2026",
    status: "For Referral",
  },
  {
    id: "P-014",
    name: "Jose Ramirez",
    ageSex: "41/M",
    barangay: "Matungao",
    contact: "0930-456-7803",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 7, 2026",
    status: "Active",
  },
  {
    id: "P-015",
    name: "Lourdes Fernandez",
    ageSex: "29/F",
    barangay: "San Francisco",
    contact: "0931-567-8914",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 6, 2026",
    status: "Active",
  },
  {
    id: "P-016",
    name: "Pedro Santiago",
    ageSex: "55/M",
    barangay: "Bagumbayan",
    contact: "0932-678-9025",
    category: "General Consultation",
    urgency: "Routine",
    type: "Referred",
    lastVisit: "May 6, 2026",
    status: "Completed",
  },
  {
    id: "P-017",
    name: "Mila Reyes",
    ageSex: "8/F",
    barangay: "Balubad",
    contact: "0933-789-0136",
    category: "Immunization",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 5, 2026",
    status: "Completed",
  },
  {
    id: "P-018",
    name: "Fernando Gonzales",
    ageSex: "73/M",
    barangay: "Bambang",
    contact: "0934-890-1247",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 5, 2026",
    status: "For Monitoring",
  },
  {
    id: "P-019",
    name: "Isabel Tolentino",
    ageSex: "32/F",
    barangay: "Matungao",
    contact: "0935-901-2358",
    category: "Pregnant Patient",
    urgency: "Urgent",
    type: "Referred",
    lastVisit: "May 4, 2026",
    status: "For Referral",
  },
  {
    id: "P-020",
    name: "Roberto Navarro",
    ageSex: "48/M",
    barangay: "San Francisco",
    contact: "0936-012-3469",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    lastVisit: "May 4, 2026",
    status: "Active",
  },
];

const categoryStats = [
  {
    label: "Total Registered",
    key: "total",
    value: "20",
    icon: <Users size={16} />,
    color: "navy",
  },
  {
    label: "Pregnant Patients",
    key: "pregnant",
    value: "4",
    icon: <Baby size={16} />,
    color: "pink",
  },
  {
    label: "Senior Citizens",
    key: "senior",
    value: "5",
    icon: <UserRound size={16} />,
    color: "violet",
  },
  {
    label: "For Referral",
    key: "referral",
    value: "3",
    icon: <AlertTriangle size={16} />,
    color: "orange",
  },
];

/* ───────────────── MAIN ───────────────── */

export default function Patients() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);

  /* Derived */
  const filteredPatients = useMemo(() => {
    return initialPatients.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.barangay.toLowerCase().includes(q);
      const matchesCategory =
        filterCategory === "All Categories" || p.category === filterCategory;
      const matchesStatus =
        filterStatus === "All Status" || p.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [searchQuery, filterCategory, filterStatus]);

  const sortedPatients = useMemo(() => {
    const arr = [...filteredPatients];
    arr.sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "id":
          aVal = a.id;
          bVal = b.id;
          break;
        case "barangay":
          aVal = a.barangay;
          bVal = b.barangay;
          break;
        case "lastVisit":
          aVal = a.lastVisit;
          bVal = b.lastVisit;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredPatients, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedPatients.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const pagedPatients = useMemo(() => {
    const start = (safePage - 1) * PER_PAGE;
    return sortedPatients.slice(start, start + PER_PAGE);
  }, [sortedPatients, safePage]);

  const activeFilters = useMemo(() => {
    const f = [];
    if (searchQuery)
      f.push({ key: "search", label: "Search", value: searchQuery });
    if (filterCategory !== "All Categories")
      f.push({ key: "category", label: "Category", value: filterCategory });
    if (filterStatus !== "All Status")
      f.push({ key: "status", label: "Status", value: filterStatus });
    return f;
  }, [searchQuery, filterCategory, filterStatus]);

  /* Reset page when filters change */
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterStatus]);

  /* Handlers */
  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function removeFilter(key) {
    switch (key) {
      case "search":
        setSearchQuery("");
        break;
      case "category":
        setFilterCategory("All Categories");
        break;
      case "status":
        setFilterStatus("All Status");
        break;
    }
  }

  function clearAllFilters() {
    setSearchQuery("");
    setFilterCategory("All Categories");
    setFilterStatus("All Status");
  }

  /* Pagination helpers */
  function getPageNumbers() {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("start-ellipsis");
      const start = Math.max(2, safePage - 1);
      const end = Math.min(totalPages - 1, safePage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push("end-ellipsis");
      pages.push(totalPages);
    }
    return pages;
  }

  const startRecord =
    filteredPatients.length === 0 ? 0 : (safePage - 1) * PER_PAGE + 1;
  const endRecord = Math.min(safePage * PER_PAGE, filteredPatients.length);

  return (
    <DashboardLayout role="rhu" title="Patients">
      <style>{keyframes}</style>

      {/* HEADER */}
      <div
        className="anim-fade-up mb-8 flex items-start justify-between gap-4"
        style={stagger(0)}
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF]">
            <Users size={20} className="text-[#2563EB]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
              Patient Master Registry
            </h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              Manage profiles, classifications, and RHU patient records.
            </p>
          </div>
        </div>

        <Link
          to="/rhu/patients/add"
          className="group flex items-center gap-2 rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#082243]"
        >
          <Plus
            size={15}
            className="transition-transform duration-300 group-hover:rotate-90"
          />
          Register Patient
        </Link>
      </div>

      {/* STAT CARDS */}
      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {categoryStats.map((stat, i) => (
          <PatientStatCard key={stat.key} {...stat} delay={i + 1} />
        ))}
      </div>

      {/* FILTERS */}
      <div
        className="anim-fade-up rounded-t-2xl border border-b-0 border-[#E8ECF0] bg-white p-5"
        style={stagger(5)}
      >
        <div className="grid items-end gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Patient Name
            </label>
            <div className="flex items-center rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 transition-all duration-200 focus-within:border-[#2563EB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/10">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 flex-1 border-0 bg-transparent px-2 text-sm text-[#1A1A1A] outline-none placeholder:text-[#BCC3CD]"
                placeholder="Search name, ID, or barangay..."
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[#BCC3CD] transition-colors duration-150 hover:bg-[#F3F4F6] hover:text-[#6B7280]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <FilterSelect
            label="Category"
            value={filterCategory}
            onChange={setFilterCategory}
          >
            <option>All Categories</option>
            <option>Pregnant Patient</option>
            <option>Senior Citizen</option>
            <option>General Consultation</option>
            <option>Immunization</option>
          </FilterSelect>

          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
          >
            <option>All Status</option>
            <option>Active</option>
            <option>For Referral</option>
            <option>For Monitoring</option>
            <option>Completed</option>
          </FilterSelect>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Active Filters
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => removeFilter(f.key)}
                className="group/chip inline-flex items-center gap-1.5 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] transition-all duration-150 hover:border-[#BFDBFE] hover:bg-[#DBEAFE]"
              >
                <span className="text-[#6B7280]">{f.label}:</span>
                {f.value}
                <X
                  size={10}
                  className="ml-0.5 text-[#93C5FD] transition-colors duration-150 group-hover/chip:text-[#1D4ED8]"
                />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[11px] font-medium text-[#6B7280] transition-colors duration-150 hover:text-[#0B2E59]"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* TABLE */}
      <div
        className="anim-fade-up overflow-hidden rounded-b-2xl border border-t-0 border-[#E8ECF0] bg-white shadow-sm"
        style={stagger(6)}
      >
        {/* Table header bar */}
        <div className="flex items-center gap-2.5 border-b border-[#F3F4F6] px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF]">
            <UserCheck size={15} className="text-[#2563EB]" />
          </div>
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Patient Records
          </h2>
          <span className="rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#6B7280]">
            {filteredPatients.length === initialPatients.length
              ? initialPatients.length
              : `${filteredPatients.length} of ${initialPatients.length}`}
          </span>
        </div>

        {pagedPatients.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F3F4F6]">
              <Search size={24} className="text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-semibold text-[#0B2E59]">
              No patients found
            </p>
            <p className="mt-1 max-w-xs text-center text-xs text-[#6B7280]">
              Try adjusting your search or filter criteria to find what you're
              looking for.
            </p>
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 rounded-lg border border-[#E8ECF0] bg-white px-4 py-2 text-xs font-semibold text-[#0B2E59] shadow-sm transition-all duration-200 hover:border-[#D1D5DB] hover:shadow-md"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <SortableHeader
                    label="ID"
                    sortKey="id"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-6"
                  />
                  <SortableHeader
                    label="Patient Name"
                    sortKey="name"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3">Age / Sex</th>
                  <SortableHeader
                    label="Barangay"
                    sortKey="barangay"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Urgency</th>

                  <SortableHeader
                    label="Last Visit"
                    sortKey="lastVisit"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F8FAFC]">
                {pagedPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-mono text-[12px] font-semibold text-[#0B2E59]">
                        {patient.id}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">
                        {patient.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#6B7280]">
                      {patient.ageSex}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[13px] font-medium text-[#4B5563]">
                      {patient.barangay}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-[12px] text-[#9CA3AF]">
                      {patient.contact}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <CategoryTag category={patient.category} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <UrgencyTag urgency={patient.urgency} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#9CA3AF]">
                      {patient.lastVisit}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge status={patient.status} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <ActionMenu
                        patientId={patient.id}
                        patientName={patient.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {filteredPatients.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#F3F4F6] px-6 py-3.5">
            <p className="text-[11px] text-[#BCC3CD]">
              Showing {startRecord}–{endRecord} of {filteredPatients.length}{" "}
              records
            </p>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#E8ECF0] bg-white px-2.5 text-xs text-[#6B7280] transition-all hover:bg-[#F9FAFB] disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronLeft size={14} />
                Prev
              </button>

              {getPageNumbers().map((item) => {
                if (typeof item === "string") {
                  return (
                    <span key={item} className="px-1 text-xs text-[#D1D5DB]">
                      ···
                    </span>
                  );
                }
                const isActive = item === safePage;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-[#0B2E59] text-white shadow-sm"
                        : "border border-[#E8ECF0] bg-white text-[#6B7280] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#E8ECF0] bg-white px-2.5 text-xs text-[#6B7280] transition-all hover:bg-[#F9FAFB] disabled:pointer-events-none disabled:opacity-35"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/* ───────────────── SORTABLE HEADER ───────────────── */

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`whitespace-nowrap cursor-pointer select-none px-4 py-3 transition-colors duration-150 hover:text-[#6B7280] text-[10px] font-semibold uppercase tracking-wider ${className || ""}`}
      style={{ color: isActive ? "#2563EB" : undefined }}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span
          className={`flex flex-col items-center leading-none ${isActive ? "text-[#2563EB]" : "text-[#D1D5DB]"}`}
        >
          <svg
            width="8"
            height="4"
            viewBox="0 0 8 4"
            className={`mb-0.5 transition-opacity duration-150 ${isActive && currentDir === "asc" ? "opacity-100" : "opacity-30"}`}
          >
            <path d="M4 0L8 4H0Z" fill="currentColor" />
          </svg>
          <svg
            width="8"
            height="4"
            viewBox="0 0 8 4"
            className={`transition-opacity duration-150 ${isActive && currentDir === "desc" ? "opacity-100" : "opacity-30"}`}
          >
            <path d="M4 4L0 0H8Z" fill="currentColor" />
          </svg>
        </span>
      </div>
    </th>
  );
}

/* ───────────────── ACTION MENU ───────────────── */

function ActionMenu({ patientId, patientName }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function calculateMenuPosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = 190;
    const gap = 8;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (left < 12) left = 12;
    if (top + menuHeight > window.innerHeight - 12)
      top = rect.top - menuHeight - gap;
    setMenuPosition({ top, left });
  }

  function openMenu() {
    calculateMenuPosition();
    setOpen(true);
    setClosing(false);
  }
  function closeMenu() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (
        btnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      )
        return;
      closeMenu();
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const menu = (open || closing) && (
    <div
      ref={menuRef}
      className={`fixed z-[9999] w-52 rounded-xl border border-[#E8ECF0] bg-white p-1.5 shadow-xl shadow-black/[0.08] ${closing ? "menu-close" : "menu-open"}`}
      style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
    >
      <div className="mb-1 border-b border-[#F3F4F6] px-2.5 py-1.5">
        <p className="text-[11px] font-semibold text-[#0B2E59]">
          {patientName}
        </p>
        <p className="font-mono text-[9px] text-[#BCC3CD]">{patientId}</p>
      </div>
      <Link
        to={`/rhu/patients/${patientId}`}
        onClick={closeMenu}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1A1A1A] transition-all duration-150 hover:bg-[#F8FAFC]"
      >
        <Eye size={14} className="text-[#0B2E59]" />
        View Patient Details
      </Link>
      <Link
        to={`/rhu/health-records/add?patientId=${patientId}`}
        onClick={closeMenu}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#1A1A1A] transition-all duration-150 hover:bg-[#F8FAFC]"
      >
        <FilePlus2 size={14} className="text-blue-500" />
        Add Record
      </Link>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (open ? closeMenu() : openMenu())}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 ${
          open
            ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
            : "border-[#E8ECF0] bg-white text-[#9CA3AF] hover:border-[#D1D5DB] hover:bg-[#F8FAFC]"
        }`}
      >
        <MoreHorizontal size={15} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

/* ───────────────── FILTER SELECT ───────────────── */

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#2563EB] focus:bg-white"
      >
        {children}
      </select>
    </div>
  );
}

/* ───────────────── PATIENT STAT CARD ───────────────── */

function PatientStatCard({ label, value, icon, color = "navy", delay = 0 }) {
  const map = {
    navy: { border: "#0B2E59", iconBg: "#EFF6FF", iconColor: "#2563EB" },
    pink: { border: "#BE185D", iconBg: "#FDF2F8", iconColor: "#BE185D" },
    violet: { border: "#7C3AED", iconBg: "#F5F3FF", iconColor: "#7C3AED" },
    orange: { border: "#EA580C", iconBg: "#FFF7ED", iconColor: "#EA580C" },
  };
  const c = map[color] || map.navy;

  return (
    <div
      className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm"
      style={{ borderTopColor: c.border, ...stagger(delay) }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {label}
        </p>
        <div
          className="rounded-lg p-2.5"
          style={{ backgroundColor: c.iconBg, color: c.iconColor }}
        >
          {icon}
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold leading-none tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

/* ───────────────── CATEGORY TAG ───────────────── */

function CategoryTag({ category }) {
  const map = {
    "Pregnant Patient": { bg: "#FDF2F8", text: "#9D174D", border: "#FBCFE8" },
    "Senior Citizen": { bg: "#F5F3FF", text: "#5B21B6", border: "#DDD6FE" },
    "General Consultation": {
      bg: "#EFF6FF",
      text: "#1E40AF",
      border: "#BFDBFE",
    },
    Immunization: { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" },
  };
  const c = map[category] || {
    bg: "#F8FAFC",
    text: "#475569",
    border: "#E2E8F0",
  };
  return (
    <span
      className="inline-block whitespace-nowrap rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
    >
      {category}
    </span>
  );
}

/* ───────────────── URGENCY TAG ───────────────── */

function UrgencyTag({ urgency }) {
  const isUrgent = urgency === "Urgent";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold ${isUrgent ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isUrgent ? "bg-orange-500" : "bg-emerald-500"}`}
      />
      {urgency}
    </span>
  );
}

/* ───────────────── STATUS BADGE ───────────────── */

function StatusBadge({ status }) {
  const map = {
    Active: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
    "For Referral": { bg: "#FFF7ED", text: "#C2410C", dot: "#F97316" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    Completed: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
  };
  const s = map[status] || { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8" };
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}
