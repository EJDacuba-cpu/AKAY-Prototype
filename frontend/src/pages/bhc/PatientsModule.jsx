import { PatientRegistrationEntryLink as Link } from "../../components/features/patients/PatientRegistrationEntry";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PanelRight, Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  ListFilterPopover,
  LoadMoreButton,
  RefreshingIndicator,
  SearchField,
  SearchFilterCluster,
  pickFilterValues,
} from "../../components/common";
import Drawer from "../../components/common/drawer/Drawer";
import { Button } from "../../components/ui/button";
import { SoftLoadingArea } from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import PatientSummaryPanel from "../../components/features/patients/PatientSummaryPanel";
import usePatients from "../../hooks/usePatients";
import useAccess from "../../hooks/useAccess";
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
import { listMonitoringHandoffRequests } from "../../services/monitoringHandoffService";
import { formatPatientName } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { showDirectoryRegisterAction } from "../../utils/patientDirectory";

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

// `embedded` lets a parent page (the RHU workspace) own the layout and the page title.
function Shell({ embedded, children, ...layoutProps }) {
  return embedded ? <>{children}</> : <DashboardLayout {...layoutProps}>{children}</DashboardLayout>;
}

export default function PatientsModule({ role = "bhc", basePath = "/bhc", embedded = false } = {}) {
  const canRegister = useAccess().can("patients.register") && showDirectoryRegisterAction(role);
  const addPatientPath = `${basePath}/patients/add`;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const showHandoffs = role === "bhc" && params.get("view") === "monitoring-requests";
  const handoffsQuery = useQuery({
    queryKey: queryKeys.monitoringHandoffs(),
    queryFn: listMonitoringHandoffRequests,
    enabled: showHandoffs,
  });
  const {
    patients,
    hasData: hasPatientData,
    filteredPatients,
    loading,
    filters,
    setFilters,
    queryError,
    refetchPatients,
    isRefreshing,
  } = usePatients(role);
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
      label: `Barangay: ${filters.barangay}`,
    },
    filters.sex !== "All" && { key: "sex", label: `Sex: ${filters.sex}` },
    filters.ageGroup !== "All Age Groups" && {
      key: "ageGroup",
      label: `Age Group: ${filters.ageGroup}`,
    },
    filters.civilStatus !== "All Civil Status" && {
      key: "civilStatus",
      label: `Civil Status: ${filters.civilStatus}`,
    },
    filters.dateRegistered && {
      key: "dateRegistered",
      label: `Date Registered: ${filters.dateRegistered}`,
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
  const hasData = showHandoffs ? Array.isArray(handoffsQuery.data) : hasPatientData;
  const activeError = showHandoffs ? handoffsQuery.error : queryError;
  const activeRefreshing = showHandoffs ? handoffsQuery.isFetching : isRefreshing;
  const activeRetry = showHandoffs ? handoffsQuery.refetch : refetchPatients;
  const showInitialLoading = showHandoffs ? handoffsQuery.isPending && !hasData : loading && !hasData;
  const showRefreshOverlay = activeRefreshing && hasData;

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

  if (activeError && (!hasData || [401, 403].includes(activeError.status))) {
    return (
      <Shell
        embedded={embedded}
        role={role}
        title={showHandoffs ? "Monitoring Requests" : "Patients"}
      >
        <ConnectionErrorState
          fullPage
          onRetry={() => activeRetry()}
          retrying={activeRefreshing}
          variant={errorStateVariant(activeError)}
        />
      </Shell>
    );
  }

  return (
    <Shell
      embedded={embedded}
      role={role}
      title={showHandoffs ? "Monitoring Requests" : "Patients"}
    >
      {activeError && hasData && <p role="status" className="mb-3 text-sm text-neutral-600">Unable to refresh this list. Showing the last list that loaded.</p>}
      <SoftLoadingArea skeleton="patients"
        bodyOnly={embedded}
        skeletonOptions={{ role, canRegister, view: showHandoffs ? "monitoring" : "directory" }}
        isLoading={showInitialLoading}
        message={showHandoffs ? "Loading monitoring requests..." : "Loading patients..."}
        scope="area"
        className="clinical-directory clinical-directory--patients"
      >
        {/* Toolbar spans the workspace; opening Details only resizes the panes below. */}
        {!showInitialLoading && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 shrink">
              {!embedded && (
                <>
                  <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
                    {showHandoffs ? "Monitoring Requests" : "Patients"}
                  </h1>
                  <p className="mt-1 text-[13px] text-neutral-600">
                    {showHandoffs
                      ? "RHU Manage to BHC handoffs for your catchment."
                      : `Patients registered in your ${role === "rhu" ? "RHU" : "BHC"}.`}
                  </p>
                </>
              )}
              <p className="sr-only" role="status">
                {showHandoffs
                  ? `${(handoffsQuery.data || []).length} monitoring request${(handoffsQuery.data || []).length === 1 ? "" : "s"}`
                  : patientCountLabel}
              </p>
            </div>
            {!showHandoffs ? (
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <SearchFilterCluster
                  search={
                    <SearchField
                      value={filters.search}
                      onChange={(value) =>
                        setFilters((prev) => ({ ...prev, search: value }))
                      }
                      placeholder="Search name, ID, or contact number..."
                      label="Search patients"
                    />
                  }
                  filter={
                    <ListFilterPopover
                      fields={dropdownFilters}
                      applied={{
                        barangay: filters.barangay,
                        sex: filters.sex,
                        ageGroup: filters.ageGroup,
                        civilStatus: filters.civilStatus,
                        dateRegistered: filters.dateRegistered,
                      }}
                      activeFilters={activeFilters}
                      activeCount={activeFilterCount}
                      onApply={applyDropdownFilters}
                      onRemoveFilter={removeFilter}
                      onClearAll={clearFilters}
                      pickValues={(current) =>
                        pickFilterValues(current, dropdownFilters)
                      }
                      buildDefaults={() => ({
                        barangay: "All Barangays",
                        sex: "All",
                        ageGroup: "All Age Groups",
                        civilStatus: "All Civil Status",
                        dateRegistered: "",
                      })}
                    />
                  }
                />
                {isDesktop ? (
                  <Button
                    variant="secondary"
                    type="button"
                    size="sm"
                    className="clinical-directory__details-toggle"
                    onClick={togglePanel}
                    aria-pressed={panelOpen}
                    aria-expanded={panelOpen}
                    aria-controls="patient-details-panel"
                    title={panelOpen ? "Hide patient details" : "Show patient details"}
                  >
                    <PanelRight size={14} strokeWidth={2.25} aria-hidden="true" />
                    Details
                  </Button>
                ) : null}
                {isDesktop && canRegister ? (
                  <Button asChild variant="brand" size="sm">
                    <Link to={addPatientPath}>
                      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                      New Patient
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        <div
          className={`clinical-directory__layout${
            isDesktop && !showInitialLoading
              ? ` clinical-directory__layout--preview${panelOpen ? " is-open" : ""}`
              : ""
          }`}
        >
          <div className="clinical-directory__main">
            <div
              ref={resultsRef}
              className="clinical-directory__results akay-scrollbar relative min-w-0"
            >
              {showRefreshOverlay && (
                <div className="pointer-events-none sticky top-0 z-10 flex h-0 justify-end">
                  <RefreshingIndicator label="Updating patients..." />
                </div>
              )}
              {!showInitialLoading && !showHandoffs && (
                <PatientDirectory
                  patients={visiblePatients}
                  canRegister={canRegister}
                  hasAnyFilter={hasAnyFilter}
                  hasMorePatients={hasMorePatients}
                  onLoadMore={loadMorePatients}
                  selectedPatientId={selectedPatientId}
                  onSelectPatient={selectPatient}
                  role={role}
                  basePath={basePath}
                  addPatientPath={addPatientPath}
                />
              )}
              {showHandoffs && (
                <MonitoringRequestList
                  requests={handoffsQuery.data || []}
                  loading={handoffsQuery.isLoading}
                  onOpen={(id) => navigate(`/bhc/patients/monitoring-requests/${id}`)}
                />
              )}
            </div>

            {/* Below desktop the toolbar button is hidden and this floating one takes
                over (one at a time). The anchor has no height, so the button floats
                over the list's bottom-right corner and cards scroll beneath it. */}
            {!showInitialLoading && !isDesktop && canRegister && !showHandoffs && (
              <div className="clinical-directory__fab-anchor">
                <Link to={addPatientPath} className="patients-fab" aria-label="New Patient">
                  <Plus size={24} strokeWidth={2.25} aria-hidden="true" />
                  <span className="patients-fab__tooltip" aria-hidden="true">New Patient</span>
                </Link>
              </div>
            )}
          </div>

          {isDesktop && !showInitialLoading && !showHandoffs && (
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
                    <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} basePath={basePath} showTitle />
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
          <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} basePath={basePath} />
        )}
      </Drawer>
    </Shell>
  );
}

function MonitoringRequestList({ requests, loading, onOpen }) {
  if (loading && requests.length === 0) {
    return <p className="px-6 py-10 text-sm text-neutral-500">Loading monitoring requests…</p>;
  }
  if (requests.length === 0) {
    return (
      <PatientDirectoryState
        icon={<Users size={22} className="text-gray-400" />}
        title="No monitoring requests."
        description="RHU Manage to BHC requests for this Barangay Health Center will appear here."
      />
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
      {requests.map((request) => (
        <li key={request.id}>
          <button
            type="button"
            onClick={() => onOpen(request.id)}
            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
          >
            <span>
              <span className="block text-sm font-semibold text-ink-900">{formatPatientName(request.source_patient) || "Patient"}</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                {request.condition?.name || "Condition"} · {request.sending_rhu?.name || "RHU"}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {String(request.status || "").replaceAll("_", " ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PatientDirectory({
  patients,
  canRegister,
  hasAnyFilter,
  hasMorePatients,
  onLoadMore,
  selectedPatientId,
  onSelectPatient,
  role,
  basePath,
  addPatientPath,
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
                : canRegister
                  ? "Tap New Patient to start."
                  : role === "rhu"
                    ? (
                      <>
                        Register walk-in patients from{" "}
                        <Link to="/rhu/walk-in-check-in" className="font-medium text-ink-700 underline">
                          Walk-in Check-in
                        </Link>
                        .
                      </>
                    )
                    : "No patients registered at this facility."
            }
            action={
              !hasAnyFilter && canRegister && (
                <Link
                  to={addPatientPath}
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
                  basePath={basePath}
                  role={role}
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
