import { useSearchParams } from "react-router";

import WalkInCheckInPanel from "../../components/features/rhu-queue/WalkInCheckInPanel";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { patientIdFromWalkInSearch, registerForWalkInCheckInPath } from "../../utils/walkInRegistration";

export default function RhuWalkInCheckIn() {
  const [params, setParams] = useSearchParams();
  const selectedId = patientIdFromWalkInSearch(params);
  return (
    <DashboardLayout role="rhu" title="Walk-in Check-in">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">Walk-in Check-in</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Search existing patients first so a returning patient keeps one record.
          </p>
        </div>
        <WalkInCheckInPanel
          registerPath={registerForWalkInCheckInPath()}
          selectedPatientId={selectedId}
          onClearedSelection={() => {
            const next = new URLSearchParams(params);
            next.delete("patient_id");
            setParams(next, { replace: true });
          }}
        />
      </div>
    </DashboardLayout>
  );
}
