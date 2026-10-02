import { apiRequest, unwrapData } from "./apiClient";

/**
 * The clinical registry (monitored conditions) - the single source of
 * truth GET /api/clinical-registry serves.
 * The frontend keeps zero copy of this list; everything renders
 * from this response. See
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 *
 * Shape: { monitored_conditions: { [key]: { name, aliases, monitoring_details? } } }
 */
export async function getClinicalRegistry() {
  const payload = await apiRequest("/clinical-registry");
  return unwrapData(payload) || { monitored_conditions: {} };
}
