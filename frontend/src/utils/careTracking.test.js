import assert from "node:assert/strict";
import test from "node:test";

import { getCareTracking } from "./careTracking.js";
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
    },
  ];
  const maternal = entry(getCareTracking(woman(), records, new Date("2026-09-01")), "maternal");
  assert.equal(maternal.status, "Prenatal");
  assert.ok(maternal.facts.some((f) => f.label === "EDD" && f.value === "2026-12-01"));
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

test("a program with no history and no eligibility is left out entirely", () => {
  const entries = getCareTracking({ sex: "Male", birthdate: "1980-01-01" }, [], new Date("2026-09-01"));
  assert.deepEqual(entries, []);
});

test("TB is absent without history even for an otherwise-eligible patient", () => {
  const entries = getCareTracking(woman(), [], new Date("2026-09-01"));
  assert.equal(entries.find((e) => e.key === "tb"), undefined);
});

test("EPI shows Not started for an eligible child with no records", () => {
  const epi = entry(getCareTracking(child("2025-01-01"), [], new Date("2026-01-01")), "epi");
  assert.equal(epi.status, "Not started");
});
