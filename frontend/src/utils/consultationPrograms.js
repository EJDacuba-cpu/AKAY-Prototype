export const PROGRAM_CLASSIFICATIONS = Object.freeze({
  Maternal: "Maternal",
  "Family Planning": "Family Planning",
  EPI: "Immunization",
});

export function getConsultationPrograms(record = {}) {
  const stored = record.selectedPrograms ?? record.monitoringData?.selectedPrograms ?? record.monitoring_data?.selectedPrograms;
  if (Array.isArray(stored)) return [...new Set(stored.filter((key) => Object.hasOwn(PROGRAM_CLASSIFICATIONS, key)))];
  const category = record.category || record.patientClassification || record.classification || record.recordType || record.record_type || "";
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

/**
 * The classification to resume a saved draft with. A classification that no
 * longer belongs to any program (the removed Hypertension / Diabetic
 * Monitoring) follows the restored primary program instead.
 */
export function restoredClassification(classification, primaryProgram) {
  const known = classification === "General Consultation" || Object.values(PROGRAM_CLASSIFICATIONS).includes(classification);
  return known ? classification : PROGRAM_CLASSIFICATIONS[primaryProgram] || "General Consultation";
}
