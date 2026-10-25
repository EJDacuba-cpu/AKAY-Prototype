import { useState } from "react";
import { useSearchParams } from "react-router";

import { SegmentedFilter } from "../../components/common";
import RhuQueueTable from "../../components/features/rhu-queue/RhuQueueTable";
import WalkInCheckInModal from "../../components/features/rhu-queue/WalkInCheckInModal";
import DashboardLayout from "../../components/layout/DashboardLayout";
import useAccess from "../../hooks/useAccess";
import useRhuVisits from "../../hooks/useRhuVisits";
import { queueRows } from "../../utils/rhuQueueView";
import PatientsModule from "../bhc/PatientsModule";

const REGISTER_FOR_CHECK_IN = "/rhu/patients/add?check_in=1";

/**
 * RHU Patients: today's visits first, the whole directory one tab away. The queue is visits, not
 * patient records (D6); the directory below is the existing patient list.
 */
export default function RhuPatientsWorkspace() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "all" ? "all" : "queue";
  const [checkInOpen, setCheckInOpen] = useState(false);
  const access = useAccess();
  const canCheckIn = access.can("patients.register");
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
            onCheckIn={() => setCheckInOpen(true)}
          />
        ) : (
          <PatientsModule role="rhu" basePath="/rhu" embedded />
        )}
      </div>

      {checkInOpen && (
        <WalkInCheckInModal registerPath={REGISTER_FOR_CHECK_IN} onClose={() => setCheckInOpen(false)} />
      )}
    </DashboardLayout>
  );
}
