import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildIncomingReferralMetrics,
  buildPatientVisitMetrics,
  buildRhuReport,
  normalizeRhuReportCategory,
} from "./rhuReporting.js";

const period = {
  start: "2026-11-01",
  end: "2026-11-05",
  label: "Nov 1–5, 2026",
  preset: "custom",
};

function visit(overrides) {
  return {
    id: 1,
    source: "walk_in",
    referral: null,
    checked_in_at: "2026-11-03T02:00:00Z",
    closed_at: null,
    close_reason: null,
    ...overrides,
  };
}

test("normalizeRhuReportCategory defaults missing and unknown to overview", () => {
  assert.equal(normalizeRhuReportCategory(null), "overview");
  assert.equal(normalizeRhuReportCategory("nope"), "overview");
});

test("normalizeRhuReportCategory maps aliases and slugs", () => {
  assert.equal(normalizeRhuReportCategory("all"), "overview");
  assert.equal(normalizeRhuReportCategory("patient-visits"), "patient_visits");
  assert.equal(normalizeRhuReportCategory("referral-reports"), "referrals");
  assert.equal(normalizeRhuReportCategory("family_planning"), "family_planning");
});

test("buildPatientVisitMetrics counts each visit once and excludes mistaken check-ins", () => {
  const metrics = buildPatientVisitMetrics(
    [
      visit({ id: 1, source: "walk_in" }),
      visit({ id: 2, source: "referral" }),
      visit({
        id: 3,
        source: "walk_in",
        referral: { id: 9 },
        close_reason: "consultation_completed",
        closed_at: "2026-11-03T04:00:00Z",
      }),
      visit({ id: 4, close_reason: "checked_in_by_mistake", closed_at: "2026-11-03T03:00:00Z" }),
      visit({ id: 5, checked_in_at: "2026-10-01T02:00:00Z" }),
    ],
    period,
  );
  assert.equal(metrics.total, 3);
  assert.equal(metrics.walkIn, 1);
  assert.equal(metrics.referred, 2);
  assert.equal(metrics.completedConsultations, 1);
});

test("buildPatientVisitMetrics counts repeat patient visits separately", () => {
  const metrics = buildPatientVisitMetrics(
    [
      visit({
        id: 1,
        patient_id: 7,
        checked_in_at: "2026-11-01T02:00:00Z",
        close_reason: "consultation_completed",
        closed_at: "2026-11-01T03:00:00Z",
      }),
      visit({ id: 2, patient_id: 7, checked_in_at: "2026-11-04T02:00:00Z" }),
    ],
    period,
  );
  assert.equal(metrics.total, 2);
  assert.equal(metrics.completedConsultations, 1);
});

test("buildIncomingReferralMetrics counts submitted referrals, distinct BHCs, and completed cases without patient rows", () => {
  const metrics = buildIncomingReferralMetrics(
    [
      {
        id: 1,
        date: "2026-11-02",
        status: "Completed",
        barangay_health_center: "BHC San Jose",
        patient_name: "Secret",
      },
      {
        id: 2,
        date: "2026-11-03",
        status: "Pending",
        barangay_health_center: "BHC San Jose",
      },
      {
        id: 3,
        date: "2026-11-03",
        status: "Received",
        barangay_health_center: "BHC Mabini",
      },
      {
        id: 4,
        date: "2026-10-01",
        status: "Completed",
        barangay_health_center: "BHC Old",
      },
    ],
    period,
  );
  assert.equal(metrics.total, 3);
  assert.equal(metrics.referringBhcs, 2);
  assert.equal(metrics.completedCases, 1);
  assert.doesNotMatch(JSON.stringify(metrics), /Secret/);
  const sanJose = metrics.bySource.find((row) => row.label === "BHC San Jose");
  assert.ok(sanJose);
  assert.equal(sanJose.value, 2);
  assert.equal(sanJose.completed, 1);
});

test("overview does not sum visits, referrals, and records into one total", () => {
  const report = buildRhuReport({
    visits: [visit({ id: 1 })],
    referrals: [
      {
        id: 1,
        date: "2026-11-02",
        status: "Pending",
        barangay_health_center: "BHC A",
        patient_name: "Secret",
      },
    ],
    records: [{ id: 1, consultation_date: "2026-11-02" }],
    patients: [{ id: 1 }],
    category: "overview",
    period,
  });
  const values = report.cards.map((card) => card.value);
  assert.equal(values.includes(3), false);
  assert.equal(report.category, "overview");
  assert.equal(report.categoryLabel, "Overview");
  assert.equal(report.cards.find((card) => card.key === "total_visits").value, 1);
  assert.equal(report.cards.find((card) => card.key === "referrals_submitted").value, 1);
  assert.equal(report.cards.find((card) => card.key === "completed_consultations").value, 0);
  assert.equal(report.cards.find((card) => card.key === "referring_bhcs").value, 1);
  assert.equal(report.cards.some((card) => card.key === "epi-doses"), false);
  assert.equal(report.summary.length, 3);
  assert.deepEqual(
    report.summary.map((row) => row.label),
    ["Total Visits", "Referrals Submitted", "Completed Consultations"],
  );
  assert.equal(report.printRows, report.summary);
  assert.ok(report.charts.some((chart) => chart.title === "Walk-in vs referred"));
  assert.ok(report.charts.some((chart) => chart.kind === "area"));
  assert.ok(report.charts.some((chart) => chart.title === "Referrals by Barangay / BHC"));
  assert.doesNotMatch(JSON.stringify(report), /Secret/);
});

test("overview ignores out-of-period rows; facility isolation stays on the API", () => {
  // Visit and referral payloads have no facility id. The client filters by period and category only.
  const report = buildRhuReport({
    visits: [
      visit({ id: 1 }),
      visit({ id: 2, checked_in_at: "2026-10-01T02:00:00Z" }),
    ],
    referrals: [
      { id: 1, date: "2026-11-02", status: "Pending", barangay_health_center: "BHC A" },
      { id: 2, referralDateTime: "2026-10-15", status: "Completed", barangay_health_center: "BHC Old" },
    ],
    records: [],
    patients: [],
    category: "overview",
    period,
  });
  assert.equal(report.cards.find((card) => card.key === "total_visits").value, 1);
  assert.equal(report.cards.find((card) => card.key === "referrals_submitted").value, 1);
  assert.equal(report.period, period);

  const epi = buildRhuReport({
    visits: [visit({ id: 1, close_reason: "consultation_completed" })],
    referrals: [{ id: 1, date: "2026-11-02", status: "Pending", barangay_health_center: "BHC A" }],
    records: [],
    patients: [],
    category: "epi",
    period,
  });
  assert.equal(epi.category, "epi");
  assert.equal(epi.cards.some((card) => card.key === "total_visits"), false);
});

test("patient_visits view uses visit metrics and leaves referrals out", () => {
  const report = buildRhuReport({
    visits: [
      visit({ id: 1, source: "walk_in" }),
      visit({
        id: 2,
        source: "referral",
        close_reason: "consultation_completed",
        closed_at: "2026-11-03T04:00:00Z",
      }),
      visit({ id: 3, close_reason: "checked_in_by_mistake", closed_at: "2026-11-03T03:00:00Z" }),
    ],
    referrals: [
      {
        id: 1,
        date: "2026-11-02",
        status: "Completed",
        barangay_health_center: "BHC A",
        patient_name: "Secret",
      },
    ],
    records: [],
    patients: [],
    category: "patient-visits",
    period,
  });
  assert.equal(report.category, "patient_visits");
  assert.equal(report.categoryLabel, "Patient Visits");
  assert.equal(report.cards.find((card) => card.key === "total_visits").value, 2);
  assert.equal(report.cards.find((card) => card.key === "walk_in").value, 1);
  assert.equal(report.cards.find((card) => card.key === "referred").value, 1);
  assert.equal(report.cards.find((card) => card.key === "completed_consultations").value, 1);
  assert.equal(report.cards.find((card) => card.key === "referrals_submitted"), undefined);
  assert.equal(report.charts[0].kind, "area");
  assert.equal(report.charts[1].title, "Walk-in vs referred");
  assert.equal(report.summary.find((row) => row.label === "Total visits").value, 2);
  assert.equal(report.empty, false);
  assert.doesNotMatch(JSON.stringify(report), /Secret/);
});

test("referrals view uses incoming aggregates without status or patient rows", () => {
  const report = buildRhuReport({
    visits: [visit({ id: 1, close_reason: "consultation_completed" })],
    referrals: [
      {
        id: 1,
        date: "2026-11-02",
        status: "Completed",
        barangay_health_center: "BHC San Jose",
        patient_name: "Secret",
      },
      {
        id: 2,
        referralDateTime: "2026-11-03T01:00:00Z",
        status: "Pending",
        barangay_health_center: "BHC Mabini",
      },
    ],
    records: [],
    patients: [],
    category: "referrals",
    period,
  });
  assert.equal(report.category, "referrals");
  assert.equal(report.categoryLabel, "Referral Reports");
  assert.equal(report.cards.find((card) => card.key === "total_referrals").value, 2);
  assert.equal(report.cards.find((card) => card.key === "referring_bhcs").value, 2);
  assert.equal(report.cards.find((card) => card.key === "completed_cases").value, 1);
  assert.equal(
    report.cards.some((card) => /pending|received|no-show/i.test(`${card.key} ${card.label}`)),
    false,
  );
  assert.equal(report.cards.find((card) => card.key === "total_visits"), undefined);
  assert.equal(report.charts[0].title, "Referrals by Barangay / BHC");
  assert.equal(report.summary.find((row) => row.label === "BHC San Jose").value, 1);
  assert.doesNotMatch(JSON.stringify(report), /Secret/);
});

test("shows empty clinical state when RHU has no matching records", () => {
  const report = buildRhuReport({
    visits: [visit({ id: 1 })],
    patients: [],
    records: [],
    referrals: [{ id: 1, date: "2026-11-02", status: "Pending", barangay_health_center: "BHC A" }],
    category: "epi",
    period,
  });
  assert.equal(report.empty, true);
  assert.equal(report.category, "epi");
  assert.equal(report.categoryLabel, "EPI / Immunization");
  assert.ok(report.cards.every((card) => card.value === 0));
  assert.ok(report.summary.every((row) => !Number(row.value)));
  assert.equal(report.printRows, report.summary);
});

test("clinical categories reuse BHC counts and RHU labels without incoming referrals", () => {
  const epi = buildRhuReport({
    visits: [visit({ id: 1 })],
    referrals: [
      {
        id: 9,
        date: "2026-11-02",
        status: "Completed",
        barangay_health_center: "BHC A",
        patient_name: "Secret",
      },
    ],
    patients: [],
    records: [
      {
        selectedPrograms: ["EPI"],
        patientId: "p1",
        immunizationData: {
          vaccineEntries: [{ vaccineName: "BCG", dateGiven: "2026-11-02" }],
        },
      },
    ],
    category: "epi",
    period,
  });
  assert.equal(epi.empty, false);
  assert.equal(epi.cards.find((card) => card.key === "doses").value, 1);
  assert.equal(epi.cards.find((card) => card.key === "referrals"), undefined);
  assert.doesNotMatch(JSON.stringify(epi), /Secret/);

  const surveillance = buildRhuReport({
    visits: [],
    patients: [],
    records: [],
    referrals: [],
    category: "surveillance",
    period,
  });
  assert.equal(surveillance.category, "surveillance");
  assert.equal(surveillance.categoryLabel, "Surveillance");
  assert.equal(surveillance.empty, true);
});

test("nutrition view keeps the requested age group", () => {
  const report = buildRhuReport({
    visits: [],
    patients: [],
    records: [],
    referrals: [],
    category: "nutrition",
    period,
    ageGroup: "20+",
  });
  assert.equal(report.category, "nutrition");
  assert.equal(report.categoryLabel, "Nutrition");
  assert.equal(report.ageGroup, "20+");
  assert.equal(report.empty, true);
  assert.ok(report.notes.length > 0);
});

test("empty period keeps cards, summary, and print rows at zero", () => {
  const emptyPeriod = {
    start: "2026-01-01",
    end: "2026-01-07",
    label: "Jan 1–7, 2026",
    preset: "custom",
  };
  const outside = {
    visits: [
      visit({
        id: 1,
        close_reason: "consultation_completed",
        closed_at: "2026-11-03T04:00:00Z",
      }),
    ],
    referrals: [
      {
        id: 1,
        date: "2026-11-02",
        status: "Completed",
        barangay_health_center: "BHC A",
        patient_name: "Secret",
      },
    ],
    records: [
      {
        selectedPrograms: ["EPI"],
        patientId: "p1",
        immunizationData: {
          vaccineEntries: [{ vaccineName: "BCG", dateGiven: "2026-11-02" }],
        },
      },
    ],
    patients: [{ id: "p1" }],
  };

  for (const category of ["overview", "patient_visits", "referrals", "epi"]) {
    const report = buildRhuReport({ ...outside, category, period: emptyPeriod });
    assert.equal(report.empty, true, category);
    assert.equal(report.period.label, emptyPeriod.label, category);
    assert.ok(report.cards.length > 0, category);
    assert.ok(report.cards.every((card) => card.value === 0), category);
    assert.ok(report.summary.every((row) => Number(row.value) === 0), category);
    assert.equal(report.printRows, report.summary, category);
    assert.ok(
      report.charts.every((chart) => chart.periodLabel === emptyPeriod.label),
      category,
    );
    assert.doesNotMatch(JSON.stringify(report.summary), /Secret|BHC A/, category);
  }
});

test("applied period label stays on the report for subtitle and print", () => {
  for (const category of ["overview", "patient-visits", "referrals", "maternal"]) {
    const report = buildRhuReport({
      visits: [visit({ id: 1 })],
      referrals: [],
      records: [],
      patients: [],
      category,
      period,
    });
    assert.equal(report.period, period, category);
    assert.equal(report.period.label, "Nov 1–5, 2026", category);
    assert.ok(
      report.charts.every((chart) => chart.periodLabel === period.label),
      category,
    );
  }
});

test("buildIncomingReferralMetrics excludes referrals with only raw referral_date (not normalized cohort fields)", () => {
  const metrics = buildIncomingReferralMetrics(
    [
      {
        id: 99,
        referral_date: "2026-11-03",
        status: "Completed",
        barangay_health_center: "BHC Raw Only",
      },
    ],
    period,
  );
  assert.equal(metrics.total, 0);
  assert.equal(metrics.referringBhcs, 0);
  assert.equal(metrics.completedCases, 0);
});
