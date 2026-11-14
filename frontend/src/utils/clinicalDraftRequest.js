import { mergeMaternalData } from "./prenatalForm.js";

function maternalDraftData(source) {
  const data = mergeMaternalData(source);
  // Finalized records carry aliases and a computed score. Drafts use the
  // canonical fields; never mutate the clinician's in-memory snapshot.
  const score = String(source.tpal || "").split("-");
  if (score.length === 4 && score.every((value) => /^\d+$/.test(value))) {
    ["term", "preterm", "abortion", "living"].forEach((key, index) => {
      if (data[key] === "" || data[key] == null) data[key] = score[index];
    });
  }
  for (const key of [
    "tpal", "previous_fp_method_used", "previous_fp_method_other",
    "previous_pregnancy_history", "tetanus_toxoid_status",
    "tetanus_diphtheria_status", "medicalHistory",
  ]) delete data[key];
  return data;
}

export function clinicalDraftRequest({ patientId, classification, consultationUuid, rhuVisitId, payload, version }) {
  return {
    patient_id: patientId,
    classification,
    consultation_uuid: consultationUuid || null,
    ...(rhuVisitId ? { rhu_visit_id: Number(rhuVisitId) } : {}),
    payload: payload?.maternalData && typeof payload.maternalData === "object"
      ? { ...payload, maternalData: maternalDraftData(payload.maternalData) }
      : payload,
    ...(version !== undefined ? { version } : {}),
  };
}
