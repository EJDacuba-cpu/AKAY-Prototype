/**
 * Splits a patient's Current Conditions (medical_background.currentDiseases)
 * into the two groups the Patient Profile shows, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
 *
 * - Monitored Conditions: every entry with a conditionKey the registry still
 *   recognizes. Each is annotated with its pathway's label and enrollment
 *   status.
 * - Other Conditions: everything else - free-text entries, and a
 *   pre-registry legacy entry that has not been re-synced (no conditionKey)
 *   yet stays here too, exactly as decided (no backfill).
 *
 * Condition presence and enrollment status are separate facts shown
 * together: this function never starts, infers, or changes an enrollment -
 * `getEnrollmentStatus` is a pure lookup the caller supplies. Its default
 * ("Not started" for everything) is a placeholder used until Care Pathway
 * enrollment data (App\Services... care_pathway_enrollments) is wired in;
 * callers of this function are the only thing that changes when it is.
 */
export function groupCurrentDiseases(diseases, registry, getEnrollmentStatus = defaultEnrollmentStatus) {
  const list = Array.isArray(diseases) ? diseases : [];
  const monitoredConditions = registry?.monitored_conditions || {};
  const carePathways = registry?.care_pathways || {};

  const monitored = [];
  const other = [];

  list.forEach((disease, index) => {
    const conditionKey = disease?.conditionKey || null;
    const conditionEntry = conditionKey ? monitoredConditions[conditionKey] : null;

    if (conditionEntry) {
      const pathwayKey = conditionEntry.pathway || null;
      monitored.push({
        ...disease,
        index,
        conditionKey,
        pathwayKey,
        pathwayLabel: pathwayKey ? carePathways[pathwayKey]?.label || pathwayKey : null,
        enrollmentStatus: getEnrollmentStatus(pathwayKey, disease),
      });
    } else {
      other.push({ ...disease, index });
    }
  });

  return { monitored, other };
}

function defaultEnrollmentStatus() {
  return "Not started";
}
