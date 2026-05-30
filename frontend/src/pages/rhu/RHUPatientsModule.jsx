import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  Plus,
  MoreHorizontal,
  Eye,
  FilePlus2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";

/* ─── Constants ─── */
const STORAGE_KEY = "rhu_patients";
const PER_PAGE = 8;

/* ─── Component ─── */
export default function Patients() {
  const [allPatients, setAllPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [filterSex, setFilterSex] = useState("All Sex");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filterAssignedBhc, setFilterAssignedBhc] = useState("All BHCs");
  const [filterAgeGroup, setFilterAgeGroup] = useState("All Age Groups");
  const [filterCivilStatus, setFilterCivilStatus] =
    useState("All Civil Status");
  const [filterDateRegistered, setFilterDateRegistered] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  /* ─── Load Data from LocalStorage ─── */
  useEffect(() => {
    const loadPatients = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setAllPatients(Array.isArray(parsed) ? parsed : []);
        }
      } catch (error) {
        console.error("Failed to load patients:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPatients();

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY) {
        loadPatients();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  /* ─── Filtered & Sorted ─── */
  const processedPatients = () => {
    let result = allPatients.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.barangay && p.barangay.toLowerCase().includes(q)) ||
        (p.assignedBhc && p.assignedBhc.toLowerCase().includes(q)) ||
        (p.assignedBHC && p.assignedBHC.toLowerCase().includes(q)) ||
        (p.contact && p.contact.toLowerCase().includes(q));
      const matchesCategory =
        filterCategory === "All Categories" || p.category === filterCategory;
      const matchesSex =
        filterSex === "All Sex" ||
        (p.ageSex &&
          p.ageSex
            .toLowerCase()
            .endsWith(`/${filterSex.charAt(0).toLowerCase()}`));
      const matchesStatus =
        filterStatus === "All Status" || p.status === filterStatus;
      const matchesAssignedBhc =
        filterAssignedBhc === "All BHCs" ||
        p.assignedBhc === filterAssignedBhc ||
        p.assignedBHC === filterAssignedBhc ||
        p.barangay === filterAssignedBhc;
      const age = parseInt((p.age || p.ageSex || "").toString(), 10);
      const matchesAgeGroup =
        filterAgeGroup === "All Age Groups" ||
        (filterAgeGroup === "Child" && age <= 17) ||
        (filterAgeGroup === "Adult" && age >= 18 && age <= 59) ||
        (filterAgeGroup === "Senior" && age >= 60);
      const matchesCivilStatus =
        filterCivilStatus === "All Civil Status" ||
        p.civilStatus === filterCivilStatus;
      const rawRegisteredDate =
        p.dateRegistered || p.createdAt || p.registeredAt;
      const parsedRegisteredDate = rawRegisteredDate
        ? new Date(rawRegisteredDate)
        : null;
      const normalizedRegisteredDate =
        parsedRegisteredDate && !Number.isNaN(parsedRegisteredDate.getTime())
          ? parsedRegisteredDate.toISOString().slice(0, 10)
          : "";
      const matchesDate =
        !filterDateRegistered ||
        normalizedRegisteredDate === filterDateRegistered;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSex &&
        matchesStatus &&
        matchesAssignedBhc &&
        matchesAgeGroup &&
        matchesCivilStatus &&
        matchesDate
      );
    });

    return result.sort((a, b) => {
      let aVal, bVal;
      // Handle potential undefined keys gracefully
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
      const cmp = (aVal || "").localeCompare(bVal || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  const currentPatients = processedPatients();
  const totalPages = Math.max(1, Math.ceil(currentPatients.length / PER_PAGE));
  const pagedPatients = currentPatients.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  /* ─── Handlers ─── */
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
      case "sex":
        setFilterSex("All Sex");
        break;
      case "status":
        setFilterStatus("All Status");
        break;
      case "assignedBhc":
        setFilterAssignedBhc("All BHCs");
        break;
      case "ageGroup":
        setFilterAgeGroup("All Age Groups");
        break;
      case "civilStatus":
        setFilterCivilStatus("All Civil Status");
        break;
      case "dateRegistered":
        setFilterDateRegistered("");
        break;
    }
  }

  function clearAllFilters() {
    setSearchQuery("");
    setFilterCategory("All Categories");
    setFilterSex("All Sex");
    setFilterStatus("All Status");
    setFilterAssignedBhc("All BHCs");
    setFilterAgeGroup("All Age Groups");
    setFilterCivilStatus("All Civil Status");
    setFilterDateRegistered("");
  }

  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    filterCategory,
    filterSex,
    filterStatus,
    filterAssignedBhc,
    filterAgeGroup,
    filterCivilStatus,
    filterDateRegistered,
  ]);

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Patients">
        <div className="flex h-64 items-center justify-center text-slate-400">
          Loading patients...
        </div>
      </DashboardLayout>
    );
  }

  const startRecord =
    currentPatients.length === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const endRecord = Math.min(page * PER_PAGE, currentPatients.length);

  const assignedBhcOptions = [
    "All BHCs",
    ...new Set(
      allPatients
        .map((patient) => patient.assignedBhc || patient.assignedBHC || patient.barangay)
        .filter(Boolean),
    ),
  ];

  const civilStatusOptions = [
    "All Civil Status",
    ...new Set(allPatients.map((patient) => patient.civilStatus).filter(Boolean)),
  ];

  const toolbarFilters = [
    {
      key: "assignedBhc",
      label: "Assigned BHC",
      value: filterAssignedBhc,
      options: assignedBhcOptions,
    },
    {
      key: "category",
      label: "Classification",
      value: filterCategory,
      options: [
        "All Categories",
        "General Consultation",
        "Senior Citizen",
        "Pregnant Patient",
        "Immunization",
      ],
    },
    {
      key: "sex",
      label: "Sex",
      value: filterSex,
      options: ["All Sex", "Female", "Male"],
    },
    {
      key: "ageGroup",
      label: "Age Group",
      value: filterAgeGroup,
      options: ["All Age Groups", "Child", "Adult", "Senior"],
    },
    {
      key: "civilStatus",
      label: "Civil Status",
      value: filterCivilStatus,
      options: civilStatusOptions,
    },
    {
      key: "status",
      label: "Status",
      value: filterStatus,
      options: [
        "All Status",
        "Active",
        "For Referral",
        "For Monitoring",
        "Completed",
      ],
    },
    {
      key: "dateRegistered",
      label: "Date Registered",
      value: filterDateRegistered,
      type: "date",
    },
  ];

  const activeFilters = [
    searchQuery && { key: "search", label: `Search: ${searchQuery}` },
    filterAssignedBhc !== "All BHCs" && {
      key: "assignedBhc",
      label: filterAssignedBhc,
    },
    filterCategory !== "All Categories" && {
      key: "category",
      label: filterCategory,
    },
    filterSex !== "All Sex" && { key: "sex", label: filterSex },
    filterAgeGroup !== "All Age Groups" && {
      key: "ageGroup",
      label: filterAgeGroup,
    },
    filterCivilStatus !== "All Civil Status" && {
      key: "civilStatus",
      label: filterCivilStatus,
    },
    filterStatus !== "All Status" && { key: "status", label: filterStatus },
    filterDateRegistered && {
      key: "dateRegistered",
      label: filterDateRegistered,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  function applyToolbarFilters(nextFilters) {
    setFilterAssignedBhc(nextFilters.assignedBhc);
    setFilterCategory(nextFilters.category);
    setFilterSex(nextFilters.sex);
    setFilterAgeGroup(nextFilters.ageGroup);
    setFilterCivilStatus(nextFilters.civilStatus);
    setFilterStatus(nextFilters.status);
    setFilterDateRegistered(nextFilters.dateRegistered);
  }

  return (
    <DashboardLayout role="rhu" title="Patients">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-slate-900">
              Patients
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Master registry for patient profiles and demographics.
            </p>
          </div>
        </div>

        <ListToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name, ID, or assigned BHC..."
          chip={`● ${currentPatients.length.toLocaleString()} Patients`}
          filters={toolbarFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyToolbarFilters}
          onClearFilters={clearAllFilters}
          onRemoveFilter={removeFilter}
          actions={
            <Link
              to="/rhu/patients/add"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#092347]"
            >
              <Plus size={14} strokeWidth={2.5} />
              New Patient
            </Link>
          }
        />

        {/* Table Area */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between border-b border-slate-50 px-6 py-3 bg-slate-50/30">
            <h2 className="text-sm font-semibold text-slate-700">
              Patient Records
            </h2>
            <span className="text-xs text-slate-400">
              Showing {currentPatients.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
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
                    sortKey="name"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <th className="px-4 py-4">Age / Sex</th>
                  <SortableHeader
                    label="Barangay"
                    sortKey="barangay"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <th className="px-4 py-4">Contact</th>
                  <th className="px-4 py-4">Classification</th>
                  <SortableHeader
                    label="Last Visit"
                    sortKey="lastVisit"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-4 py-4"
                  />
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pagedPatients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-12 text-center text-sm text-slate-400"
                    >
                      No patients found. Try adjusting filters or add a new
                      patient.
                    </td>
                  </tr>
                ) : (
                  pagedPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="group transition-colors hover:bg-slate-50/30"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="font-mono text-xs font-medium text-slate-500">
                          {patient.id}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span className="text-sm font-semibold text-slate-900">
                          {patient.name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">
                        {patient.ageSex || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-600">
                        {patient.barangay || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-400">
                        {patient.contact || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <CategoryTag category={patient.category} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">
                        {patient.lastVisit || "-"}
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/30">
              <p className="text-xs text-slate-500">
                Showing {startRecord} to {endRecord} of {currentPatients.length}{" "}
                records
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

function CategoryTag({ category }) {
  const map = {
    "Pregnant Patient": "bg-pink-50 text-pink-700 border-pink-200",
    "Senior Citizen": "bg-violet-50 text-violet-700 border-violet-200",
    "General Consultation": "bg-blue-50 text-blue-700 border-blue-200",
    Immunization: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[category] || "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {category}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "For Referral": "bg-orange-50 text-orange-700 border-orange-200",
    "For Monitoring": "bg-amber-50 text-amber-700 border-amber-200",
    Completed: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || map.Active
      }`}
    >
      {status}
    </span>
  );
}

function ActionMenu({ patientId, patientName }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (
        btnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const menu = open && (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-10 mt-2 w-48 origin-top-right overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
      style={{ minWidth: "180px" }}
    >
      <div className="py-1">
        <div className="px-4 py-2 border-b border-slate-50">
          <p className="text-xs font-semibold text-slate-900 truncate">
            {patientName}
          </p>
          <p className="font-mono text-[10px] text-slate-400">{patientId}</p>
        </div>
        <Link
          to={`/rhu/patients/${patientId}`}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Eye size={14} className="text-slate-400" />
          View Details
        </Link>
        <Link
          to={`/rhu/health-records/add?patientId=${patientId}`}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <FilePlus2 size={14} className="text-slate-400" />
          Add Record
        </Link>
      </div>
    </div>
  );

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </div>
  );
}
