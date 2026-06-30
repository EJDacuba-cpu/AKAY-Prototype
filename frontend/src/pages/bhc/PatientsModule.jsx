import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ModuleToolbar from "../../components/common/list/ModuleToolbar";
import {
  DottedSpinner,
  SoftLoadingArea,
} from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import usePatients from "../../hooks/usePatients";
import { formatDisplayValue } from "../../utils/formatters";

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
        scope="page"
      >
        {!showInitialLoading && (
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
        )}

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
                <PatientDirectoryCard
                  key={patient.id || patient.patientId}
                  patient={patient}
                  basePath="/bhc"
                />
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
