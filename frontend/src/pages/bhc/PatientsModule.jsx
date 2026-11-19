import { PatientRegistrationEntryLink as Link } from "../../components/features/patients/PatientRegistrationEntry";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PanelRight, Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import usePagedRows from "../../hooks/usePagedRows";
import {
  ActionMenu,
  FixedTable,
  TablePagination,
  ConnectionErrorState,
  FilteredEmptyPanel,
  ListFilterPopover,
  LoadMoreButton,
  RefreshingIndicator,
  SearchField,
  SearchFilterCluster,
  pickFilterValues,
} from "../../components/common";
import PlainStatusStamp from "../../components/common/badges/PlainStatusStamp";
import Drawer from "../../components/common/drawer/Drawer";
import { Button } from "../../components/ui/button";
import { SoftLoadingArea } from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import PatientSummaryPanel from "../../components/features/patients/PatientSummaryPanel";
import usePatients from "../../hooks/usePatients";
import useAccess from "../../hooks/useAccess";
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
import { fetchAllReportPages } from "../../services/reportingLists";
import { formatPatientName } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { showDirectoryRegisterAction } from "../../utils/patientDirectory";
import {
  KIND_TB_ENDORSEMENT,
  filterMonitoringInbox,
  mergeMonitoringInbox,
  monitoringInboxShowsTbReview,
  monitoringInboxStatusTone,
} from "../../utils/pendingHandoffInbox";
import BhcTbEndorsements from "./BhcTbEndorsements";

const DEFAULT_MONITORING_FILTERS = { search: "", type: "", status: "" };

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
// `embedded` lets a parent page (the RHU workspace) own the layout and the page title.
function Shell({ embedded, children, ...layoutProps }) {
  return embedded ? <>{children}</> : <DashboardLayout {...layoutProps}>{children}</DashboardLayout>;
}

export default function PatientsModule({ role = "bhc", basePath = "/bhc", embedded = false, showEmbeddedHeading = false } = {}) {
  const access = useAccess();
  const canRegister = access.can("patients.register") && showDirectoryRegisterAction(role);
  const addPatientPath = `${basePath}/patients/add`;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const showHandoffs = role === "bhc" && params.get("view") === "monitoring-requests";
  const canTbEndorsements = role === "bhc" && access.can("clinical.history");
  // Deep links (legacy tab / case / endorsement) open the existing TB review UI.
  const showTbReview = showHandoffs && monitoringInboxShowsTbReview(params, { canTbEndorsements });
  const showUnifiedInbox = showHandoffs && !showTbReview;
  const [monitoringFilters, setMonitoringFilters] = useState(DEFAULT_MONITORING_FILTERS);
  const handoffsQuery = useQuery({
    queryKey: queryKeys.monitoringHandoffs(),
    queryFn: listMonitoringHandoffRequests,
    enabled: showUnifiedInbox,
  });
  const tbInboxQuery = useQuery({
    queryKey: ["tb-endorsements", "inbox", "all-pages"],
    queryFn: () => fetchAllReportPages("/tb-endorsements"),
    enabled: showUnifiedInbox && canTbEndorsements,
    retry: false,
  });
  const unifiedInboxRows = mergeMonitoringInbox({
    handoffs: handoffsQuery.data || [],
    endorsements: tbInboxQuery.data || [],
    includeTb: canTbEndorsements,
  });
  const visibleInboxRows = filterMonitoringInbox(unifiedInboxRows, monitoringFilters);
  const monitoringFilterFields = [
    { key: "type", label: "Type", rowKey: "typeLabel", allLabel: "All types" },
    { key: "status", label: "Status", rowKey: "statusLabel", allLabel: "All statuses" },
  ].map(({ key, label, rowKey, allLabel }) => ({
    key,
    label,
    resetValue: "",
    options: [
      { value: "", label: allLabel },
      ...new Set([...unifiedInboxRows.map((row) => row[rowKey]), monitoringFilters[key]].filter(Boolean)),
    ],
  }));
  const activeMonitoringFilters = monitoringFilterFields
    .filter(({ key }) => monitoringFilters[key])
    .map(({ key, label }) => ({ key, label: `${label}: ${monitoringFilters[key]}` }));
  const isMonitoringFiltered = Boolean(monitoringFilters.search.trim() || activeMonitoringFilters.length);

  function clearMonitoringFilters() {
    setMonitoringFilters(DEFAULT_MONITORING_FILTERS);
  }

  function openMonitoringInboxRow(row) {
    if (row.kind === KIND_TB_ENDORSEMENT) {
      const next = new URLSearchParams(params);
      next.set("view", "monitoring-requests");
      next.set("endorsement", String(row.id));
      if (row.caseId) next.set("case", String(row.caseId));
      next.delete("tab");
      next.delete("page");
      setParams(next);
      return;
    }
    navigate(`/bhc/patients/monitoring-requests/${row.id}`);
  }
  const {
    patients,
    hasData: hasPatientData,
    filteredPatients,
    total: patientTotal,
    hasMore: hasMorePatients,
    loadMore: loadMorePatients,
    loadingMore,
    loading,
    filters,
    setFilters,
    queryError,
    refetchPatients,
    isRefreshing,
    filterOptions,
  } = usePatients(role);
  const resultsRef = useRef(null);
  // The details panel starts collapsed; a card click selects a patient and opens it.
  const [panel, setPanel] = useState({ selectedId: null, open: false });
  const { selectedId: selectedPatientId, open: panelOpen } = panel;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Prefer facility-wide facets from the API; fall back to loaded rows if absent.
  const barangayOptions = [
    "All Barangays",
    ...new Set([
      ...(filterOptions?.barangays || []),
      ...patients.map((patient) => formatDisplayValue(patient.barangay, "")).filter(Boolean),
    ]),
  ];

  const civilStatusOptions = [
    "All Civil Status",
    ...new Set([
      ...(filterOptions?.civilStatuses || []),
      ...patients.map((patient) => formatDisplayValue(patient.civilStatus, "")).filter(Boolean),
    ]),
  ];

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
  const totalCount = Number(patientTotal) || filteredPatients.length;
  const patientCountLabel =
    filteredPatients.length < totalCount
      ? `Showing ${filteredPatients.length} of ${totalCount} patients`
      : isNarrowed
        ? `${totalCount} matching patient${totalCount === 1 ? "" : "s"}`
        : `${totalCount} registered patient${totalCount === 1 ? "" : "s"}`;
  const visiblePatients = filteredPatients;
  const inboxHandoffsReady = Array.isArray(handoffsQuery.data);
  const inboxTbReady = !canTbEndorsements || Boolean(tbInboxQuery.data) || Boolean(tbInboxQuery.error);
  const hasData = showUnifiedInbox
    ? inboxHandoffsReady || (canTbEndorsements && Boolean(tbInboxQuery.data))
    : showTbReview
      ? true
      : hasPatientData;
  // Prefer handoff failures for the hard error shell; TB-only failures still
  // allow the handoff list through with a soft status line below.
  const activeError = showUnifiedInbox
    ? handoffsQuery.error || (!inboxHandoffsReady ? tbInboxQuery.error : null)
    : showTbReview
      ? null
      : queryError;
  const activeRefreshing = showUnifiedInbox
    ? handoffsQuery.isFetching || (canTbEndorsements && tbInboxQuery.isFetching)
    : showTbReview
      ? false
      : isRefreshing;
  const activeRetry = showUnifiedInbox
    ? () => {
        void handoffsQuery.refetch();
        if (canTbEndorsements) void tbInboxQuery.refetch();
      }
    : refetchPatients;
  const showInitialLoading = showUnifiedInbox
    ? (handoffsQuery.isPending || (canTbEndorsements && tbInboxQuery.isPending && !inboxTbReady)) && !hasData
    : showTbReview
      ? false
      : loading && !hasData;
  const showRefreshOverlay = activeRefreshing && hasData && !showHandoffs;

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
          <div className={`mb-4 flex flex-wrap justify-between gap-3 ${showUnifiedInbox ? "items-center" : "items-start"}`}>
            <div className="min-w-0 shrink">
              {(!embedded || showEmbeddedHeading) && (
                <>
                  <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
                    {showHandoffs ? "Monitoring Requests" : role === "rhu" ? "All Patients" : "Patients"}
                  </h1>
                  <p className="mt-1 text-[13px] text-neutral-600">
                    {showTbReview
                      ? "RHU-to-BHC TB treatment endorsement for your catchment."
                      : showHandoffs
                        ? "RHU Manage to BHC handoffs and TB treatment endorsements for your catchment."
                        : role === "rhu"
                          ? "Every patient record registered at this RHU."
                          : `Patients registered in your ${role === "rhu" ? "RHU" : "BHC"}.`}
                  </p>
                </>
              )}
              <p className="sr-only" role="status">
                {showTbReview
                  ? "TB endorsement review"
                  : showHandoffs
                    ? `${visibleInboxRows.length} monitoring request${visibleInboxRows.length === 1 ? "" : "s"}`
                    : patientCountLabel}
              </p>
            </div>
            {showUnifiedInbox ? (
              <div className="monitoring-search-inline">
                <SearchFilterCluster
                  search={
                    <SearchField
                      value={monitoringFilters.search}
                      onChange={(search) => setMonitoringFilters((prev) => ({ ...prev, search }))}
                      placeholder="Search patient or condition"
                      label="Search monitoring requests"
                    />
                  }
                  filter={
                    <ListFilterPopover
                      fields={monitoringFilterFields}
                      applied={monitoringFilters}
                      activeFilters={activeMonitoringFilters}
                      onApply={({ type, status }) => setMonitoringFilters((prev) => ({ ...prev, type, status }))}
                      onRemoveFilter={(key) => setMonitoringFilters((prev) => ({ ...prev, [key]: "" }))}
                      onClearAll={() => setMonitoringFilters((prev) => ({ ...prev, type: "", status: "" }))}
                    />
                  }
                />
              </div>
            ) : !showHandoffs ? (
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
            isDesktop && !showInitialLoading && !showHandoffs
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
                  loadingMore={loadingMore}
                  onLoadMore={loadMorePatients}
                  selectedPatientId={selectedPatientId}
                  onSelectPatient={selectPatient}
                  role={role}
                  basePath={basePath}
                  addPatientPath={addPatientPath}
                />
              )}
              {showUnifiedInbox && (
                <>
                  {tbInboxQuery.error && inboxHandoffsReady ? (
                    <p role="status" className="mb-3 text-sm text-neutral-600">
                      TB endorsements could not be loaded. Showing monitoring handoffs only.
                    </p>
                  ) : null}
                  <MonitoringRequestList
                    rows={visibleInboxRows}
                    filters={monitoringFilters}
                    filtered={isMonitoringFiltered}
                    onClearFilters={clearMonitoringFilters}
                    loading={
                      (handoffsQuery.isLoading && !inboxHandoffsReady) ||
                      (canTbEndorsements && tbInboxQuery.isLoading && !tbInboxQuery.data && !tbInboxQuery.error)
                    }
                    onOpen={openMonitoringInboxRow}
                  />
                </>
              )}
              {showTbReview && <BhcTbEndorsements embedded />}
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

function MonitoringRequestList({ rows, filters, loading, filtered, onClearFilters, onOpen }) {
  if (loading && rows.length === 0) {
    return <p className="px-4 py-10 text-sm text-neutral-600">Loading monitoring requests…</p>;
  }
  if (rows.length === 0) {
    return (
      <FilteredEmptyPanel
        icon={<Users size={20} className="text-neutral-400" aria-hidden="true" />}
        title={filtered ? "No matching monitoring requests" : "No monitoring requests"}
        description={filtered
          ? "Try another search or clear the filters."
          : "RHU Manage to BHC handoffs and TB treatment endorsements for this Barangay Health Center will appear here."}
        onClear={filtered ? onClearFilters : undefined}
      />
    );
  }
  return <MonitoringRequestTable rows={rows} filters={filters} onOpen={onOpen} />;
}

function MonitoringRequestTable({ rows, filters, onOpen }) {
  const { page, setPage, pageRows, totalPages } = usePagedRows(rows, filters);
  const cellClass = "border-b border-neutral-100 px-3";

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <FixedTable minWidth="min-w-[720px]" lockHeight={false}>
        <caption className="sr-only">Monitoring requests</caption>
        <thead className="bg-neutral-100 text-ink-800">
          <tr className="text-xs font-semibold">
            <th scope="col" className="px-3">Sending RHU</th>
            <th scope="col" className="px-3">Patient</th>
            <th scope="col" className="px-3">Condition / Service</th>
            <th scope="col" className="px-3">Status</th>
            <th scope="col" className="px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => {
            const name = formatPatientName(row.patient) || "Patient";
            return (
              <tr key={row.key} className="text-sm text-ink-800 hover:bg-neutral-50">
                <td className={cellClass}>{row.sendingRhu}</td>
                <td className={cellClass}>
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="max-w-full truncate rounded-sm text-left font-semibold text-ink-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {name}
                  </button>
                </td>
                <td className={cellClass}>{row.conditionLabel}</td>
                <td className={cellClass}>
                  <PlainStatusStamp label={row.statusLabel} tone={monitoringInboxStatusTone(row.status)} />
                </td>
                <td className={`${cellClass} w-20 text-right`}>
                  <ActionMenu
                    title={name}
                    subtitle={row.typeLabel}
                    triggerLabel={`Actions for ${name}`}
                    actions={[{
                      label: row.kind === KIND_TB_ENDORSEMENT ? "Open TB endorsement" : "Open monitoring request",
                      onClick: () => onOpen(row),
                    }]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </FixedTable>
      <TablePagination alwaysShow currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function PatientDirectory({
  patients,
  canRegister,
  hasAnyFilter,
  hasMorePatients,
  loadingMore = false,
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
                        Register patients from{" "}
                        <Link to="/rhu/walk-in-check-in" className="font-medium text-ink-700 underline">
                          Visit Check-in
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
                <LoadMoreButton
                  label={loadingMore ? "Loading patients..." : "Load more patients"}
                  onClick={onLoadMore}
                  disabled={loadingMore}
                />
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
