import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { SegmentedFilter } from "../../components/common";
import CloseVisitModal from "../../components/features/rhu-queue/CloseVisitModal";
import RhuQueueTable from "../../components/features/rhu-queue/RhuQueueTable";
import RhuStartConsultationModal from "../../components/features/rhu-queue/RhuStartConsultationModal";
import WalkInCheckInModal from "../../components/features/rhu-queue/WalkInCheckInModal";
import DashboardLayout from "../../components/layout/DashboardLayout";
import useAccess from "../../hooks/useAccess";
import useRhuVisits from "../../hooks/useRhuVisits";
import { closeRhuVisit } from "../../services/rhuVisitService";
import { queryKeys } from "../../utils/queryKeys";
import { queueRows } from "../../utils/rhuQueueView";
import { startOrResumeRhuConsultation } from "../../utils/rhuVisitConsultation";
import PatientsModule from "../bhc/PatientsModule";

const REGISTER_FOR_CHECK_IN = "/rhu/patients/add?check_in=1";

/**
 * RHU Patients: today's visits first, the whole directory one tab away. The queue is visits, not
 * patient records (D6); the directory below is the existing patient list.
 */
export default function RhuPatientsWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "all" ? "all" : "queue";
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [startingRow, setStartingRow] = useState(null);
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
    poll: view === "queue",
  });
  const rows = queueRows(visits);
  const showCount = canViewQueue && !loading && !error;

  const views = [
    { value: "queue", label: showCount ? `Today's Queue (${rows.length})` : "Today's Queue" },
    { value: "all", label: "All Patients" },
  ];

  function switchView(next) {
    // Replace, so Back leaves the page instead of stepping through tab switches.
    setParams(next === "queue" ? {} : { view: next }, { replace: true });
  }

  async function refreshQueue() {
    await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
  }

  async function resumeVisit(row) {
    try {
      const { path } = await startOrResumeRhuConsultation({
        mode: "resume",
        visitId: row.id,
        patientId: row.patientId,
      });
      navigate(path);
    } catch (error) {
      toast.error(error?.message || "Unable to resume this consultation.");
    }
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

  return (
    <DashboardLayout role="rhu" title="Patients">
      {/* h-full + min-h-0 keep the directory's pinned height chain intact (clinical-directory.css), so All Patients still scrolls. */}
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight text-neutral-900">Patients</h1>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              Visits checked in today, and every patient record at this RHU.
            </p>
          </div>
          <SegmentedFilter label="Patients view" options={views} value={view} onChange={switchView} />
        </div>

        {view === "queue" ? (
          <RhuQueueTable
            rows={rows}
            loading={loading}
            error={Boolean(error)}
            queryError={queryError}
            onRetry={refetch}
            isRefreshing={isRefreshing}
            canViewQueue={canViewQueue}
            canCheckIn={canCheckIn}
            canEncode={canEncode}
            canFinalize={canFinalize}
            onCheckIn={() => setCheckInOpen(true)}
            onStart={setStartingRow}
            onResume={resumeVisit}
            onCloseVisit={setClosingRow}
          />
        ) : (
          <PatientsModule role="rhu" basePath="/rhu" embedded />
        )}
      </div>

      {checkInOpen && (
        <WalkInCheckInModal registerPath={REGISTER_FOR_CHECK_IN} onClose={() => setCheckInOpen(false)} />
      )}
      {startingRow && (
        <RhuStartConsultationModal
          patientId={startingRow.patientId}
          visitId={startingRow.id}
          patientName={startingRow.name}
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
