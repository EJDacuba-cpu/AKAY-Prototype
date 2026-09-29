import { apiRequest, unwrapData } from "./apiClient";

/**
 * The clinical registry (monitored conditions and surveillance diseases) -
 * the single source of truth GET /api/clinical-registry serves.
 * The frontend keeps zero copy of any of these lists; everything renders
 * from this response. See
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 *
 * Shape: { monitored_conditions: { [key]: { name, aliases } },
 *          surveillance_diseases: { [key]: { name, aliases } } }
 */
export async function getClinicalRegistry() {
  const payload = await apiRequest("/clinical-registry");
  return unwrapData(payload) || { monitored_conditions: {}, surveillance_diseases: {} };
}
