export function clinicalDraftRequest({ patientId, classification, consultationUuid, rhuVisitId, payload, version }) {
  return {
    patient_id: patientId,
    classification,
    consultation_uuid: consultationUuid || null,
    ...(rhuVisitId ? { rhu_visit_id: Number(rhuVisitId) } : {}),
    payload,
    ...(version !== undefined ? { version } : {}),
  };
}
