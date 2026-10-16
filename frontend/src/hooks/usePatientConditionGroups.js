import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getPatientConditions } from "../services/patientConditionService";
import { getCurrentUser } from "../utils/auth";
import { groupMedicalConditions } from "../utils/medicalConditions";
import { queryKeys } from "../utils/queryKeys";

/** GET /patients/{id}/conditions needs clinical.history; without it nothing is requested. */
export function canViewPatientConditions() {
  return (getCurrentUser()?.permissions || []).includes("clinical.history");
}

export function usePatientConditions(patientId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.patientConditions(patientId),
    queryFn: () => getPatientConditions(patientId),
    enabled: Boolean(patientId) && enabled && canViewPatientConditions(),
  });
}

/**
 * The patient's medical conditions in the clinical-source groups. Until
 * the conditions load (or when they cannot be read) only the background
 * entries are grouped, so nothing is shown as confirmed that the server has
 * not said is.
 */
export default function usePatientConditionGroups(patientId, currentDiseases, options) {
  const query = usePatientConditions(patientId, options);
  const { conditions, legacyMonitorings } = query.data || {};

  const groups = useMemo(
    () => groupMedicalConditions({ conditions, legacyMonitorings, currentDiseases }),
    [conditions, legacyMonitorings, currentDiseases],
  );

  return { groups, isLoading: query.isLoading, isError: query.isError };
}
