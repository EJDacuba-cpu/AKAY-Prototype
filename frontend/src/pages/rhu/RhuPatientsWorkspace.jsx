import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  ConnectionErrorState,
  ListFilterPopover,
  SearchField,
  SearchFilterCluster,
  pickFilterValues,
} from "../../components/common";
import { errorStateVariant } from "../../utils/errorStateVariant";
import CloseVisitModal from "../../components/features/rhu-queue/CloseVisitModal";
import RhuQueueTable from "../../components/features/rhu-queue/RhuQueueTable";
import RhuStartConsultationModal from "../../components/features/rhu-queue/RhuStartConsultationModal";
import DashboardLayout from "../../components/layout/DashboardLayout";
import useAccess from "../../hooks/useAccess";
import useRhuVisits from "../../hooks/useRhuVisits";
import { closeRhuVisit } from "../../services/rhuVisitService";
import { queryKeys } from "../../utils/queryKeys";
import { queueRows } from "../../utils/rhuQueueView";
import {
  normalizeRhuPatientView,
  RHU_PATIENT_VIEW_QUEUE,
} from "../../utils/sidebarNavigation";
import PatientsModule from "../bhc/PatientsModule";

const VISIT_PROGRESS_ALL = "All Visit Progress";
const VISIT_PROGRESS_OPTIONS = [
  VISIT_PROGRESS_ALL,
  "Waiting",
  "In Consultation",
];
const VISIT_PROGRESS_STATUS = {
  [VISIT_PROGRESS_ALL]: "all",
  Waiting: "waiting",
  "In Consultation": "in_consultation",
};

/**
 * RHU Patients: Today's Queue and All Patients as independent sidebar submodules.
 * Queue is visits, not patient records (D6); the directory is the existing patient list.
 */
export default function RhuPatientsWorkspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const view = normalizeRhuPatientView(params);
  const isQueue = view === RHU_PATIENT_VIEW_QUEUE;
  const [queueSearch, setQueueSearch] = useState("");
  const [visitProgress, setVisitProgress] = useState(VISIT_PROGRESS_ALL);
  const [startingRow, setStartingRow] = useState(null);
  const [entryChecking, setEntryChecking] = useState(false);
  const [closingRow, setClosingRow] = useState(null);
  const [closeState, setCloseState] = useState({ saving: false, error: "" });
  const client = useQueryClient();
  const access = useAccess();
  const canCheckIn = access.can("patients.register");
  const canEncode = access.can("consultations.encode");
  const canFinalize = access.can("consultations.finalize");
  // The queue endpoint needs Health Records access; check-in alone is the registration duty.
  const canViewQueue = access.can("clinical.history");
  const { visits, loading, error, queryError, refetch, isRefreshing } = useRhuVisits({
    enabled: canViewQueue,
    poll: isQueue,
  });
  const rows = queueRows(visits);

  const pageTitle = isQueue ? "Today's Queue" : "All Patients";
  const pageSubtitle = isQueue
    ? "Visits checked in today at this RHU."
    : "Every patient record registered at this RHU.";

  const visitProgressFields = [
    {
      key: "visitProgress",
      label: "Visit Progress",
      value: visitProgress,
      options: VISIT_PROGRESS_OPTIONS,
      resetValue: VISIT_PROGRESS_ALL,
      fullWidth: true,
    },
  ];
  const visitProgressActive =
    visitProgress === VISIT_PROGRESS_ALL
      ? []
      : [{ key: "visitProgress", label: `Visit Progress: ${visitProgress}` }];

  async function refreshQueue() {
    await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
  }

  function openConsultation(row) {
    if (startingRow) return;
    setEntryChecking(true);
    setStartingRow((current) => current || row);
  }

  async function confirmClose({ reason, note }) {
    if (!closingRow) return;
    setCloseState({ saving: true, error: "" });
    try {
      await closeRhuVisit(closingRow.id, { reason, note });
      toast.success(`${closingRow.name} removed from today's queue.`);
      setClosingRow(null);
      setCloseState({ saving: false, error: "" });
      await refreshQueue();
    } catch (error) {
      setCloseState({ saving: false, error: error?.message || "Unable to close this visit." });
    }
  }

  function clearQueueFilters() {
    setQueueSearch("");
    setVisitProgress(VISIT_PROGRESS_ALL);
  }

  if (isQueue && canViewQueue && error && rows.length === 0 && !loading) {
    return (
      <DashboardLayout role="rhu" title={pageTitle}>
        <ConnectionErrorState
          fullPage
          variant={errorStateVariant(queryError)}
          onRetry={refetch}
          retrying={isRefreshing}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="rhu" title={pageTitle}>
      {/* h-full + min-h-0 keep the directory's pinned height chain intact (clinical-directory.css), so All Patients still scrolls. */}
      <div className="flex h-full min-h-0 flex-col gap-4">
        {isQueue ? (
          <>
            <div className="min-w-0 shrink-0">
              <h1 className="text-[17px] font-bold tracking-tight text-ink-800">{pageTitle}</h1>
              <p className="mt-1 text-[13px] text-neutral-600">{pageSubtitle}</p>
            </div>

            <div className={`flex shrink-0 justify-end ${canViewQueue ? "" : "invisible"}`} aria-hidden={!canViewQueue}>
              <SearchFilterCluster
                search={
                  <SearchField
                    value={queueSearch}
                    onChange={setQueueSearch}
                    placeholder="Search patient name"
                    label="Search today's queue"
                  />
                }
                filter={
                  <ListFilterPopover
                    fields={visitProgressFields}
                    applied={{ visitProgress }}
                    activeFilters={visitProgressActive}
                    activeCount={visitProgressActive.length}
                    onApply={(next) =>
                      setVisitProgress(next.visitProgress || VISIT_PROGRESS_ALL)
                    }
                    onRemoveFilter={() => setVisitProgress(VISIT_PROGRESS_ALL)}
                    onClearAll={() => setVisitProgress(VISIT_PROGRESS_ALL)}
                    pickValues={(current) =>
                      pickFilterValues(current, visitProgressFields)
                    }
                    buildDefaults={() => ({ visitProgress: VISIT_PROGRESS_ALL })}
                  />
                }
              />
            </div>

            <RhuQueueTable
              rows={rows}
              search={queueSearch}
              status={VISIT_PROGRESS_STATUS[visitProgress] || "all"}
              loading={loading}
              error={Boolean(error)}
              queryError={queryError}
              onRetry={refetch}
              isRefreshing={isRefreshing}
              canViewQueue={canViewQueue}
              canEncode={canEncode}
              canFinalize={canFinalize}
              canClose={canCheckIn}
              onClearFilters={clearQueueFilters}
              onOpen={openConsultation}
              entryBusy={Boolean(startingRow)}
              checkingVisitId={entryChecking ? startingRow?.id : null}
              onCloseVisit={setClosingRow}
            />
          </>
        ) : (
          <PatientsModule role="rhu" basePath="/rhu" embedded showEmbeddedHeading />
        )}
      </div>

      {startingRow && (
        <RhuStartConsultationModal
          patientId={startingRow.patientId}
          visitId={startingRow.id}
          patientName={startingRow.name}
          onCheckingChange={setEntryChecking}
          onClose={() => setStartingRow(null)}
          onStarted={(path) => {
            setStartingRow(null);
            navigate(path);
          }}
        />
      )}
      {closingRow && (
        <CloseVisitModal
          row={closingRow}
          saving={closeState.saving}
          error={closeState.error}
          onClose={() => {
            if (closeState.saving) return;
            setClosingRow(null);
            setCloseState({ saving: false, error: "" });
          }}
          onConfirm={confirmClose}
        />
      )}
    </DashboardLayout>
  );
}
