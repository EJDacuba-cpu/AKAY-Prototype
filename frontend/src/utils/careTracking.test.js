import assert from "node:assert/strict";
import test from "node:test";

import { getCareTracking, maternalCareCardStatus } from "./careTracking.js";
import { EPI_INFANT_SCHEDULE } from "./careTrackingConfig.js";

function woman(birthdate = "1995-01-01") {
  return { sex: "Female", birthdate };
}

function child(birthdate) {
  return { sex: "Male", birthdate };
}

function entry(entries, key) {
  return entries.find((item) => item.key === key);
}

// ---------------------------------------------------------------------------
// Maternal
// ---------------------------------------------------------------------------

test("maternal stays Prenatal on EDD alone, with no delivery date or postpartum visit", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      maternalData: { gravida: "2", para: "1" },
      expectedDeliveryDate: "2026-12-01",
      followUpDate: "2026-07-15",
    },
  ];
  const maternal = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "maternal");
  assert.equal(maternal.label, "Maternal Care");
  assert.equal(maternal.status, "Prenatal");
  assert.equal(maternalCareCardStatus(maternal.status), "Active");
  assert.ok(maternal.facts.some((f) => f.label === "EDD" && f.value === "2026-12-01"));
  assert.equal(maternal.nextVisit, "2026-07-15");
});

test("Care & Programs keeps Prenatal as the episode phase and shows it as Active", () => {
  assert.equal(maternalCareCardStatus("Prenatal"), "Active");
  assert.equal(maternalCareCardStatus("Postpartum"), "Postpartum");
  assert.equal(maternalCareCardStatus("Completed"), "Completed");
  assert.equal(maternalCareCardStatus("Not started"), "Not started");
});

test("maternal switches to Postpartum only once an actual delivery date is recorded", () => {
  const records = [
    { id: 1, dateOfVisit: "2026-06-01", selectedPrograms: ["Maternal"], maternalData: {} },
    {
      id: 2,
      dateOfVisit: "2026-09-10",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Postpartum"] } },
      maternalData: { deliveryDate: "2026-09-09" },
    },
  ];
  const maternal = entry(getCareTracking(woman(), records, new Date("2026-09-15")), "maternal");
  assert.equal(maternal.status, "Postpartum");
  assert.ok(maternal.facts.some((f) => f.label === "Delivery Date" && f.value === "2026-09-09"));
});

test("maternal completes 43 days after delivery, not before", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Postpartum"] } },
      maternalData: { deliveryDate: "2026-06-01" },
    },
  ];
  const onDay42 = entry(getCareTracking(woman(), records, new Date("2026-07-13")), "maternal");
  assert.equal(onDay42.status, "Postpartum");

  const onDay43 = entry(getCareTracking(woman(), records, new Date("2026-07-14")), "maternal");
  assert.equal(onDay43.status, "Completed");
});

test("a missing delivery date keeps the episode in Postpartum with a flag and an action", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-09-10",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Postpartum"] } },
      maternalData: {},
    },
  ];
  const maternal = entry(getCareTracking(woman(), records, new Date("2026-09-15")), "maternal");
  assert.equal(maternal.status, "Postpartum");
  assert.ok(maternal.flags.some((f) => f.label === "Delivery date not recorded"));
  assert.equal(maternal.action?.type, "start-postpartum-follow-up");
});

test("a new Prenatal visit after a completed episode starts a fresh episode", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2025-01-01",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Postpartum"] } },
      maternalData: { deliveryDate: "2025-01-01" },
    },
    {
      id: 2,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Prenatal"] } },
      maternalData: { gravida: "2", para: "1" },
      expectedDeliveryDate: "2026-12-01",
    },
  ];
  const maternal = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "maternal");
  assert.equal(maternal.status, "Prenatal");
  assert.ok(!maternal.facts.some((f) => f.label === "Delivery Date"));
});

// ---------------------------------------------------------------------------
// TB
// ---------------------------------------------------------------------------

test("TB shows the latest phase until an outcome is recorded, even past continuation end", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-01-01",
      selectedPrograms: ["TB"],
      tbData: {
        phases: { intensiveStart: "2026-01-01", continuationStart: "2026-03-01", continuationEnd: "2026-06-01" },
        doseCalendar: { adherencePercent: 95 },
      },
    },
  ];
  const tb = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "tb");
  assert.equal(tb.status, "Continuation Phase");
  assert.ok(tb.flags.some((f) => f.label === "Outcome not recorded"));
});

test("a recorded TB outcome overrides the phase-derived status", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-01-01",
      selectedPrograms: ["TB"],
      tbData: {
        phases: { continuationEnd: "2026-06-01" },
        outcome: { status: "cured" },
      },
    },
  ];
  const tb = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "tb");
  assert.equal(tb.status, "Cured");
  assert.equal(tb.statusTone, "success");
  assert.ok(!tb.flags.some((f) => f.label === "Outcome not recorded"));
});

// ---------------------------------------------------------------------------
// Family Planning
// ---------------------------------------------------------------------------

test("family planning badge is the latest recorded client type, never auto-Lapsed", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Family Planning"],
      familyPlanningData: { clientType: "Current User", methodUsed: "Pills (COC)", nextAppointmentDate: "2026-07-01" },
    },
  ];
  const fp = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "familyPlanning");
  assert.equal(fp.status, "Current User");
  assert.ok(fp.flags.some((f) => f.label === "Appointment overdue"));
});

test("family planning has no overdue flag when the next appointment has not passed", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Family Planning"],
      familyPlanningData: { clientType: "New Acceptor", nextAppointmentDate: "2026-12-01" },
    },
  ];
  const fp = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "familyPlanning");
  assert.equal(fp.flags.length, 0);
});

// ---------------------------------------------------------------------------
// EPI
// ---------------------------------------------------------------------------

test("EPI counts only the configured infant schedule toward X of Y, extras become chips", () => {
  const records = [
    {
      id: 1,
      dateOfVisit: "2026-01-01",
      selectedPrograms: ["EPI"],
      immunizationData: {
        vaccineEntries: [
          { vaccineName: "BCG", dateGiven: "2026-01-01" },
          { vaccineName: "HPV", dateGiven: "2026-01-01" },
          { vaccineName: "Newborn Screening", dateGiven: "2026-01-01" },
        ],
      },
    },
  ];
  const epi = entry(getCareTracking(child("2025-12-01"), records, new Date("2026-01-15")), "epi");
  assert.equal(epi.status, "In progress");
  assert.ok(epi.facts[0].value.startsWith(`1 of ${EPI_INFANT_SCHEDULE.length}`));
  assert.ok(epi.flags.some((f) => f.label === "HPV"));
  assert.ok(epi.flags.some((f) => f.label === "Newborn Screening"));
});

test("EPI reads Fully Immunized when the schedule completes before the FIC age limit", () => {
  const dateGiven = "2026-01-01";
  const records = [
    {
      id: 1,
      dateOfVisit: dateGiven,
      selectedPrograms: ["EPI"],
      immunizationData: {
        vaccineEntries: EPI_INFANT_SCHEDULE.map((vaccineName) => ({ vaccineName, dateGiven })),
      },
    },
  ];
  // Born 2025-06-01, all doses given 2026-01-01 => 7 months old at completion.
  const epi = entry(getCareTracking(child("2025-06-01"), records, new Date("2026-01-15")), "epi");
  assert.equal(epi.status, "Fully Immunized (FIC)");
});

test("EPI reads Completely Immunized when the schedule completes after the FIC age limit", () => {
  const dateGiven = "2026-01-01";
  const records = [
    {
      id: 1,
      dateOfVisit: dateGiven,
      selectedPrograms: ["EPI"],
      immunizationData: {
        vaccineEntries: EPI_INFANT_SCHEDULE.map((vaccineName) => ({ vaccineName, dateGiven })),
      },
    },
  ];
  // Born 2024-06-01, all doses given 2026-01-01 => 19 months old at completion.
  const epi = entry(getCareTracking(child("2024-06-01"), records, new Date("2026-01-15")), "epi");
  assert.equal(epi.status, "Completely Immunized (CIC)");
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

test("a program with no history and no eligibility is left out, except Nutrition Care", () => {
  const entries = getCareTracking({ sex: "Male", birthdate: "1980-01-01" }, [], new Date("2026-09-01"));
  assert.deepEqual(entries.map((item) => item.key), ["nutrition"]);
  assert.equal(entries[0].status, "Not Enrolled");
  assert.equal(entries[0].statusTone, "neutral");
  assert.equal(entries[0].label, "Nutrition Care");
  assert.equal(entries[0].action, null);
  assert.deepEqual(entries[0].records, []);
  assert.deepEqual(entries[0].measurementHistory, []);
  assert.equal(entries[0].nextVisit, "");
});

test("TB is absent without history even for an otherwise-eligible patient", () => {
  const entries = getCareTracking(woman(), [], new Date("2026-09-01"));
  assert.equal(entries.find((e) => e.key === "tb"), undefined);
});

test("confirmed Hypertension and Diabetes cards come from RHU conditions, not enrollment", () => {
  const conditions = [
    { id: 1, conditionName: "Hypertension", conditionIdentity: "hypertension", status: "active", monitoring: null },
    { id: 2, conditionName: "Diabetes Mellitus", conditionIdentity: "diabetes_mellitus", status: "controlled", monitoring: { id: 9, startedAt: "2026-09-01", status: "active" } },
  ];
  const records = [
    { id: 10, dateOfVisit: "2026-09-10", systolicBp: "138", diastolicBp: "86" },
    { id: 11, dateOfVisit: "2026-09-17", fbs: "118" },
  ];
  const entries = getCareTracking(woman(), records, new Date("2026-09-20"), { conditions });
  const htn = entry(entries, "hypertension");
  const dm = entry(entries, "diabetes_mellitus");
  assert.equal(htn.status, "Active");
  assert.ok(htn.facts.some((fact) => fact.label === "BHC monitoring" && fact.value === "Not Started"));
  assert.ok(htn.facts.some((fact) => fact.label === "Latest BP" && String(fact.value).includes("138")));
  assert.equal(htn.nextVisit, "");
  assert.equal(dm.status, "Controlled");
  assert.ok(dm.facts.some((fact) => fact.label === "BHC monitoring" && fact.value === "Active"));
  assert.ok(dm.facts.some((fact) => fact.label === "Latest FBS" && String(fact.value).includes("118")));
});

test("NCD next visit uses the earliest matching open follow-up and skips fulfilled or cancelled tasks", () => {
  const conditions = [
    { id: 1, conditionName: "Hypertension", conditionIdentity: "hypertension", status: "active" },
    { id: 2, conditionName: "Diabetes Mellitus", conditionIdentity: "diabetes_mellitus", status: "active" },
  ];
  const followUpTasks = [
    { id: 1, purpose: "Continue hypertension follow-up", dueDate: "2026-10-01", state: "fulfilled" },
    { id: 2, purpose: "Hypertension review", dueDate: "2026-09-01", state: "pending" },
    { id: 3, purpose: "Hypertension return", dueDate: "2026-08-15", state: "no_show" },
    { id: 4, purpose: "Diabetes FBS check", dueDate: "2026-09-20", state: "pending" },
    { id: 5, purpose: "Diabetes labs", dueDate: "2026-09-10", state: "cancelled" },
    { id: 6, purpose: "General checkup", dueDate: "2026-07-01", state: "pending" },
  ];
  const entries = getCareTracking(woman(), [
    { id: 10, dateOfVisit: "2026-08-01", systolicBp: "140", diastolicBp: "90" },
  ], new Date("2026-09-20"), { conditions, followUpTasks });
  assert.equal(entry(entries, "hypertension").nextVisit, "2026-08-15");
  assert.equal(entry(entries, "diabetes_mellitus").nextVisit, "2026-09-20");
});

test("RHU confirmation alone does not mark Hypertension as under BHC monitoring", () => {
  const entries = getCareTracking(woman(), [], new Date("2026-09-01"), {
    conditions: [{ id: 1, conditionName: "Hypertension", conditionIdentity: "hypertension", status: "active" }],
  });
  const htn = entry(entries, "hypertension");
  assert.equal(htn.status, "Active");
  assert.ok(htn.facts.some((fact) => fact.label === "BHC monitoring" && fact.value === "Not Started"));
});

test("a confirmed TB condition appears without duplicating a records-only TB card", () => {
  const records = [{
    id: 1,
    dateOfVisit: "2026-08-01",
    tbData: { diagnosis: { tbCaseNumber: "TB-2026-014" }, phases: { intensiveStart: "2026-08-02" } },
  }];
  const entries = getCareTracking(woman(), records, new Date("2026-09-01"), {
    conditions: [{ id: 3, conditionName: "Tuberculosis", conditionIdentity: "tuberculosis", status: "active", monitoring: { id: 4, status: "active" } }],
  });
  const tbCards = entries.filter((item) => item.key === "tb" || item.key === "tuberculosis");
  assert.equal(tbCards.length, 1);
  assert.equal(tbCards[0].key, "tb");
  assert.ok(tbCards[0].facts.some((fact) => fact.label === "Case No." && fact.value === "TB-2026-014"));
  assert.ok(tbCards[0].facts.some((fact) => fact.label === "BHC monitoring" && fact.value === "Active"));
});

test("presumptive TB evaluation shows Under Evaluation with only linked laboratory statuses", () => {
  const records = [{
    id: 11,
    dateOfVisit: "2026-11-10",
    diagnoses: [{
      id: "tb",
      name: "TB",
      tbManagement: { diagnosisType: "presumptive_tb" },
      supportingLaboratoryTests: [{ reference: "record:9" }],
    }],
    laboratoryTests: [
      { recordId: 9, testName: "Xpert MTB/RIF", resultStatus: "Awaiting Result" },
      { recordId: 10, testName: "CBC", resultStatus: "Result Available", result: "Normal" },
    ],
  }];
  const tb = entry(getCareTracking(woman(), records, new Date("2026-11-10"), {
    conditions: [{ id: 3, conditionName: "Tuberculosis", conditionIdentity: "tuberculosis", status: "under_evaluation" }],
  }), "tb");
  assert.equal(tb.status, "Under Evaluation");
  assert.ok(tb.facts.some((fact) => fact.label === "Supporting labs" && String(fact.value).includes("Xpert MTB/RIF") && String(fact.value).includes("Awaiting Result")));
  assert.ok(!tb.facts.some((fact) => String(fact.value || "").includes("CBC")));
  assert.ok(!tb.facts.some((fact) => fact.label === "Case No."));
});

test("stopped monitoring and resolved conditions keep history without looking active", () => {
  const entries = getCareTracking(woman(), [
    { id: 1, dateOfVisit: "2026-08-01", systolicBp: "150", diastolicBp: "95" },
  ], new Date("2026-09-01"), {
    conditions: [{
      id: 1,
      conditionName: "Hypertension",
      conditionIdentity: "hypertension",
      status: "resolved",
      monitoring: { id: 8, status: "stopped", startedAt: "2026-08-01" },
    }],
  });
  const htn = entry(entries, "hypertension");
  assert.equal(htn.status, "Resolved");
  assert.ok(htn.facts.some((fact) => fact.label === "BHC monitoring" && fact.value === "Stopped"));
  assert.ok(htn.records.length > 0);
});

test("EPI shows Not started for an eligible child with no records", () => {
  const epi = entry(getCareTracking(child("2025-01-01"), [], new Date("2026-01-01")), "epi");
  assert.equal(epi.status, "Not started");
});

test("nutrition care derives Active facts from episode measurements and withholds a child's BMI category", () => {
  const records = [
    { id: 1, dateOfVisit: "2026-09-01", weight: "80", height: "170" },
    {
      id: 2,
      dateOfVisit: "2026-10-01",
      selectedPrograms: ["Nutrition"],
      vitalSigns: { weight: "18", height: "110" },
    },
    { id: 3, dateOfVisit: "2026-10-05", category: "General Consultation", weight: "19", height: "110" },
    { id: 3, dateOfVisit: "2026-10-05", weight: "40", height: "110" },
  ];
  const nutrition = entry(getCareTracking(child("2020-01-01"), records, new Date("2026-06-01")), "nutrition");
  assert.equal(nutrition.status, "Active");
  assert.equal(nutrition.statusTone, "success");
  assert.equal(nutrition.lastVisit, "2026-10-05");
  assert.equal(nutrition.nextVisit, "");
  assert.deepEqual(nutrition.flags, []);
  assert.deepEqual(nutrition.action, { type: "close-nutrition-care", label: "Close Nutrition Care" });
  assert.deepEqual(nutrition.records.map((record) => record.id), [2]);
  assert.deepEqual(nutrition.measurementHistory.map((row) => row.healthRecordId), [2, 3]);
  assert.equal(nutrition.measurementHistory[0].bmiCategory, "");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Enrollment Date").value, "2026-10-01");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Latest Weight").value, "19 kg");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Latest Height/Length").value, "110 cm");
  const bmi = nutrition.facts.find((fact) => fact.label === "Latest BMI").value;
  assert.match(bmi, /^15\.7$/);
  assert.doesNotMatch(bmi, /Underweight|Normal|Overweight|Obese/);
});

test("nutrition care prefers the API summary for status, facts, and history", () => {
  const records = [
    { id: 2, dateOfVisit: "2026-10-01", selectedPrograms: ["Nutrition"], weight: "50", height: "150" },
    { id: 3, dateOfVisit: "2026-10-08", weight: "55", height: "150" },
  ];
  const nutrition = entry(getCareTracking({ birthdate: "1990-01-15" }, records, new Date("2026-11-05"), {
    nutritionCare: {
      status: "Active",
      enrolled: true,
      enrolled_on: "2026-10-01",
      latest_weight_kg: 70,
      latest_height_cm: 170,
      latest_bmi: 70 / (1.7 ** 2),
      latest_bmi_category: "Normal",
      measurement_history: [
        { health_record_id: 5, date_recorded: "2026-10-01", weight_kg: 70, height_cm: 170, bmi: 24.2 },
      ],
    },
  }), "nutrition");
  assert.equal(nutrition.status, "Active");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Latest Weight").value, "70 kg");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Latest Height/Length").value, "170 cm");
  assert.equal(nutrition.facts.find((fact) => fact.label === "Latest BMI").value, "24.2 Normal");
  assert.deepEqual(nutrition.measurementHistory.map((row) => row.healthRecordId), [5]);
  assert.equal(nutrition.lastVisit, "2026-10-01");
});

test("a closed nutrition episode keeps its enrollment date and drops the close action", () => {
  const records = [
    { id: 1, dateOfVisit: "2026-10-01", createdAt: "2026-10-01T09:00:00+08:00", selectedPrograms: ["Nutrition"], weight: "70", height: "170" },
  ];
  const nutrition = entry(getCareTracking({ birthdate: "1990-01-15" }, records, new Date("2026-11-05"), {
    nutritionCare: {
      closures: [{
        startedHealthRecordId: 1,
        closedOn: "2026-10-10",
        createdAt: "2026-10-10T12:00:00+08:00",
        enrolledOn: "2026-10-01",
      }],
    },
  }), "nutrition");
  assert.equal(nutrition.status, "Closed");
  assert.equal(nutrition.statusTone, "neutral");
  assert.equal(nutrition.action, null);
  assert.equal(nutrition.facts.find((fact) => fact.label === "Enrollment Date").value, "2026-10-01");
  assert.match(nutrition.facts.find((fact) => fact.label === "Latest BMI").value, /Normal/);
});
