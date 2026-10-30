import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import ModalShell from "../../common/modals/ModalShell";
import StartConsultationModal from "../patients/profile/StartConsultationModal";
import { getCareOverview } from "../../../services/careOverviewService";
import { queryKeys } from "../../../utils/queryKeys";
import { startOrResumeRhuConsultation } from "../../../utils/rhuVisitConsultation";

/**
 * RHU Start Consultation: the BHC selection modal, then the existing visit
 * start API. New Consultation stores no follow-ups. Continue stores only the
 * ticked task ids on that same queue visit.
 */
export default function RhuStartConsultationModal({
  patientId,
  visitId,
  patientName,
  onClose,
  onStarted,
}) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.careOverview(patientId),
    queryFn: () => getCareOverview(patientId),
    enabled: Boolean(patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  async function handleStart({ followUpIds = [] } = {}) {
    const { path } = await startOrResumeRhuConsultation({
      mode: "start",
      visitId,
      patientId,
      followUpIds,
    });
    toast.success(`Consultation started for ${patientName || "this patient"}.`);
    onStarted?.(path);
  }

  if (overviewQuery.isPending) {
    return (
      <ModalShell open title="Start Consultation" size="lg" onClose={onClose}>
        <p role="status" className="text-[13px] text-neutral-600">Loading follow-up choices…</p>
      </ModalShell>
    );
  }

  return (
    <StartConsultationModal
      variant="rhu"
      overview={overviewQuery.data || null}
      onCancel={onClose}
      onStart={handleStart}
    />
  );
}
