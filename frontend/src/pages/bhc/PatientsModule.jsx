import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PanelRight, Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  LoadMoreButton,
  RefreshingIndicator,
} from "../../components/common";
import Drawer from "../../components/common/drawer/Drawer";
import ModuleToolbar from "../../components/common/list/ModuleToolbar";
import { SoftLoadingArea } from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import PatientSummaryPanel from "../../components/features/patients/PatientSummaryPanel";
import usePatients from "../../hooks/usePatients";
import useLoadMore from "../../hooks/useLoadMore";
import { PATIENTS_LOAD_BATCH } from "../../utils/tablePaging";
import useMediaQuery from "../../hooks/useMediaQuery";
import {
  getPatientKey,
  reconcileSelection,
  selectCard,
} from "../../utils/directorySelection";
import { formatDisplayValue } from "../../utils/formatters";
import "../../components/features/patients/clinical-directory.css";
import { errorStateVariant } from "../../utils/errorStateVariant";

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  barangay: "All Barangays",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};
// Desktop: the toolbar carries New Patient and Details, and the summary shows in
// the collapsible details panel. Below it, the floating New Patient button
// replaces the toolbar one and the summary opens in a Drawer. Keep in sync with
// clinical-directory.css.
const DESKTOP_QUERY = "(min-width: 1024px)";
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
  const resultsRef = useRef(null);
  // The details panel starts collapsed; a card click selects a patient and opens it.
  const [panel, setPanel] = useState({ selectedId: null, open: false });
  const { selectedId: selectedPatientId, open: panelOpen } = panel;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

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
  const {
    visibleItems: visiblePatients,
    hasMore: hasMorePatients,
    loadMore: loadMorePatients,
  } = useLoadMore(filteredPatients, PATIENTS_LOAD_BATCH, filters);
  const showInitialLoading = loading && patients.length === 0;
  const showRefreshOverlay = isRefreshing && patients.length > 0;

  useEffect(() => {
    // The card list scrolls on its own: a new search/filter starts at the top.
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }, [filters]);

  // Clear the selection once its patient is filtered out of the directory.
  const selectedStillListed =
    reconcileSelection(selectedPatientId, filteredPatients) === selectedPatientId;
  useEffect(() => {
    if (!selectedStillListed) setPanel((current) => ({ ...current, selectedId: null }));
  }, [selectedStillListed]);

  const summaryShown = Boolean(selectedPatientId) && (panelOpen || !isDesktop);
  useEffect(() => {
    if (!summaryShown) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") closeSummary();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [summaryShown]);

  function selectPatient(patientId) {
    setPanel((current) => selectCard(current, patientId));
  }

  function togglePanel() {
    setPanel((current) => ({ ...current, open: !current.open }));
  }

  function closeSummary() {
    setPanel({ selectedId: null, open: false });
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
          variant={errorStateVariant(queryError)}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Patients">
      <SoftLoadingArea skeleton="table"
        isLoading={showInitialLoading}
        message="Loading patients..."
        scope="area"
        className="clinical-directory"
      >
        <div
          className={`clinical-directory__layout${
            isDesktop && !showInitialLoading
              ? ` clinical-directory__layout--preview${panelOpen ? " is-open" : ""}`
              : ""
          }`}
        >
          {/* Left column: the pinned header (title, search, filters, New Patient)
              above the card list, which is the only part that scrolls. */}
          <div className="clinical-directory__main">
            {!showInitialLoading && (
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
                primaryActionTo={isDesktop ? "/bhc/patients/add" : undefined}
                primaryActionLabel={isDesktop ? "New Patient" : undefined}
                primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
                actions={
                  isDesktop && (
                    <button
                      type="button"
                      className="clinical-directory__details-toggle"
                      onClick={togglePanel}
                      aria-pressed={panelOpen}
                      aria-controls="patient-details-panel"
                      title={panelOpen ? "Hide patient details" : "Show patient details"}
                    >
                      <PanelRight size={14} strokeWidth={2.25} aria-hidden="true" />
                      Details
                    </button>
                  )
                }
              />
            )}

            <div
              ref={resultsRef}
              className="clinical-directory__results akay-scrollbar relative min-w-0"
            >
              {showRefreshOverlay && (
                <div className="pointer-events-none sticky top-0 z-10 flex h-0 justify-end">
                  <RefreshingIndicator label="Updating patients..." />
                </div>
              )}
              {!showInitialLoading && (
                <PatientDirectory
                  patients={visiblePatients}
                  hasAnyFilter={hasAnyFilter}
                  hasMorePatients={hasMorePatients}
                  onLoadMore={loadMorePatients}
                  selectedPatientId={selectedPatientId}
                  onSelectPatient={selectPatient}
                />
              )}
            </div>

            {/* Below desktop the toolbar button is hidden and this floating one takes
                over (one at a time). The anchor has no height, so the button floats
                over the list's bottom-right corner and cards scroll beneath it. */}
            {!showInitialLoading && !isDesktop && (
              <div className="clinical-directory__fab-anchor">
                <Link to="/bhc/patients/add" className="patients-fab" aria-label="New Patient">
                  <Plus size={24} strokeWidth={2.25} aria-hidden="true" />
                  <span className="patients-fab__tooltip" aria-hidden="true">New Patient</span>
                </Link>
              </div>
            )}
          </div>

          {isDesktop && !showInitialLoading && (
            <aside
              className="clinical-directory__details"
              data-open={panelOpen}
              aria-label="Patient details"
              inert={!panelOpen}
            >
              <div
                id="patient-details-panel"
                className="clinical-directory__preview"
              >
                {panelOpen &&
                  (selectedPatientId ? (
                    <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} showTitle />
                  ) : (
                    <div className="clinical-directory__preview-empty">
                      <p className="clinical-directory__preview-empty-title">Select a patient to preview</p>
                      <p className="clinical-directory__preview-empty-hint">
                        Click a patient card to see their summary here.
                      </p>
                    </div>
                  ))}
              </div>
            </aside>
          )}
        </div>
      </SoftLoadingArea>
      <Drawer
        open={!isDesktop && Boolean(selectedPatientId)}
        onClose={closeSummary}
        title="Patient Summary"
        widthClassName="w-full sm:w-[420px]"
      >
        {!isDesktop && selectedPatientId && (
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
  onLoadMore,
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
                  role="bhc"
                  onSelect={onSelectPatient}
                  selected={getPatientKey(patient) === selectedPatientId}
                />
              ))}
            </div>

            {hasMorePatients && (
              <div className="flex justify-center py-3">
                <LoadMoreButton label="Load more patients" onClick={onLoadMore} />
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
