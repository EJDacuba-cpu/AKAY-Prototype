import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  Users,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ModuleToolbar from "../../components/common/list/ModuleToolbar";
import {
  DottedSpinner,
  SoftLoadingArea,
} from "../../components/common/loading/SoftLoadingOverlay";
import usePatients from "../../hooks/usePatients";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  barangay: "All Barangays",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};
const PATIENTS_BATCH_SIZE = 12;

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

  if (!normalized) return "Not recorded";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "Not recorded";

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

function getPatientAgeSex(patient) {
  return formatDisplayValue(
    patient.ageSex ||
      [patient.age, getPatientSex(patient)].filter(Boolean).join(" / "),
    "Not recorded",
  );
}

function getPatientContact(patient) {
  return formatDisplayValue(
    patient.contact ||
      patient.contactNumber ||
      patient.phone ||
      patient.mobileNumber,
    "Not recorded",
  );
}

function getPatientBarangay(patient) {
  return formatDisplayValue(
    patient.barangay || patient.assignedBhc || patient.assignedBHC,
    "Not recorded",
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

function getPatientDisplayId(patient) {
  return formatDisplayValue(patient.patientId || patient.id, "Not recorded");
}

export default function PatientsModule() {
  const {
    patients,
    filteredPatients,
    loading,
    filters,
    setFilters,
    error,
    refetchPatients,
    isRefreshing,
  } = usePatients();
  const [visibleCount, setVisibleCount] = useState(PATIENTS_BATCH_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);

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
  const hasAnyFilter = activeFilters.length > 0;
  const visiblePatients = filteredPatients.slice(0, visibleCount);
  const hasMorePatients = visibleCount < filteredPatients.length;
  const showInitialLoading = loading && patients.length === 0;
  const showRefreshOverlay = isRefreshing && patients.length > 0;
  const showLoadingOverlay = showInitialLoading || showRefreshOverlay;

  useEffect(() => {
    setVisibleCount(PATIENTS_BATCH_SIZE);
    setLoadingMore(false);
  }, [filters]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMorePatients || loadingMore) {
      return undefined;
    }

    let loadTimer;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        setLoadingMore(true);
        loadTimer = window.setTimeout(() => {
          setVisibleCount((current) =>
            Math.min(current + PATIENTS_BATCH_SIZE, filteredPatients.length),
          );
          setLoadingMore(false);
        }, 220);
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
      if (loadTimer) window.clearTimeout(loadTimer);
    };
  }, [filteredPatients.length, hasMorePatients, loadingMore]);

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
      <SoftLoadingArea
        isLoading={showLoadingOverlay}
        message={
          showInitialLoading ? "Loading patients..." : "Refreshing patients..."
        }
      >
        <ModuleToolbar
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
          filterDescription="Narrow the patient directory."
          primaryActionTo="/bhc/patients/add"
          primaryActionLabel="New Patient"
          primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
          disabled={showLoadingOverlay}
        />

      <div className="relative min-w-0">
        {!showInitialLoading && (
          <PatientDirectory
            patients={visiblePatients}
            error={error}
            onRetry={refetchPatients}
            hasAnyFilter={hasAnyFilter}
            hasMorePatients={hasMorePatients}
            loadingMore={loadingMore}
            loadMoreRef={loadMoreRef}
          />
        )}
      </div>
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function PatientDirectory({
  patients,
  error,
  onRetry,
  hasAnyFilter,
  hasMorePatients,
  loadingMore,
  loadMoreRef,
}) {
  return (
    <section className="anim-fade-up">
      <div>
        {error ? (
          <PatientDirectoryState
            icon={<AlertCircle size={22} className="text-[#B91C1C]" />}
            title="Unable to load patients"
            description="Please check your connection and try again."
            action={
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#475569] shadow-sm transition hover:border-[#B91C1C]/30 hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
              >
                Retry
              </button>
            }
          />
        ) : patients.length === 0 ? (
          <PatientDirectoryState
            icon={<Users size={22} className="text-[#94A3B8]" />}
            title={hasAnyFilter ? "No patients found." : "No patients yet."}
            description={
              hasAnyFilter
                ? "Try another search or filter."
                : "Tap New Patient to start."
            }
            action={
              !hasAnyFilter && (
                <Link
                  to="/bhc/patients/add"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                >
                  <Plus size={13} />
                  New Patient
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {patients.map((patient) => (
                <PatientCard key={patient.id} patient={patient} />
              ))}
            </div>

            {(loadingMore || hasMorePatients) && (
              <div ref={loadMoreRef} className="mt-3">
                {loadingMore ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-5">
                    <DottedSpinner label="Loading more patients" />
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      Loading more patients...
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      Scroll to load more patients
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PatientCard({ patient }) {
  const routePatientId = formatDisplayValue(patient.id, "");
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const displayId = getPatientDisplayId(patient);
  const ageSex = getPatientAgeSex(patient);
  const contact = getPatientContact(patient);
  const barangay = getPatientBarangay(patient);
  const registeredDate = formatDate(getRegisteredDate(patient));

  return (
    <article className="group flex min-h-[204px] flex-col rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm shadow-black/[0.015] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-100 hover:shadow-md">
      <div className="min-w-0 border-b border-[#F1F5F9] pb-3">
        <h3 className="truncate text-sm font-bold text-[#0F172A]">
          {patientName}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-md border border-red-100 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
            ID: {displayId}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[12px]">
        <CardField label="Age / Sex" value={ageSex} />
        <CardField label="Contact" value={contact} />
        <CardField label="Barangay" value={barangay} />
        <CardField label="Registered Date" value={registeredDate} />
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
        <Link
          to={`/bhc/patients/${routePatientId}`}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#B91C1C] px-1.5 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
        >
          <Eye size={13} />
          View Details
        </Link>
        <Link
          to={`/bhc/patients/${routePatientId}`}
          state={{ startInEditMode: true }}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[10px] font-semibold text-[#475569] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
        >
          <Pencil size={13} />
          Edit
        </Link>
        <Link
          to={`/bhc/health-records/add?patientId=${routePatientId}`}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[10px] font-semibold text-[#475569] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
        >
          <FilePlus2 size={13} />
          Add Record
        </Link>
      </div>
    </article>
  );
}

function CardField({ label, value }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-semibold text-[#475569]">
        {value}
      </span>
    </div>
  );
}

function PatientDirectoryState({ icon, title, description, action }) {
  return (
    <div className="px-6 py-20 text-center">
      <div className="flex flex-col items-center justify-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
          {icon}
        </div>
        <p className="text-[13px] font-semibold text-[#334155]">{title}</p>
        <p className="mt-1 text-[11.5px] text-[#94A3B8]">{description}</p>
        {action}
      </div>
    </div>
  );
}
