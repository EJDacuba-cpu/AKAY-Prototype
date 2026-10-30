import { getBhcPatientById } from "./patientService";

export function consultationPatientQueryKey(patientId) {
  return ["consultation-selected-patient", patientId];
}

/**
 * The patient record the consultation workspace reads service eligibility
 * from. Start / Resume Consultation fetch it with these same options before
 * navigating, so the workspace opens on a cached record and its services are
 * restricted from the first render.
 */
export function getConsultationPatientQuery(patientId) {
  return {
    queryKey: consultationPatientQueryKey(patientId),
    queryFn: () => getBhcPatientById(patientId),
  };
}
