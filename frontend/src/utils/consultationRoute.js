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
  if (mode === "followup") {
    return followUpId
      ? { kind: "followup", patientId, followUpId }
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
