import { getFollowUpTasks } from "./followUpTaskService";
import { getHealthRecordsByPatient } from "./healthRecordService";
import {
  getPatientById,
  getPatientByIdForRole,
  getPatientDetailsListByRole,
  getPatientHealthRecords,
  getPatientReferrals,
  getPatientsByRole,
} from "./patientService";
import { getReferrals } from "./referrals";
import { queryKeys } from "../utils/queryKeys";

function sameId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

/**
 * Query definitions for the patient profile pages. The profile pages and the
 * directory's Open Profile prefetch both read these, so the cache keys can
 * never drift apart and the profile mounts on data that is already loaded.
 *
 * `patient` is the one the profile cannot render without; `secondary` queries
 * have their own error and retry states on the profile.
 */
export function getBhcPatientProfileQueries(patientId, { canViewHistory = false } = {}) {
  const historyEnabled = Boolean(patientId) && canViewHistory;

  return {
    patient: {
      queryKey: queryKeys.patientDetails("bhc", patientId),
      queryFn: () => getPatientById(patientId),
      retry: false,
    },
    records: {
      queryKey: [...queryKeys.healthRecords("bhc"), "patient", patientId],
      queryFn: () => getPatientHealthRecords(patientId),
      enabled: historyEnabled,
      retry: false,
    },
    referrals: {
      queryKey: [...queryKeys.referrals("bhc"), "patient", patientId],
      queryFn: () => getPatientReferrals(patientId),
      enabled: historyEnabled,
      retry: false,
    },
    followUps: {
      queryKey: queryKeys.followUpTasks("bhc"),
      queryFn: () => getFollowUpTasks(),
      enabled: historyEnabled,
      staleTime: 30_000,
      retry: false,
    },
    registeredPatients: {
      queryKey: queryKeys.patients("bhc"),
      queryFn: () => getPatientDetailsListByRole("bhc"),
      enabled: Boolean(patientId),
      staleTime: 30_000,
      retry: false,
    },
  };
}

export function getRhuPatientProfileQueries(patientId) {
  const enabled = Boolean(patientId);

  return {
    patient: {
      queryKey: queryKeys.patientDetails("rhu", patientId),
      queryFn: async () => {
        const [patientDetailsResult, detailsListResult, patientListResult] =
          await Promise.allSettled([
            getPatientByIdForRole(patientId, "rhu"),
            getPatientDetailsListByRole("rhu"),
            getPatientsByRole("rhu"),
          ]);

        const patientDetails =
          patientDetailsResult.status === "fulfilled"
            ? patientDetailsResult.value
            : null;
        const patientDetailsList =
          detailsListResult.status === "fulfilled" ? detailsListResult.value : [];
        const patientList =
          patientListResult.status === "fulfilled" ? patientListResult.value : [];
        const allPatients = [
          ...(Array.isArray(patientDetailsList) ? patientDetailsList : []),
          ...(Array.isArray(patientList) ? patientList : []),
        ];

        return (
          patientDetails ||
          allPatients.find((item) => sameId(item?.id, patientId)) ||
          null
        );
      },
      enabled,
    },
    records: {
      queryKey: [...queryKeys.healthRecords("rhu"), "patient", patientId],
      queryFn: () => getHealthRecordsByPatient(patientId),
      enabled,
    },
    referrals: {
      queryKey: [...queryKeys.referrals("rhu"), "patient", patientId],
      queryFn: getReferrals,
      enabled,
    },
  };
}

/** The profile queries for a role, as the `{ patient, secondary }` shape the prefetch takes. */
export function getPatientProfilePrefetch(role, patientId, options) {
  if (role === "rhu") {
    const { patient, records, referrals } = getRhuPatientProfileQueries(patientId);
    return { patient, secondary: [records, referrals] };
  }

  const { patient, records, referrals, followUps, registeredPatients } =
    getBhcPatientProfileQueries(patientId, options);
  return { patient, secondary: [records, referrals, followUps, registeredPatients] };
}
