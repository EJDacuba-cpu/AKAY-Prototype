import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import TableSkeleton from "../../components/common/loading/TableSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";
import usePatients from "../../hooks/usePatients";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";

const PER_PAGE = 8;

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  barangay: "All Barangays",
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

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPatientSex(patient) {
  if (patient.sex) return formatDisplayValue(patient.sex, "");

  const ageSex = (patient.ageSex || "").toLowerCase();

  if (ageSex.endsWith("/f") || ageSex.includes("female")) return "Female";
  if (ageSex.endsWith("/m") || ageSex.includes("male")) return "Male";

  return "";
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
      patient.created_at ||
      patient.createdAt ||
      patient.registeredAt,
  );
}

export default function PatientsModule() {
  const {
    patients,
    filteredPatients,
    paginatedPatients,
    loading,
    filters,
    setFilters,
    currentPage,
    setCurrentPage,
    totalPages,
    error,
    refetchPatients,
    isRefreshing,
  } = usePatients();

  const barangayOptions = uniqueOptions(
    patients,
    [(patient) => patient.barangay],
    "All Barangays",
  );

  const civilStatusOptions = uniqueOptions(
    patients,
    [(patient) => patient.civilStatus],
    "All Civil Status",
  );

  const dropdownFilters = [
    {
      key: "barangay",
      label: "Barangay",
      value: filters.barangay,
      options: barangayOptions,
    },
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
    filters.barangay !== "All Barangays" && {
      key: "barangay",
      label: filters.barangay,
    },
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

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      barangay: "All Barangays",
      sex: "All",
      ageGroup: "All Age Groups",
      civilStatus: "All Civil Status",
      dateRegistered: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  return (
    <DashboardLayout role="bhc" title="Patients">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) =>
          setFilters((prev) => ({ ...prev, search: value }))
        }
        searchPlaceholder="Search by name, ID, contact, or barangay..."
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={applyDropdownFilters}
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
        actions={
          <Link
            to="/bhc/patients/add"
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Patient
          </Link>
        }
      />

      <div className="min-w-0">
        <RefreshingIndicator
          show={isRefreshing}
          label="Refreshing patients..."
          className="mb-3"
        />
        {loading ? (
          <TableSkeleton columns={6} rows={8} label="Loading patients..." />
        ) : (
          <BHCPatientsTable
            patients={paginatedPatients}
            error={error}
            onRetry={refetchPatients}
            currentPage={currentPage}
            totalPages={totalPages}
            setCurrentPage={setCurrentPage}
            filteredCount={filteredPatients.length}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function BHCPatientsTable({
  patients,
  error,
  onRetry,
  currentPage,
  totalPages,
  setCurrentPage,
  filteredCount,
}) {
  const startRecord =
    filteredCount === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1;
  const endRecord = Math.min(currentPage * PER_PAGE, filteredCount);

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
<tr className="border-b border-[#F1F5F9] bg-white text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              <th className="w-[120px] px-6 py-4">ID</th>
              <th className="w-[240px] px-4 py-4">Patient</th>
              <th className="w-[110px] px-4 py-4">Age / Sex</th>
              <th className="w-[150px] px-4 py-4">Contact</th>
              <th className="w-[140px] px-4 py-4">Date Registered</th>
              <th className="w-[90px] px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F1F5F9]">
            {error ? (
              <PatientTableState
                icon={<AlertCircle size={22} className="text-[#B91C1C]" />}
                title="Unable to load patients"
                description="Please check your connection and try again."
                action={
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#475569] shadow-sm transition hover:border-[#B91C1C]/30 hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                  >
                    <RefreshCw size={13} />
                    Retry
                  </button>
                }
              />
            ) : patients.length === 0 ? (
              <PatientTableState
                icon={<Users size={22} className="text-[#94A3B8]" />}
                title="No patients found"
                description="Registered patients will appear here once added."
                action={
                  <Link
                    to="/bhc/patients/add"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                  >
                    <Plus size={13} />
                    New Patient
                  </Link>
                }
              />
            ) : (
              patients.map((patient) => {
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
                        role="bhc"
                        patientId={patientId}
                        patientName={patientName}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!error && totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">
            Showing{" "}
            <span className="font-medium text-[#0F172A]">{startRecord}</span> to{" "}
            <span className="font-medium text-[#0F172A]">{endRecord}</span> of{" "}
            <span className="font-medium text-[#0F172A]">{filteredCount}</span>{" "}
            records
          </p>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            setCurrentPage={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}

function PatientTableState({ icon, title, description, action }) {
  return (
    <tr>
      <td colSpan={6} className="px-6 py-20 text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
            {icon}
          </div>
          <p className="text-[13px] font-semibold text-[#334155]">{title}</p>
          <p className="mt-1 text-[11.5px] text-[#94A3B8]">{description}</p>
          {action}
        </div>
      </td>
    </tr>
  );
}

function Pagination({ currentPage, totalPages, setCurrentPage }) {
  return (
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
        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        disabled={currentPage === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#94A3B8] transition hover:border-[#94A3B8] hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Next page"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function ActionMenu({ role, patientId, patientName }) {
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
  const basePath = role === "rhu" ? "/rhu" : "/bhc";
  const healthRecordLabel =
    role === "rhu" ? "Add RHU Health Record" : "Add Health Record";

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
            to={`${basePath}/patients/${displayPatientId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <Eye size={14} className="text-[#94A3B8]" />
            View Details
          </Link>

          <Link
            to={`${basePath}/health-records/add?patientId=${displayPatientId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <FilePlus2 size={14} className="text-[#94A3B8]" />
            {healthRecordLabel}
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
