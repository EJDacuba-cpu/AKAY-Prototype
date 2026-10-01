function idList(value) {
  return String(value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * Which consultation the workspace opens. "continue" is a new step-flow
 * consultation that continues follow-ups / monitoring picked in the Start
 * Consultation modal; the legacy follow-up entry (Follow-ups "Record Visit",
 * `mode=followup&followUpId=X`) resolves to it too, with that one task.
 */
export function resolveBhcConsultationRoute(search = "") {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const patientId = String(params.get("patientId") || "").trim();
  const draftId = String(params.get("draftId") || "").trim();
  const followUpId = String(
    params.get("followUpId") || params.get("follow_up_id") || "",
  ).trim();
  const mode = String(params.get("mode") || "new")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, "");

  if (draftId) return { kind: "draft", draftId, patientId };
  if (mode === "continue") {
    return patientId
      ? {
          kind: "continue",
          patientId,
          followUpIds: idList(params.get("followUpIds")),
          monitoringIds: idList(params.get("monitoringIds")),
        }
      : { kind: "redirect", reason: "missing-patient" };
  }
  if (mode === "followup") {
    if (followUpId && patientId) {
      return { kind: "continue", patientId, followUpIds: idList(followUpId), monitoringIds: [] };
    }
    return patientId
      ? { kind: "new", patientId }
      : { kind: "redirect", reason: "missing-follow-up" };
  }
  if (patientId) return { kind: "new", patientId };
  return { kind: "redirect", reason: "missing-patient" };
}

export function buildPatientConsultationPath(patientId, basePath = "/bhc") {
  const params = new URLSearchParams({
    patientId: String(patientId || ""),
    mode: "new",
  });
  return `${basePath}/health-records/add?${params.toString()}`;
}
