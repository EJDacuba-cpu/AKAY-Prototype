import { calculateAgeInMonths, getPatientSex } from "./patientUtils.js";
import { patientBirthDate } from "./infantVisibility.js";

export const PROGRAM_CLASSIFICATIONS = Object.freeze({
  Maternal: "Maternal",
  "Family Planning": "Family Planning",
  EPI: "Immunization",
  Nutrition: "Nutrition",
});

export function consultationPatientAge(patient, visitDate) {
  const birthDate = patientBirthDate(patient) || patient?.birth_date || patient?.dob;
  const months = calculateAgeInMonths(birthDate, visitDate);
  if (months !== "") return Math.floor(months / 12);

  const ageText = String(patient?.age ?? "").trim() || String(patient?.ageSex ?? "").trim();
  const ageMatch = ageText.match(/^(\d+(?:\.\d+)?)(?:\s*(months?\b|mos?\b|days?\b))?/i);
  if (!ageMatch) return null;
  const age = Number(ageMatch[1]);
  const unit = ageMatch[2]?.toLowerCase();
  if (unit?.startsWith("mo")) return Math.floor(age / 12);
  return unit?.startsWith("day") ? 0 : age;
}

/** Reason a service cannot be started for this patient during this visit. */
export function consultationProgramRestriction(program, patient, visitDate) {
  if (program === "Maternal" && /^(m|male)$/i.test(getPatientSex(patient))) {
    return "Maternal Care is unavailable for patients recorded as male.";
  }
  const age = consultationPatientAge(patient, visitDate);
  if (age === null) return "";
  if ((program === "Maternal" || program === "Family Planning") && age < 10) {
    return `${program === "Maternal" ? "Maternal Care" : "Family Planning"} is available from age 10.`;
  }
  if (program === "EPI" && age > 1) {
    return "Child Health / EPI is available through age 1.";
  }
  return "";
}

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
 * Patient details determine eligibility and linked follow-ups determine
 * which services are already selected.
 */
export function lockProgramsWhilePatientLoads(programs, patientLoading, followUpsLoading = false) {
  if (!patientLoading && !followUpsLoading) return programs;
  const note = patientLoading ? PATIENT_LOADING_REASON : "Loading linked follow-ups...";
  return programs.map((program) => ({
    ...program,
    disabled: true,
    disabledReason: note,
    disabledNote: note,
    busy: true,
    actionLabel: "Loading",
    statusLabel: "Loading",
    statusTone: "neutral",
  }));
}

const PROGRAM_ENROLL_LABELS = Object.freeze({
  Maternal: "Enroll to Maternal Care",
  "Family Planning": "Enroll to Family Planning",
  EPI: "Enroll to Child Health / EPI",
  Nutrition: "Enroll to Nutrition",
});

/** The label of the button that enrolls the patient in a service for this visit. */
export function programEnrollLabel(programKey, { enrolled } = {}) {
  if (programKey === "Maternal" && enrolled === true) return "Continue Maternal Care";
  if (programKey === "Nutrition" && enrolled === true) return "Continue Nutrition Care";
  return PROGRAM_ENROLL_LABELS[programKey] || "Enroll";
}
