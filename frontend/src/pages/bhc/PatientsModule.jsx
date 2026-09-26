import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, RefreshingIndicator } from "../../components/common";
import Drawer from "../../components/common/drawer/Drawer";
import ModuleToolbar from "../../components/common/list/ModuleToolbar";
import {
  DottedSpinner,
  SoftLoadingArea,
} from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import PatientSummaryPanel from "../../components/features/patients/PatientSummaryPanel";
import usePatients from "../../hooks/usePatients";
import useMediaQuery from "../../hooks/useMediaQuery";
import { isConnectionError } from "../../services/apiClient";
import {
  getPatientKey,
  reconcileSelection,
  toggleSelection,
} from "../../utils/directorySelection";
import { formatDisplayValue } from "../../utils/formatters";
import "../../components/features/patients/clinical-directory.css";

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  barangay: "All Barangays",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};
// Wide enough for the results grid AND a permanent preview panel.
const PREVIEW_QUERY = "(min-width: 1280px)";
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
    queryError,
    refetchPatients,
    isRefreshing,
  } = usePatients();
  const [visibleCount, setVisibleCount] = useState(PATIENTS_BATCH_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const showInlinePreview = useMediaQuery(PREVIEW_QUERY);

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
  const isNarrowed = hasAnyFilter || Boolean(filters.search);
  const patientCountLabel = isNarrowed
    ? `${filteredPatients.length} of ${patients.length} patients`
    : `${patients.length} registered patient${patients.length === 1 ? "" : "s"}`;
  const visiblePatients = filteredPatients.slice(0, visibleCount);
  const hasMorePatients = visibleCount < filteredPatients.length;
  const showInitialLoading = loading && patients.length === 0;
  const showRefreshOverlay = isRefreshing && patients.length > 0;

  useEffect(() => {
    setVisibleCount(PATIENTS_BATCH_SIZE);
    setLoadingMore(false);
  }, [filters]);

  // Close the preview once its patient is filtered out of the directory.
  const selectedStillListed =
    reconcileSelection(selectedPatientId, filteredPatients) === selectedPatientId;
  useEffect(() => {
    if (!selectedStillListed) setSelectedPatientId(null);
  }, [selectedStillListed]);

  useEffect(() => {
    if (!selectedPatientId) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setSelectedPatientId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPatientId]);

  function toggleSelectedPatient(patientId) {
    setSelectedPatientId((current) => toggleSelection(current, patientId));
  }

  function closeSummary() {
    setSelectedPatientId(null);
  }

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

  if (error) {
    return (
      <DashboardLayout role="bhc" title="Patients">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetchPatients()}
          retrying={isRefreshing}
          variant={
            queryError?.isTimeout
              ? "timeout"
              : isConnectionError(queryError)
                ? "offline"
                : "error"
          }
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Patients">
      <SoftLoadingArea
        isLoading={showInitialLoading}
        message="Loading patients..."
        scope="area"
        className="clinical-directory"
      >
        {!showInitialLoading && (
          <>
          <ModuleToolbar
            variant="clinical"
            heading={
              <div className="clinical-directory__heading min-w-0">
                <h1 className="clinical-directory__title">Patients</h1>
                <p className="clinical-directory__count">{patientCountLabel}</p>
              </div>
            }
            searchValue={filters.search}
            onSearchChange={(value) =>
              setFilters((prev) => ({ ...prev, search: value }))
            }
            searchPlaceholder="Search name, ID, or contact number..."
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
          />
          </>
        )}

        <div
          className={`clinical-directory__layout${
            showInlinePreview && !showInitialLoading ? " clinical-directory__layout--preview" : ""
          }`}
        >
          <div className="clinical-directory__results relative min-w-0">
            {showRefreshOverlay && (
              <div className="pointer-events-none absolute right-0 top-0 z-10">
                <RefreshingIndicator label="Updating patients..." />
              </div>
            )}
            {!showInitialLoading && (
              <PatientDirectory
                patients={visiblePatients}
                hasAnyFilter={hasAnyFilter}
                hasMorePatients={hasMorePatients}
                loadingMore={loadingMore}
                loadMoreRef={loadMoreRef}
                selectedPatientId={selectedPatientId}
                onSelectPatient={toggleSelectedPatient}
              />
            )}
          </div>

          {showInlinePreview && !showInitialLoading && (
            <aside className="clinical-directory__preview" aria-label="Patient preview">
              {selectedPatientId ? (
                <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} showTitle />
              ) : (
                <div className="clinical-directory__preview-empty">
                  <p className="clinical-directory__preview-empty-title">Select a patient to preview</p>
                  <p className="clinical-directory__preview-empty-hint">
                    Click a patient card to see their summary here.
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>
      </SoftLoadingArea>
      <Drawer
        open={!showInlinePreview && Boolean(selectedPatientId)}
        onClose={closeSummary}
        title="Patient Summary"
        widthClassName="w-full sm:w-[420px]"
      >
        {selectedPatientId && (
          <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} />
        )}
      </Drawer>
    </DashboardLayout>
  );
}

function PatientDirectory({
  patients,
  hasAnyFilter,
  hasMorePatients,
  loadingMore,
  loadMoreRef,
  selectedPatientId,
  onSelectPatient,
}) {
  return (
    <section className="anim-fade-up min-w-0">
      <div>
        {patients.length === 0 ? (
          <PatientDirectoryState
            icon={<Users size={22} className="text-gray-400" />}
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
                  className="mt-4 inline-flex items-center gap-2 rounded-none bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                >
                  <Plus size={13} />
                  New Patient
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="clinical-directory__grid">
              {patients.map((patient) => (
                <PatientDirectoryCard
                  key={patient.id || patient.patientId}
                  patient={patient}
                  basePath="/bhc"
                  variant="clinical"
                  onSelect={onSelectPatient}
                  selected={getPatientKey(patient) === selectedPatientId}
                />
              ))}
            </div>

            {(loadingMore || hasMorePatients) && (
              <div ref={loadMoreRef} className="mt-3">
                {loadingMore ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-5">
                    <DottedSpinner label="Loading more patients" />
                    <span className="text-[11px] font-medium text-gray-400">
                      Loading more patients...
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] font-medium text-gray-400">
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
        <p className="mt-1 text-[11.5px] text-gray-400">{description}</p>
        {action}
      </div>
    </div>
  );
}
