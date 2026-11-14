import assert from "node:assert/strict";
import test from "node:test";
import {
  clinicalReviewRows, rhuVitalReviewRows, rhuProgramReviewRows,
  rhuDiagnosisReviewRows, rhuServiceReviewRows, rhuBackgroundReviewRows,
} from "./rhuConsultationReview.js";

const text = (rows) => rows.map(({ label, value }) => `${label}: ${value}`).join("\n");

test("review covers every entered vital with units and preserves zero", () => {
  const result = text(rhuVitalReviewRows({ systolicBp: 120, diastolicBp: 80, temp: 36.7, pulse: 73, spo2: 98, weight: 62, height: 160, fbs: 0, showBmi: true }));
  for (const value of ["120/80 mmHg", "36.7 °C", "73 bpm", "98%", "62 kg", "160 cm", "0 mg/dL", "BMI: 24.2"]) assert.ok(result.includes(value), value);
  assert.deepEqual(rhuVitalReviewRows({}), []);
});

test("EPI review includes doses, CPAB assessment and evidence, breastfeeding decisions and remarks", () => {
  const result = text(rhuProgramReviewRows("Immunization", {
    immunizationEntries: [{ id: "private-id", vaccineName: "BCG", dose: "birth", dateGiven: "2026-11-14", timeGiven: "09:21" }],
    cpabAssessment: { status: "protected", notes: "Vaccination card checked" },
    maternalTtTdEvidence: [{ id: "evidence-id", vaccineType: "Td", dose: "2", dateAdministered: "2026-01-10", evidenceSource: "maternal_card" }],
    immunizationBreastfeeding: { month1: true, month2: false }, immunizationRemarks: "Return with card",
  }));
  for (const value of ["BCG", "Birth dose", "2026-11-14", "09:21", "Protected at birth", "Vaccination card checked", "Td", "2026-01-10", "Maternal vaccination card", "1 month: Yes", "2 months: No", "Return with card"]) assert.ok(result.includes(value), value);
  assert.doesNotMatch(result, /private-id|evidence-id|maternal_card/);
});

test("maternal review labels clinical abbreviations and preserves repeated results and zero OB counts", () => {
  const result = text(rhuProgramReviewRows("Maternal", { maternalData: {
    lmp: "2026-07-01", expectedDeliveryDate: "2027-04-07", aog: "19", term: 0, fht: "140",
    riskAssessment: { previousCs: true },
    laboratoryEntries: [{ test: "hemoglobin", result: "11", datePerformed: "2026-11-01" }, { test: "hemoglobin", result: "12", datePerformed: "2026-11-14" }],
    ultrasound: { result: "Entered scan findings", dateDone: "2026-11-12" },
    immunizationThisVisit: { type: "td2", doseStatus: "Complete", dateGiven: "2026-11-14" },
    previous_fp_method_used: "internal alias", previousFpMethodUsed: "Pills",
  } }));
  for (const value of ["Last menstrual period (LMP)", "Expected delivery date", "Age of gestation (weeks)", "Term: 0", "Fetal heart tone", "Previous C/S: Yes", "11", "12", "Entered scan findings", "Td2", "Pills"]) assert.ok(result.includes(value), value);
  assert.doesNotMatch(result, /internal alias/);
});

test("diagnosis review includes reporting, negative activation, BHC plan and readable laboratory evidence", () => {
  const labs = [{ reference: "record:12", testName: "HbA1c", resultStatus: "Result Available", result: "7.1%", remarks: "Fasting" }];
  const result = text(rhuDiagnosisReviewRows([{ id: "diagnosis-id", name: "Diabetes", activate: false,
    reportIn: ["morbidity", "surveillance"], nextAction: "manage_to_bhc", receivingBhcId: "9", monitoringRecommendation: "Check glucose weekly",
    supportingLaboratoryTests: [{ reference: "record:12" }], laboratoryEvidence: [{ reference: "record:12", version: 3 }], laboratoryEvidenceConfirmed: true,
  }], { catchmentBhcs: [{ id: 9, name: "Barangay Uno" }], laboratoryOptions: labs }));
  for (const value of ["Diabetes", "Morbidity", "Surveillance", "Active patient condition: No", "Barangay Uno", "Check glucose weekly", "HbA1c", "7.1%", "Fasting", "Confirmed"]) assert.ok(result.includes(value), value);
  assert.doesNotMatch(result, /diagnosis-id|record:12|Version/);
});

test("diagnosis review includes no-follow-up reasons, referral plans and TB assessment fields", () => {
  const result = text(rhuDiagnosisReviewRows([
    { name: "Cough", nextAction: "none", noFurtherFollowUpReason: "Symptoms resolved" },
    { name: "TB", nextAction: "refer_higher_level", higherLevelReferralPlan: { reason: "Specialist assessment", intendedFacility: "Provincial Hospital", clinicalPlan: "Bring records" },
      tbManagement: { diagnosisType: "tb_disease", drugResistance: "mdr_tb", treatmentDecision: "refer_elsewhere", dispositionReason: "Specialist needed", dispositionPlan: "Transfer care", tbCaseNumber: "TB-2026-10" } },
  ]));
  for (const value of ["Symptoms resolved", "Specialist assessment", "Provincial Hospital", "Bring records", "TB Disease", "Bacteriologically-confirmed MDR-TB", "Refer elsewhere", "Specialist needed", "Transfer care", "TB-2026-10"]) assert.ok(result.includes(value), value);
});

test("selected services keep independent actions, labs, handoffs and all usage fields", () => {
  const result = text(rhuServiceReviewRows({ selectedPrograms: ["Maternal", "EPI", "Family Planning", "Nutrition"],
    schedules: [{ purposeKey: "service:epi", date: "2026-12-14", time: "10:20", purpose: "Next vaccination" }],
    serviceHandoffs: [{ program: "Nutrition", receivingBhcId: "4", monitoringRecommendation: "Track weight", laboratoryEvidence: [{ reference: "record:18" }], laboratoryEvidenceConfirmed: true }],
    serviceSupportingLabs: [{ program: "Maternal", supportingLaboratoryTests: [{ reference: "record:18" }] }],
    laboratoryOptions: [{ reference: "record:18", testName: "CBC", result: "Entered lab result" }], catchmentBhcs: [{ id: 4, name: "North BHC" }],
    serviceUsages: [{ id: "usage-id", serviceProgram: "Family Planning", itemDescription: "Injectable", quantity: 2, unit: "vials", usedAt: "2026-11-14", note: "Entered usage note" }],
  }));
  for (const value of ["Maternal Care", "No additional action", "Schedule next visit", "Nutrition", "Manage to BHC", "North BHC", "Track weight", "CBC", "Entered lab result", "Injectable", "2", "vials", "2026-11-14", "Entered usage note"]) assert.ok(result.includes(value), value);
  assert.doesNotMatch(result, /usage-id|record:18/);
});

test("history review displays edited fields, explicit clearing and reviewed sections without revisions", () => {
  const result = text(rhuBackgroundReviewRows({
    sections: { medical: { allergies: { noneKnown: false, items: [{ allergen: "Penicillin", reaction: "Rash" }] } }, obstetric: { obstetric: { pregnancies: [{ year: 2020, outcome: "liveBirth", delivery: "cs", place: "District Hospital", note: "Recovery note" }] } }, family: { familyHistory: { noneKnown: false, items: [] } } },
    baseRevisions: { medical: 15 }, reviewed: ["social"],
  }));
  for (const value of ["Penicillin", "Rash", "2020", "District Hospital", "Recovery note", "Reviewed", "Family History"]) assert.ok(result.includes(value), value);
  assert.doesNotMatch(result, /baseRevisions|15/);
});

test("clinical rows never expose internal identifiers and preserve explicit negatives", () => {
  assert.deepEqual(clinicalReviewRows({ id: "opaque", version: 42, sourceRecordId: 77, confirmed: false, count: 0, blank: "" }), [
    { label: "Confirmed", value: "No" }, { label: "Count", value: "0" },
  ]);
});

test("family planning review retains each entered field and preserves narrative text verbatim", () => {
  assert.deepEqual(rhuProgramReviewRows("Family Planning", {
    familyPlanningData: { clientType: "Returning", methodUsed: "Injectable", actionTaken: "liveBirth\nnot_applicable", previousMethod: "Pills" },
  }), [
    { label: "Client type", value: "Returning" }, { label: "Method used", value: "Injectable" },
    { label: "Action taken", value: "liveBirth\nnot_applicable" }, { label: "Previous method", value: "Pills" },
  ]);
  assert.deepEqual(clinicalReviewRows({ note: "liveBirth" }), [{ label: "Note", value: "liveBirth" }]);
});
