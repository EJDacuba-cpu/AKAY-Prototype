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
  const canCheckIn = useAccess().can("patients.register");
  const { visits, loading, error, queryError, refetch, isRefreshing } = useRhuVisits();
  const rows = queueRows(visits);

  const views = [
    { value: "queue", label: loading ? "Today's Queue" : `Today's Queue (${rows.length})` },
    { value: "all", label: "All Patients" },
  ];

  function switchView(next) {
    // Replace, so Back leaves the page instead of stepping through tab switches.
    setParams(next === "queue" ? {} : { view: next }, { replace: true });
  }

  return (
    <DashboardLayout role="rhu" title="Patients">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
