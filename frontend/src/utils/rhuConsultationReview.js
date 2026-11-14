import { compactReviewRows } from "./consultationReview.js";
import { calculateBmi, formatBmi } from "./bmi.js";
import { maternalReviewFields, MATERNAL_RISK_GROUPS, PRENATAL_IMMUNIZATION_OPTIONS } from "./prenatalForm.js";
import { CPAB_EVIDENCE_SOURCES, CPAB_STATUS_OPTIONS } from "./epiVaccineCatalog.js";
import { BACKGROUND_SECTION_LABELS } from "./backgroundUpdate.js";
import { DELIVERY_TYPES, EXPOSURES, MENSTRUAL_SYMPTOMS, PREGNANCY_OUTCOMES } from "./patientHistory.js";
import { diagnosisNextAction, RHU_NEXT_ACTIONS } from "./rhuCarePlan.js";
import { DR_TB_SUBTYPE_OPTIONS, TB_ASSESSMENT_OPTIONS, TB_SUSCEPTIBILITY_PRIMARY_OPTIONS } from "./rhuTbCaseManagement.js";
import { entryDestinations } from "./reportingEntries.js";
import { laboratorySummary } from "./laboratoryTests.js";
import { carePlanServiceLabel, selectedCarePlanServices, serviceNextAction, SERVICE_NEXT_ACTIONS } from "./serviceNextActions.js";

const present = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const labelFrom = (options, value) => options.find((option) => option.value === value)?.label || value;
const humanize = (key) => String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
const LABELS = {
  lmp: "Last menstrual period (LMP)", pmp: "Previous menstrual period (PMP)", aog: "Age of gestation (weeks)",
  expectedDeliveryDate: "Expected delivery date", fht: "Fetal heart tone (bpm)", bmi: "BMI",
  previousFpMethodUsed: "Previous family planning method", previousFpMethodOther: "Previous method — other",
  riskAssessment: "Risk assessment", ageRisk: "Age risk", heightRisk: "Height risk",
  ...Object.fromEntries(MATERNAL_RISK_GROUPS.flatMap((group) => group.options.map((option) => [option.key, option.label]))),
  laboratoryResults: "Laboratory results", immunizationThisVisit: "Immunization this visit",
  tetanusToxoidStatus: "TT dose history", tetanusDiphtheriaStatus: "Td dose history",
  vaccineEntries: "Vaccine / essential service", cpabAssessment: "Child protected at birth (CPAB)",
  maternalTtTdEvidence: "Documented maternal TT / Td doses", breastfeedingMonitoring: "Exclusive breastfeeding",
  month1: "1 month", month2: "2 months", month3: "3 months", month4: "4 months", month5: "5 months", month6: "6 months",
  vaccineName: "Vaccine / service", vaccineType: "Vaccine type", dateAdministered: "Date administered", evidenceSource: "Evidence source",
  consultationNotes: "Remarks", clientType: "Client type", previousMethod: "Previous method", methodUsed: "Method used", actionTaken: "Action taken",
  currentDiseases: "Patient-reported conditions", personalSocial: "Personal and social history", familyHistory: "Family conditions",
  noneKnown: "None known", none: "None", highSalt: "High salt", lowFruitVeg: "Low fruit and vegetables",
  previousFpMethod: "Previous family planning method",
  menarcheAge: "Age at menarche", intervalDays: "Cycle interval (days)", durationDays: "Period duration (days)",
  drug4fdc: "4-FDC", drug2fdc: "2-FDC", drugH: "Isoniazid (H)", drugR: "Rifampicin (R)", drugZ: "Pyrazinamide (Z)", drugE: "Ethambutol (E)",
  xpert: "Xpert MTB/RIF", smearOrLamp: "Smear microscopy / TB LAMP", chestXray: "Chest X-ray", tst: "Tuberculin skin test",
  hivStatus: "HIV status", artStatus: "ART status", cptStatus: "CPT status", tbCaseNumber: "TB case number",
};
// Technical identifiers and legacy mirrors are not clinician-entered findings.
const INTERNAL_KEYS = new Set(["id", "version", "reference", "medicineId", "given_by_id", "givenById", "sourceRecordId", "sourceFindingIndex", "relativePatientId", "source", "firstRecorded", "createdAt", "updatedAt", "baseRevisions", "base_revisions", "derived", "clinicalSourceHint", "previous_fp_method_used", "previous_fp_method_other", "previous_method", "tpal", "tetanus_toxoid_status", "tetanus_diphtheria_status", "previous_pregnancy_history", "medicalHistory"]);

function clinicalValue(key, value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "status" && CPAB_STATUS_OPTIONS.some((option) => option.value === value)) return labelFrom(CPAB_STATUS_OPTIONS, value);
  if (key === "evidenceSource") return labelFrom(CPAB_EVIDENCE_SOURCES, value);
  if (key === "diagnosisType") return labelFrom(TB_ASSESSMENT_OPTIONS, value);
  if (key === "drugResistance") return labelFrom([...TB_SUSCEPTIBILITY_PRIMARY_OPTIONS, ...DR_TB_SUBTYPE_OPTIONS], value);
  if (key === "outcome") return labelFrom(PREGNANCY_OUTCOMES, value);
  if (key === "delivery") return labelFrom(DELIVERY_TYPES, value);
  if (key === "exposures") return labelFrom(EXPOSURES, value);
  if (key === "symptoms") return labelFrom(MENSTRUAL_SYMPTOMS, value);
  if (key === "type" && PRENATAL_IMMUNIZATION_OPTIONS.some((option) => option.value === value)) return labelFrom(PRENATAL_IMMUNIZATION_OPTIONS, value);
  if (key === "dose" && value === "birth") return "Birth dose";
  const enums = { liveBirth: "Live birth", notApplicable: "Not applicable", on_art: "On ART", not_on_art: "Not on ART", on_cpt: "On CPT", not_on_cpt: "Not on CPT", non_reactive: "Non-reactive", not_done: "Not done", not_applicable: "Not applicable", initiate_at_rhu: "Initiate treatment at RHU", not_yet_initiated: "Not yet initiated", refer_elsewhere: "Refer elsewhere" };
  const enumField = ["hivStatus", "artStatus", "cptStatus", "treatmentDecision", "bacteriologicalStatus", "anatomicalSite", "registrationGroup", "locationOfTreatment", "referredBy", "menstrualStatus", "active", "status"].includes(key);
  if (enumField) return Object.hasOwn(enums, value) ? enums[value] : humanize(value);
  return String(value);
}

/** Readable clinical fields, preserving explicit No and zero without rendering object JSON. */
export function clinicalReviewRows(value, prefix = "", field = "") {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "object") return [{ label: prefix, value: clinicalValue(field, value) }];
  return Object.entries(value).flatMap(([key, item]) => {
    if (INTERNAL_KEYS.has(key)) return [];
    const index = /^\d+$/.test(key);
    const label = index ? String(Number(key) + 1) : LABELS[key] || (/^(tt|td)\d$/.test(key) ? key.replace(/^tt/, "TT").replace(/^td/, "Td") : humanize(key));
    return clinicalReviewRows(item, prefix ? `${prefix} / ${label}` : label, index ? field : key);
  });
}

export function rhuVitalReviewRows({ systolicBp, diastolicBp, temp, pulse, spo2, weight, height, fbs, showBmi = false } = {}) {
  const measure = (label, value, unit) => ({ label, value: present(value) ? `${value}${unit}` : "" });
  return compactReviewRows([
    { label: "Blood pressure", value: present(systolicBp) || present(diastolicBp) ? `${present(systolicBp) ? systolicBp : "?"}/${present(diastolicBp) ? diastolicBp : "?"} mmHg` : "" },
    measure("Temperature", temp, " °C"), measure("Pulse rate", pulse, " bpm"), measure("Oxygen saturation (SpO2)", spo2, "%"),
    measure("Weight", weight, " kg"), measure("Height", height, " cm"), measure("Fasting blood sugar", fbs, " mg/dL"),
    { label: "BMI", value: showBmi ? formatBmi(calculateBmi(weight, height)) : "" },
  ]);
}

export function rhuProgramReviewRows(classification, data = {}) {
  if (classification === "Maternal") return clinicalReviewRows(maternalReviewFields(data.maternalData || {}));
  if (classification === "Family Planning") return clinicalReviewRows({ ...data.familyPlanningData, previousMethod: data.previousMethod || data.familyPlanningData?.previousMethod });
  if (classification === "Immunization") return clinicalReviewRows({ vaccineEntries: data.immunizationEntries, cpabAssessment: data.cpabAssessment, maternalTtTdEvidence: data.maternalTtTdEvidence, breastfeedingMonitoring: data.immunizationBreastfeeding, consultationNotes: data.immunizationRemarks });
  return [];
}

function receivingBhcLabel(id, bhcs) {
  if (!present(id)) return "";
  return bhcs.find((bhc) => String(bhc.id) === String(id))?.name || "Selected BHC (name unavailable)";
}

function laboratoryRows(selected = [], options = [], label) {
  return selected.map((selection, index) => {
    const entry = options.find((option) => option.reference === selection.reference);
    return { label: `${label} ${index + 1}`, value: entry ? laboratorySummary(entry) : "Selected laboratory test (details unavailable)" };
  });
}

export function rhuDiagnosisReviewRows(diagnoses = [], { catchmentBhcs = [], laboratoryOptions = [] } = {}) {
  return compactReviewRows(diagnoses.flatMap((entry) => {
    const name = entry.name || "Diagnosis";
    const row = (label, value) => ({ label: `${name} — ${label}`, value });
    const action = diagnosisNextAction(entry);
    return [
      { label: "Diagnosis", value: entry.name },
      row("Report in", entryDestinations(entry).map(humanize).join(", ") || "Not selected for reporting"),
      row("Active patient condition", entry.activate ? "Yes" : "No"),
      row("Next action", RHU_NEXT_ACTIONS[action]),
      ...(action === "none" ? [row("Reason for BHC", entry.noFurtherFollowUpReason)] : []),
      ...(action === "manage_to_bhc" ? [
        row("Receiving BHC", receivingBhcLabel(entry.receivingBhcId, catchmentBhcs)), row("Monitoring recommendation", entry.monitoringRecommendation),
        ...laboratoryRows(entry.laboratoryEvidence, laboratoryOptions, `${name} — Laboratory evidence to share`),
        ...(entry.laboratoryEvidence?.length ? [row("Laboratory evidence sharing", entry.laboratoryEvidenceConfirmed ? "Confirmed" : "Not confirmed")] : []),
      ] : []),
      ...(action === "refer_higher_level" ? [row("Referral reason", entry.higherLevelReferralPlan?.reason), row("Intended facility", entry.higherLevelReferralPlan?.intendedFacility), row("Clinical plan", entry.higherLevelReferralPlan?.clinicalPlan)] : []),
      ...laboratoryRows(entry.supportingLaboratoryTests, laboratoryOptions, `${name} — Supporting laboratory test`),
      ...clinicalReviewRows(entry.tbManagement, `${name} — TB assessment`),
    ];
  }));
}

export function rhuServiceReviewRows({ selectedPrograms = [], schedules = [], serviceHandoffs = [], serviceSupportingLabs = [], serviceUsages = [], catchmentBhcs = [], laboratoryOptions = [] } = {}) {
  return compactReviewRows(selectedCarePlanServices(selectedPrograms).flatMap((program) => {
    const name = carePlanServiceLabel(program);
    const handoff = serviceHandoffs.find((entry) => entry.program === program);
    const supporting = serviceSupportingLabs.find((entry) => entry.program === program);
    return [
      { label: `${name} — Next action`, value: SERVICE_NEXT_ACTIONS[serviceNextAction(program, { schedules, serviceHandoffs })] },
      ...(handoff ? [
        { label: `${name} — Receiving BHC`, value: receivingBhcLabel(handoff.receivingBhcId, catchmentBhcs) },
        { label: `${name} — Monitoring recommendation`, value: handoff.monitoringRecommendation },
        ...laboratoryRows(handoff.laboratoryEvidence, laboratoryOptions, `${name} — Laboratory evidence to share`),
        ...(handoff.laboratoryEvidence?.length ? [{ label: `${name} — Laboratory evidence sharing`, value: handoff.laboratoryEvidenceConfirmed ? "Confirmed" : "Not confirmed" }] : []),
      ] : []),
      ...laboratoryRows(supporting?.supportingLaboratoryTests, laboratoryOptions, `${name} — Supporting laboratory test`),
      ...serviceUsages.filter((entry) => entry.serviceProgram === program).flatMap((entry, index) => clinicalReviewRows({
        item: entry.itemDescription, quantity: entry.quantity, unit: entry.unit, dateUsed: entry.usedAt, note: entry.note,
      }, `${name} — Item used ${index + 1}`)),
    ];
  }));
}

export function rhuBackgroundReviewRows(update) {
  return Object.entries(BACKGROUND_SECTION_LABELS).flatMap(([section, label]) => {
    const edited = update?.sections?.[section];
    if (edited) return [{ label, value: "Updated this consultation" }, ...clinicalReviewRows(edited, label)];
    return update?.reviewed?.includes(section) ? [{ label, value: "Reviewed — no changes" }] : [];
  });
}
