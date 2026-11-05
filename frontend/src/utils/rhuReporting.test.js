import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRhuReportCategory } from "./rhuReporting.js";

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
