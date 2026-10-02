/** Start Consultation shows the modal only when there is something to continue. */
export function needsStartModal(overview) {
  return Boolean(overview && (overview.pendingFollowUps?.length || overview.monitoringWithoutFollowUp?.length));
}

/**
 * What a Start / Resume Consultation action does with usePatientConsultation's
 * state: "disabled" while it is still checking (or the draft check failed, or a
 * discard is running), "modal" when there is something to continue (the hook
 * never asks for the modal while a draft exists - Resume wins), else "link"
 * (to the draft, or to a new consultation).
 */
export function startConsultationAction(consultation) {
  if (!consultation || consultation.isPending || consultation.isError || consultation.discarding) return "disabled";
  return consultation.needsStartModal ? "modal" : "link";
}

/**
 * The step-flow consultation route that continues the chosen follow-ups and
 * monitoring (read back by utils/consultationRoute as kind "continue").
 */
export function selectionToRoute({ patientId, followUpIds = [], monitoringIds = [] }, basePath = "/bhc") {
  const params = new URLSearchParams({ patientId: String(patientId), mode: "continue" });
  if (followUpIds.length) params.set("followUpIds", followUpIds.join(","));
  if (monitoringIds.length) params.set("monitoringIds", monitoringIds.join(","));
  return `${basePath}/health-records/add?${params.toString()}`;
}
