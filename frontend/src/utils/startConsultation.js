/** Start Consultation shows the modal only when there is something to continue. */
export function needsStartModal(overview) {
  return Boolean(overview && (overview.pendingFollowUps?.length || overview.monitoringWithoutFollowUp?.length));
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
