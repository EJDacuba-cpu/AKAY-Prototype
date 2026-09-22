export const PROGRAM_CLASSIFICATIONS = Object.freeze({
  Maternal: "Maternal",
  TB: "TB DOTS / TB Monitoring",
  "Family Planning": "Family Planning",
  Hypertension: "Hypertension / Diabetic Monitoring",
  Diabetes: "Hypertension / Diabetic Monitoring",
  EPI: "Immunization",
});

export function getConsultationPrograms(record = {}) {
  const stored = record.selectedPrograms ?? record.monitoringData?.selectedPrograms ?? record.monitoring_data?.selectedPrograms;
  if (Array.isArray(stored)) return [...new Set(stored.filter((key) => Object.hasOwn(PROGRAM_CLASSIFICATIONS, key)))];
  const category = record.category || record.patientClassification || record.classification || record.recordType || record.record_type || "";
  if (category === "Hypertension / Diabetic Monitoring") {
    const data = record.hypertensionDiabeticData || record.hypertension_diabetic_data || record.monitoringData?.hypertensionDiabeticData || record.monitoring_data?.hypertensionDiabeticData || record.monitoring_data?.hypertension_diabetic_data || {};
    const condition = data.conditionType || data.condition_type || "";
    return /both/i.test(condition) ? ["Hypertension", "Diabetes"] : [/^(dm)$/i.test(condition) || /diabet/i.test(condition) ? "Diabetes" : "Hypertension"];
  }
  return Object.keys(PROGRAM_CLASSIFICATIONS).filter((key) => PROGRAM_CLASSIFICATIONS[key] === category);
}

export function getPrimaryProgram(record = {}) {
  const programs = getConsultationPrograms(record);
  const primary = record.primaryProgram ?? record.monitoringData?.primaryProgram ?? record.monitoring_data?.primaryProgram;
  return programs.includes(primary) ? primary : programs[0] || "";
}

export function toggleConsultationProgram(programs, primary, key) {
  const selectedPrograms = programs.includes(key) ? programs.filter((item) => item !== key) : [...programs, key];
  return { selectedPrograms, primaryProgram: selectedPrograms.includes(primary) ? primary : selectedPrograms[0] || "" };
}
