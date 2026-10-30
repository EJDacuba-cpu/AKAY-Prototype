import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBhcReport,
  isDateInReportPeriod,
  normalizeReportCategory,
  resolveReportPeriod,
} from "./bhcReporting.js";

const NOW = new Date("2026-10-15T12:00:00");

function period(preset = "monthly", from = "", to = "") {
  return resolveReportPeriod({ preset, from, to, now: NOW });
}

function report(source, category = "all", preset = "monthly") {
  return buildBhcReport({
    ...source,
    category,
    period: period(preset, source.from, source.to),
  });
}

test("normalizeReportCategory maps legacy slugs and defaults to all", () => {
  assert.equal(normalizeReportCategory("epi-target-client-list"), "epi");
  assert.equal(normalizeReportCategory("community-based-surveillance"), "surveillance");
  assert.equal(normalizeReportCategory("follow-ups"), "all");
  assert.equal(normalizeReportCategory(""), "all");
});

test("monthly period is the current month through today", () => {
  const resolved = period("monthly");
  assert.equal(resolved.start, "2026-10-01");
  assert.equal(resolved.end, "2026-10-15");
  assert.equal(resolved.label, "October 2026");
});

test("weekly period starts on Sunday and ends today", () => {
  const resolved = period("weekly");
  assert.equal(resolved.start, "2026-10-11");
  assert.equal(resolved.end, "2026-10-15");
});

test("custom period requires dates and does not invent values", () => {
  const resolved = resolveReportPeriod({ preset: "custom", from: "2026-09-01", to: "2026-09-30", now: NOW });
  assert.equal(resolved.start, "2026-09-01");
  assert.equal(resolved.end, "2026-09-30");
  assert.equal(isDateInReportPeriod("2026-09-15", resolved), true);
  assert.equal(isDateInReportPeriod("2026-10-01", resolved), false);
  assert.equal(isDateInReportPeriod("", resolved), false);
});

test("EPI counts dated doses, not children, and skips undated or non-dose rows", () => {
  const records = [
    epiRecord("1", [
      { vaccineName: "BCG", dateGiven: "2026-10-02" },
      { vaccineName: "HEPA B", dateGiven: "2026-10-02" },
      { vaccineName: "CPAB", dateGiven: "2026-10-02" },
      { vaccineName: "OPV 1", dateGiven: "2026-09-20" },
      { vaccineName: "PCV 1", dateGiven: "" },
    ]),
    epiRecord("1", [{ vaccineName: "OPV 1", dateGiven: "2026-10-08" }]),
  ];
  const result = report({ records }, "epi");
  assert.equal(cardValue(result, "doses"), 3);
  assert.equal(cardValue(result, "vaccines"), 3);
  assert.equal(summaryValue(result, "BCG"), 1);
  assert.equal(summaryValue(result, "HEPA B"), 1);
  assert.equal(summaryValue(result, "OPV 1"), 1);
});

test("maternal active enrollments use period-end status, not today's later delivery", () => {
  const patients = [{ id: "p1" }, { id: "p2" }];
  const records = [
    maternalRecord("p1", "2026-10-03"),
    maternalRecord("p2", "2026-09-10"),
    maternalRecord("p2", "2026-10-12"),
    maternalRecord("p3", "2026-11-01"),
  ];
  const result = report({ patients, records }, "maternal");
  assert.equal(cardValue(result, "consults"), 2);
  assert.equal(cardValue(result, "new"), 1);
  assert.equal(cardValue(result, "active"), 2);
});

test("family planning separates new acceptors from service counts and groups methods", () => {
  const records = [
    fpRecord("2026-10-04", "NA — New Acceptors", "Pills-COC — Combined Oral Contraceptives"),
    fpRecord("2026-10-06", "CU — Current Users", "CON — Condom"),
    fpRecord("2026-10-08", "CU — Current Users", "Pills-POP — Progestin Only Pills"),
    fpRecord("2026-09-02", "NA — New Acceptors", "CON — Condom"),
  ];
  const result = report({ records }, "family_planning");
  assert.equal(cardValue(result, "services"), 3);
  assert.equal(cardValue(result, "new"), 1);
  assert.equal(summaryValue(result, "Pills"), 2);
  assert.equal(summaryValue(result, "Condom"), 1);
});

test("morbidity and notifiable stay on their own diagnoses and ignore RHU findings", () => {
  const records = [
    {
      selectedPrograms: [],
      dateOfVisit: "2026-10-05",
      diagnoses: [
        { name: "Asthma", reportIn: ["morbidity"] },
        { name: "Dengue fever", reportIn: ["notifiable"] },
      ],
    },
    {
      dateOfVisit: "2026-10-06",
      diagnosis: "Cough",
      monitoring_data: { morbidityReportingStatus: "morbidity" },
    },
  ];
  const referrals = [
    {
      date: "2026-10-05",
      status: "Completed",
      feedback: { rhuDiagnosis: "Pneumonia" },
    },
  ];
  const morbidity = report({ records, referrals }, "morbidity");
  const notifiable = report({ records, referrals }, "notifiable");
  assert.equal(cardValue(morbidity, "count"), 2);
  assert.equal(summaryValue(morbidity, "Asthma"), 1);
  assert.equal(summaryValue(morbidity, "Cough"), 1);
  assert.equal(cardValue(notifiable, "count"), 1);
  assert.equal(summaryValue(notifiable, "Dengue fever"), 1);
  assert.equal(morbidity.summary.some((row) => row.label === "Pneumonia"), false);
});

test("surveillance counts activity and distinct areas without patient tables", () => {
  const records = [
    {
      dateOfVisit: "2026-10-03",
      diagnoses: [{ name: "HFMD", reportIn: ["surveillance"] }],
      patient: { purokArea: "Sitio Norte", barangay: "San Jose" },
    },
    {
      dateOfVisit: "2026-10-09",
      diagnoses: [{ name: "HFMD", reportIn: ["surveillance"] }],
      patient: { purokArea: "Sitio Norte", barangay: "San Jose" },
    },
    {
      dateOfVisit: "2026-10-09",
      diagnoses: [{ name: "Acute watery diarrhea", reportIn: ["surveillance"] }],
      barangay: "San Jose",
    },
  ];
  const result = report({ records }, "surveillance");
  assert.equal(cardValue(result, "entries"), 3);
  assert.equal(cardValue(result, "areas"), 2);
  assert.equal(cardValue(result, "diseases"), 2);
});

test("referrals keep RHU-confirmed outcomes separate from sent totals", () => {
  const referrals = [
    { date: "2026-10-02", status: "Pending" },
    { date: "2026-10-03", status: "Received" },
    { date: "2026-10-04", status: "Completed", feedback: { rhuDiagnosis: "Hypertension", created_at: "2026-10-06" } },
    { date: "2026-10-07", status: "No-Show" },
    { date: "2026-09-12", status: "Completed", feedback: { rhuDiagnosis: "Old finding" } },
  ];
  const result = report({ referrals }, "referrals");
  assert.equal(cardValue(result, "sent"), 4);
  assert.equal(cardValue(result, "pending"), 1);
  assert.equal(cardValue(result, "received"), 1);
  assert.equal(cardValue(result, "completed"), 1);
  assert.equal(cardValue(result, "noshow"), 1);
  assert.equal(cardValue(result, "confirmed"), 1);
});

test("All Categories does not sum mixed units into one total", () => {
  const result = report({
    records: [
      epiRecord("1", [{ vaccineName: "BCG", dateGiven: "2026-10-02" }]),
      maternalRecord("p1", "2026-10-03"),
      fpRecord("2026-10-04", "NA — New Acceptors", "CON — Condom"),
    ],
    referrals: [{ date: "2026-10-05", status: "Pending" }],
  }, "all");
  const values = result.cards.map((item) => item.value);
  assert.equal(cardValue(result, "epi-doses"), 1);
  assert.equal(cardValue(result, "fp-services"), 1);
  assert.equal(cardValue(result, "referrals"), 1);
  assert.equal(values.reduce((sum, value) => sum + value, 0) === 1, false);
  assert.equal(result.summary.some((row) => /RHU-confirmed/.test(row.label)), true);
});

test("empty persisted data stays zero rather than placeholder figures", () => {
  const result = report({ patients: [], records: [], referrals: [] }, "all");
  assert.equal(result.empty, true);
  assert.ok(result.cards.every((item) => item.value === 0));
});

function cardValue(result, key) {
  return result.cards.find((item) => item.key === key)?.value;
}

function summaryValue(result, label) {
  return result.summary.find((item) => item.label === label)?.value;
}

function epiRecord(patientId, vaccineEntries) {
  return { selectedPrograms: ["EPI"], patientId, immunizationData: { vaccineEntries } };
}

function maternalRecord(patientId, date) {
  return { selectedPrograms: ["Maternal"], patientId, dateOfVisit: date, maternalData: {} };
}

function fpRecord(date, clientType, methodUsed) {
  return {
    selectedPrograms: ["Family Planning"],
    dateOfVisit: date,
    familyPlanningData: { clientType, methodUsed },
  };
}
