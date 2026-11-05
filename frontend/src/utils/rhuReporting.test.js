import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildIncomingReferralMetrics,
  buildPatientVisitMetrics,
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
