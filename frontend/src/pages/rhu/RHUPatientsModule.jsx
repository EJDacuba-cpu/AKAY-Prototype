import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import TableSkeleton from "../../components/common/loading/TableSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";
import { getRhuPatients } from "../../services/patientService";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const PER_PAGE = 8;

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};

function uniqueOptions(items, selectors, fallback) {
  const values = items
    .flatMap((item) => selectors.map((selector) => selector(item)))
    .map((value) => formatDisplayValue(value, ""))
    .filter(Boolean);

  return [fallback, ...new Set(values)];
}

function normalizeDate(value) {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function formatDate(value) {
  const normalized = normalizeDate(value);

  if (!normalized) return "-";

  return normalized;
}

function getPatientSex(patient) {
  if (patient.sex) return formatDisplayValue(patient.sex, "");

  const ageSex = (patient.ageSex || "").toLowerCase();

  if (ageSex.endsWith("/f") || ageSex.includes("female")) return "Female";
  if (ageSex.endsWith("/m") || ageSex.includes("male")) return "Male";

  return "";
}

function getPatientAge(patient) {
  const rawAge = patient.age || patient.ageSex || "";
  const match = rawAge.toString().match(/\d+/);

  return match ? Number(match[0]) : null;
}

function getPatientContact(patient) {
  return formatDisplayValue(
    patient.contact ||
      patient.contactNumber ||
      patient.phone ||
      patient.mobileNumber,
    "",
  );
}

function getRegisteredDate(patient) {
  return normalizeDate(
    patient.dateRegistered ||
      patient.date_registered ||
      patient.createdAt ||
      patient.registeredAt,
  );
}

export default function Patients() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: patientsData = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.patients("rhu"),
    queryFn: getRhuPatients,
  });

  const allPatients = useMemo(
    () => (Array.isArray(patientsData) ? patientsData : []),
    [patientsData],
  );
  const loading = isLoading && allPatients.length === 0;

  const civilStatusOptions = uniqueOptions(
    allPatients,
    [(patient) => patient.civilStatus],
    "All Civil Status",
  );

  const filteredPatients = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    const filtered = allPatients.filter((patient) => {
      const sex = getPatientSex(patient);
      const age = getPatientAge(patient);
      const contact = getPatientContact(patient);
      const registeredDate = getRegisteredDate(patient);

      const searchText = [
        patient.id,
        formatPatientName(patient, ""),
        contact,
        patient.email,
        patient.civilStatus,
        registeredDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchText.includes(query);

      const matchesSex = filters.sex === "All" || sex === filters.sex;

      const matchesAgeGroup =
        filters.ageGroup === "All Age Groups" ||
        (filters.ageGroup === "Child" && age !== null && age <= 17) ||
        (filters.ageGroup === "Adult" &&
          age !== null &&
          age >= 18 &&
          age <= 59) ||
        (filters.ageGroup === "Senior" && age !== null && age >= 60);

      const matchesCivilStatus =
        filters.civilStatus === "All Civil Status" ||
        patient.civilStatus === filters.civilStatus;

      const matchesDate =
        !filters.dateRegistered || registeredDate === filters.dateRegistered;

      return (
        matchesSearch &&
        matchesSex &&
        matchesAgeGroup &&
        matchesCivilStatus &&
        matchesDate
      );
    });

    return filtered.sort((a, b) => {
      const getValue = (patient) => {
        if (sortKey === "contact") return getPatientContact(patient);
        if (sortKey === "registeredDate") return getRegisteredDate(patient);
        if (sortKey === "sex") return getPatientSex(patient);
        if (sortKey === "name") return formatPatientName(patient, "");

        return formatDisplayValue(patient[sortKey], "");
      };

      const aValue = String(getValue(a)).toLowerCase();
      const bValue = String(getValue(b)).toLowerCase();
      const comparison = aValue.localeCompare(bValue);

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [allPatients, filters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PER_PAGE));

  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir("asc");
  }

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      sex: "All",
      ageGroup: "All Age Groups",
      civilStatus: "All Civil Status",
      dateRegistered: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  const dropdownFilters = [
    {
      key: "sex",
      label: "Sex",
      value: filters.sex,
      options: ["All", "Male", "Female"],
    },
    {
      key: "ageGroup",
      label: "Age Group",
      value: filters.ageGroup,
      options: ["All Age Groups", "Child", "Adult", "Senior"],
    },
    {
      key: "civilStatus",
      label: "Civil Status",
      value: filters.civilStatus,
      options: civilStatusOptions,
    },
    {
      key: "dateRegistered",
      label: "Date Registered",
      value: filters.dateRegistered,
      type: "date",
    },
  ];

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.sex !== "All" && { key: "sex", label: filters.sex },
    filters.ageGroup !== "All Age Groups" && {
      key: "ageGroup",
      label: filters.ageGroup,
    },
    filters.civilStatus !== "All Civil Status" && {
      key: "civilStatus",
      label: filters.civilStatus,
    },
    filters.dateRegistered && {
      key: "dateRegistered",
      label: filters.dateRegistered,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  return (
    <DashboardLayout role="rhu" title="Patients">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) =>
          setFilters((prev) => ({ ...prev, search: value }))
        }
        searchPlaceholder="Search by name, ID, or contact..."
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={applyDropdownFilters}
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
        actions={
          <Link
            to="/rhu/patients/add"
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Patient
          </Link>
        }
      />

      <div className="min-w-0">
        <RefreshingIndicator
          show={isFetching && !loading}
          label="Refreshing patients..."
          className="mb-3"
        />
        {loading ? (
          <TableSkeleton columns={6} rows={8} label="Loading patients..." />
        ) : paginatedPatients.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-24 text-center shadow-sm">
            <div className="flex flex-col items-center justify-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                <Users size={20} className="text-[#94A3B8]" />
              </div>

              <p className="text-[13px] font-semibold text-[#334155]">
                No Matching Patients
              </p>

              <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                Try adjusting your search or filter criteria.
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-[11px] font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
              >
                Clear current filters
              </button>
            </div>
          </div>
        ) : (
          <RHUPatientsTable
            patients={paginatedPatients}
            currentPage={currentPage}
            totalPages={totalPages}
            setCurrentPage={setCurrentPage}
            filteredCount={filteredPatients.length}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function RHUPatientsTable({
  patients,
  currentPage,
  totalPages,
  setCurrentPage,
  filteredCount,
  sortKey,
  sortDir,
  onSort,
}) {
  const startRecord =
    filteredCount === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1;
  const endRecord = Math.min(currentPage * PER_PAGE, filteredCount);

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              <SortableHeader
                label="ID"
                sortKey="id"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-[120px] px-6 py-4"
              />

              <SortableHeader
                label="Patient"
                sortKey="name"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-[240px] px-4 py-4"
              />

              <th className="w-[110px] px-4 py-4">Age / Sex</th>

              <SortableHeader
                label="Contact"
                sortKey="contact"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-[150px] px-4 py-4"
              />

              <SortableHeader
                label="Date Registered"
                sortKey="registeredDate"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-[140px] px-4 py-4"
              />

              <th className="w-[90px] px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F1F5F9]">
            {patients.map((patient) => {
                const patientId = formatDisplayValue(patient.id, "");
                const patientName = formatPatientName(
                  patient,
                  "Unnamed Patient",
                );
                const contact = getPatientContact(patient);
                const registeredDate = getRegisteredDate(patient);
                const ageSex = formatDisplayValue(
                  patient.ageSex ||
                    [patient.age, getPatientSex(patient)]
                      .filter(Boolean)
                      .join(" / "),
                  "-",
                );

                return (
                  <tr
                    key={patientId}
                    className="group transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-mono text-xs font-medium text-[#64748B]">
                        {patientId}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {patientName}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-sm text-[#64748B]">
                      {ageSex}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-sm text-[#64748B]">
                      {contact || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-sm text-[#64748B]">
                      {formatDate(registeredDate)}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <ActionMenu
                        patientId={patientId}
                        patientName={patientName}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">
            Showing{" "}
            <span className="font-medium text-[#0F172A]">{startRecord}</span> to{" "}
            <span className="font-medium text-[#0F172A]">{endRecord}</span> of{" "}
            <span className="font-medium text-[#0F172A]">{filteredCount}</span>{" "}
            records
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#94A3B8] transition hover:border-[#94A3B8] hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                    pageNumber === currentPage
                      ? "bg-[#B91C1C] text-white shadow-sm"
                      : "text-[#475569] hover:bg-white"
                  }`}
                >
                  {pageNumber}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#94A3B8] transition hover:border-[#94A3B8] hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
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
      className={`${className} cursor-pointer select-none transition-colors hover:text-[#334155]`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        {label}
        <span
          className={`text-[10px] ${
            isActive ? "text-[#0F172A]" : "text-[#CBD5E1]"
          }`}
        >
          {isActive ? (currentDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </div>
    </th>
  );
}

function ActionMenu({ patientId, patientName }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 150;
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

    function handleOutside(event) {
      if (
        btnRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpen(false);
    }

    function handleWindowChange() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open]);

  const displayName = formatDisplayValue(patientName, "Patient");
  const displayPatientId = formatDisplayValue(patientId, "");

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[9999] w-48 origin-top-right overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
        style={{
          top: position.top,
          left: position.left,
          minWidth: "180px",
        }}
      >
        <div className="py-1">
          <div className="border-b border-[#F1F5F9] px-4 py-2">
            <p className="truncate text-xs font-semibold text-[#0F172A]">
              {displayName}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              {displayPatientId}
            </p>
          </div>

          <Link
            to={`/rhu/patients/${displayPatientId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <Eye size={14} className="text-[#94A3B8]" />
            View Details
          </Link>

          <Link
            to={`/rhu/health-records/add?patientId=${displayPatientId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <FilePlus2 size={14} className="text-[#94A3B8]" />
            Add RHU Health Record
          </Link>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#475569]"
        aria-label={`Open actions for ${displayName}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {menu}
    </div>
  );
}
