import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MORBIDITY_FILTER_OPTIONS,
  normalizeMorbidityFilter,
  normalizeReportNav,
  normalizeTclProgram,
  REPORT_SIDEBAR_ITEMS,
  resolveReportEngineCategory,
  seedReportFiltersFromType,
  TCL_PROGRAM_OPTIONS,
} from "./reportNavigation.js";

test("sidebar items are Referrals, Overview, TCL, Morbidity in order", () => {
  assert.deepEqual(
    REPORT_SIDEBAR_ITEMS.map((item) => item.label),
    ["Referrals", "Overview", "TCL", "Morbidity"],
  );
  assert.deepEqual(
    REPORT_SIDEBAR_ITEMS.map((item) => item.slug),
    ["referrals", "overview", "tcl", "morbidity"],
  );
});

test("normalizeReportNav maps legacy types onto the four nav keys", () => {
  assert.equal(normalizeReportNav(""), "overview");
  assert.equal(normalizeReportNav("all"), "overview");
  assert.equal(normalizeReportNav("epi"), "tcl");
  assert.equal(normalizeReportNav("family-planning"), "tcl");
  assert.equal(normalizeReportNav("notifiable-diseases"), "morbidity");
  assert.equal(normalizeReportNav("community-based-surveillance"), "morbidity");
  assert.equal(normalizeReportNav("referral-reports"), "referrals");
  assert.equal(normalizeReportNav("patient-visits"), "overview");
});

test("seedReportFiltersFromType picks TCL program and morbidity destination from aliases", () => {
  assert.deepEqual(seedReportFiltersFromType("epi-target-client-list"), {
    nav: "tcl",
    tclProgram: "epi",
    morbidityFilter: "morbidity",
  });
  assert.deepEqual(seedReportFiltersFromType("nutrition"), {
    nav: "tcl",
    tclProgram: "nutrition",
    morbidityFilter: "morbidity",
  });
  assert.deepEqual(seedReportFiltersFromType("notifiable"), {
    nav: "morbidity",
    tclProgram: "epi",
    morbidityFilter: "notifiable",
  });
  assert.deepEqual(seedReportFiltersFromType("surveillance"), {
    nav: "morbidity",
    tclProgram: "epi",
    morbidityFilter: "surveillance",
  });
  assert.deepEqual(seedReportFiltersFromType("morbidity"), {
    nav: "morbidity",
    tclProgram: "epi",
    morbidityFilter: "morbidity",
  });
});

test("resolveReportEngineCategory maps nav+filter to existing engines", () => {
  assert.equal(resolveReportEngineCategory("overview", {}, "bhc"), "all");
  assert.equal(resolveReportEngineCategory("overview", {}, "rhu"), "overview");
  assert.equal(resolveReportEngineCategory("patient-visits", {}, "rhu"), "patient_visits");
  assert.equal(
    resolveReportEngineCategory("tcl", { nav: "tcl", tclProgram: "maternal" }, "bhc"),
    "maternal",
  );
  assert.equal(
    resolveReportEngineCategory("morbidity", { nav: "morbidity", morbidityFilter: "notifiable" }, "rhu"),
    "notifiable",
  );
  assert.equal(resolveReportEngineCategory("epi", {}, "bhc"), "epi");
  assert.equal(normalizeTclProgram("family-planning"), "family_planning");
  assert.equal(normalizeMorbidityFilter("all-morbidity"), "morbidity");
  assert.equal(TCL_PROGRAM_OPTIONS[0].key, "epi");
  assert.equal(MORBIDITY_FILTER_OPTIONS[0].label, "All Morbidity");
});
