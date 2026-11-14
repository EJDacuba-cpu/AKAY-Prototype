export const PROGRAM_CLASSIFICATIONS = Object.freeze({
  Maternal: "Maternal",
  "Family Planning": "Family Planning",
  EPI: "Immunization",
  Nutrition: "Nutrition",
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
 * Official draft / health-record classification for the visit's primary
 * program. Must stay in sync: draft autosave and finalize both use this so
 * EPI → Immunization, Maternal, Family Planning, and Nutrition match.
 */
export function classificationForPrimaryProgram(primaryProgram) {
  return primaryProgram && PROGRAM_CLASSIFICATIONS[primaryProgram]
    ? PROGRAM_CLASSIFICATIONS[primaryProgram]
    : "General Consultation";
}

/**
 * The classification to resume a saved draft with. A classification that no
 * longer belongs to any program (the removed Hypertension / Diabetic
 * Monitoring) follows the restored primary program instead.
 */
export function restoredClassification(classification, primaryProgram) {
  const known = classification === "General Consultation" || Object.values(PROGRAM_CLASSIFICATIONS).includes(classification);
  return known ? classification : classificationForPrimaryProgram(primaryProgram);
}

export const PATIENT_LOADING_REASON = "Loading patient details...";

/**
 * Service eligibility depends on the patient (sex, age), so until the patient
 * record has loaded every service stays disabled rather than briefly looking
 * open to everyone.
 */
export function lockProgramsWhilePatientLoads(programs, patientLoading) {
  if (!patientLoading) return programs;
  return programs.map((program) => ({
    ...program,
    disabled: true,
    disabledReason: PATIENT_LOADING_REASON,
    disabledNote: PATIENT_LOADING_REASON,
  }));
}

const PROGRAM_ENROLL_LABELS = Object.freeze({
  Maternal: "Include Maternal Care",
  "Family Planning": "Enroll to Family Planning",
  EPI: "Enroll to Child Health / EPI",
  Nutrition: "Enroll to Nutrition",
});

/** The label of the button that enrolls the patient in a service for this visit. */
export function programEnrollLabel(programKey, { enrolled } = {}) {
  if (programKey === "Maternal" && enrolled === true) return "Continue Maternal Care";
  if (programKey === "Maternal" && enrolled === false) return "Include Maternal Care";
  if (programKey === "Nutrition" && enrolled === true) return "Continue Nutrition Care";
  return PROGRAM_ENROLL_LABELS[programKey] || "Enroll";
}
