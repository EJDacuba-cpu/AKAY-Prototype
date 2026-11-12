/**
 * Registry keys for monitored conditions that historically used a BHC
 * Monitoring Details step (removed). Still used to classify TB visits
 * (`tb_dots`) without editing a treatment card in the BHC wizard.
 * Declared via `monitoring_details` on conditions in clinical_registry.php.
 */
export const MONITORING_DETAILS = {
  tb_dots: {
    label: "TB-DOTS Treatment Card",
    description:
      "DS-TB Treatment Card (DOH Form 4b) — case finding, diagnosis, regimen, treatment supporter, dose calendar, and adverse events.",
  },
};

/** Distinct Monitoring Details keys for the monitored conditions, sorted (stable section order). */
export function monitoringDetailKeys(conditionKeys = [], registry = {}) {
  const conditions = registry?.monitored_conditions || {};
  const keys = [];
  for (const conditionKey of conditionKeys) {
    const detailsKey = conditionKey ? conditions[conditionKey]?.monitoring_details : null;
    if (detailsKey && Object.hasOwn(MONITORING_DETAILS, detailsKey) && !keys.includes(detailsKey)) {
      keys.push(detailsKey);
    }
  }
  return keys.sort();
}
