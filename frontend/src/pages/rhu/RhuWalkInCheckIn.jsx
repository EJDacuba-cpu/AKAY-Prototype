import { PatientRegistrationEntryLink } from "../../components/features/patients/PatientRegistrationEntry";
import { useSearchParams } from "react-router";
import { Plus } from "lucide-react";

import WalkInCheckInPanel from "../../components/features/rhu-queue/WalkInCheckInPanel";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { patientIdFromWalkInSearch, registerForWalkInCheckInPath } from "../../utils/walkInRegistration";

export default function RhuWalkInCheckIn() {
  const [params, setParams] = useSearchParams();
  const selectedId = patientIdFromWalkInSearch(params);
  const registerPath = registerForWalkInCheckInPath();

  return (
    <DashboardLayout role="rhu" title="Walk-in Check-in">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold tracking-tight text-ink-800">Walk-in Check-in</h1>
            <p className="mt-1 text-[13px] text-neutral-600">
              Check walk-in patients into today's queue.
            </p>
          </div>
          <Button
            asChild
            variant="brand"
            className="shrink-0 self-start"
          >
            <PatientRegistrationEntryLink to={registerPath}><Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            Register New Patient</PatientRegistrationEntryLink>
          </Button>
        </div>

        <WalkInCheckInPanel
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
