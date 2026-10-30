/**
 * Monitoring Details: extra forms a monitored condition needs beyond the ITR.
 * A registered condition declares `monitoring_details: "<key>"` in the
 * backend registry (config/clinical_registry.php). This map holds each key's
 * copy; MonitoringDetailsForms.jsx maps the same key to its form component.
 * A key missing here is ignored, so the step never shows an empty section.
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
