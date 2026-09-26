import { useQuery } from "@tanstack/react-query";

import { getBhcPatientById } from "../services/patientService";
import { getHealthRecordsByPatient } from "../services/healthRecordService";
import { getRecordDateValue, isMaternalRecord } from "../utils/healthRecordPrograms";

export function patientSummaryQueryKey(patientId) {
  return ["consultation-patient-summary", patientId];
}

/** Latest TT/Td immunization and ultrasound from the newest maternal record. */
function getMaternalSummary(records) {
  const maternal = records.find(isMaternalRecord);
  if (!maternal) return null;

  const maternalData = maternal.maternalData || maternal.maternal_data || {};
  const immunizations = [
    ...Object.entries(maternalData.tetanusToxoidStatus || {}),
    ...Object.entries(maternalData.tetanusDiphtheriaStatus || {}),
  ].filter(([, value]) => value).sort((a, b) => new Date(b[1]) - new Date(a[1]));
  const ultrasound = maternalData.ultrasound || {};

  return {
    latestImmunization: immunizations[0] || null,
    latestUltrasoundDate: ultrasound.date || ultrasound.datePerformed || "",
  };
}

/**
 * Patient row plus their health records (newest first). Shared by the
 * consultation drawer and the patient directory panel, so both read one cache.
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
    maternalSummary: getMaternalSummary(records),
  };
}
