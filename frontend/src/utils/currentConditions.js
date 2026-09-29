/**
 * Splits a patient's Current Conditions (medical_background.currentDiseases)
 * into the two groups the Patient Profile shows, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
 *
 * - Monitored Conditions: every entry with a conditionKey the registry still
 *   recognizes.
 * - Other Conditions: everything else - free-text entries, and a
 *   pre-registry legacy entry that has not been re-synced (no conditionKey)
 *   yet stays here too, exactly as decided (no backfill).
 *
 * Each entry keeps its original array position (`index`) so update/remove
 * callers can address it.
 */
export function groupCurrentDiseases(diseases, registry) {
  const list = Array.isArray(diseases) ? diseases : [];
  const monitoredConditions = registry?.monitored_conditions || {};

  const monitored = [];
  const other = [];

  list.forEach((disease, index) => {
    const conditionKey = disease?.conditionKey || null;
    if (conditionKey && monitoredConditions[conditionKey]) {
      monitored.push({ ...disease, index, conditionKey });
    } else {
      other.push({ ...disease, index });
    }
  });

  return { monitored, other };
}
