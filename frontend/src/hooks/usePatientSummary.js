import { useQuery } from "@tanstack/react-query";

import { getBhcPatientById } from "../services/patientService";
import { getHealthRecordsByPatient } from "../services/healthRecordService";
import { getRecordDateValue } from "../utils/healthRecordPrograms";

function patientSummaryQueryKey(patientId) {
  return ["consultation-patient-summary", patientId];
}

/**
 * Patient row plus their health records (newest first), for the patient
 * directory's summary panel.
 */
export default function usePatientSummary(patientId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: patientSummaryQueryKey(patientId),
    enabled: Boolean(enabled && patientId),
    queryFn: async () => {
      const [patient, records] = await Promise.all([getBhcPatientById(patientId), getHealthRecordsByPatient(patientId)]);
      return { patient, records: [...records].sort((a, b) => new Date(getRecordDateValue(b)) - new Date(getRecordDateValue(a))) };
    },
  });
  const records = query.data?.records || [];

  return {
    ...query,
    patient: query.data?.patient,
    records,
    latest: records[0],
  };
}
