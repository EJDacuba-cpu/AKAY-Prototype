import assert from "node:assert/strict";
import test from "node:test";

import {
  applicableInfantScheduleLabels,
  isEpiItemAgeApplicable,
  visibleEpiVaccineOptions,
} from "./epiApplicability.js";
import { EPI_INFANT_SCHEDULE } from "./careTrackingConfig.js";

const DOB = "2026-01-01";
function onDate(iso) {
  return new Date(`${iso}T12:00:00`);
}

test("a newborn is offered BCG, HEPA B, Newborn Screening, and CPAB, not 6-week antigens or HPV", () => {
  const visit = onDate("2026-01-01");
  assert.equal(isEpiItemAgeApplicable("BCG", DOB, visit), true);
  assert.equal(isEpiItemAgeApplicable("HEPA B", DOB, visit), true);
  assert.equal(isEpiItemAgeApplicable("Newborn Screening", DOB, visit), true);
  assert.equal(isEpiItemAgeApplicable("CPAB", DOB, visit), true);
  assert.equal(isEpiItemAgeApplicable("OPV 1", DOB, visit), false);
  assert.equal(isEpiItemAgeApplicable("PENTA 1", DOB, visit), false);
  assert.equal(isEpiItemAgeApplicable("IPV 2", DOB, visit), false);
  assert.equal(isEpiItemAgeApplicable("MCV 1", DOB, visit), false);
  assert.equal(isEpiItemAgeApplicable("HPV", DOB, visit), false);
  assert.deepEqual(applicableInfantScheduleLabels(DOB, visit), ["BCG", "HEPA B"]);
});

test("OPV, PENTA, PCV, and IPV 1 become applicable at 6 weeks and stay offered as catch-up", () => {
  assert.equal(isEpiItemAgeApplicable("OPV 1", DOB, onDate("2026-02-11")), false);
  assert.equal(isEpiItemAgeApplicable("OPV 1", DOB, onDate("2026-02-12")), true);
  assert.equal(isEpiItemAgeApplicable("PENTA 3", DOB, onDate("2026-05-01")), true);
  assert.equal(isEpiItemAgeApplicable("PCV 1", DOB, onDate("2027-02-01")), true);
});

test("IPV 2 and MCV 1 wait until 9 completed months; MCV 2 waits until 12", () => {
  assert.equal(isEpiItemAgeApplicable("IPV 2", DOB, onDate("2026-09-30")), false);
  assert.equal(isEpiItemAgeApplicable("IPV 2", DOB, onDate("2026-10-01")), true);
  assert.equal(isEpiItemAgeApplicable("MCV 1", DOB, onDate("2026-10-01")), true);
  assert.equal(isEpiItemAgeApplicable("MCV 2", DOB, onDate("2026-12-31")), false);
  assert.equal(isEpiItemAgeApplicable("MCV 2", DOB, onDate("2027-01-01")), true);
});

test("HPV stays hidden until 9 years", () => {
  assert.equal(isEpiItemAgeApplicable("HPV", DOB, onDate("2034-12-31")), false);
  assert.equal(isEpiItemAgeApplicable("HPV", DOB, onDate("2035-01-01")), true);
});

test("new BCG and HEPA B are not offered after 12 completed months unless already recorded", () => {
  const visit = onDate("2027-02-01");
  assert.equal(isEpiItemAgeApplicable("BCG", DOB, visit), false);
  assert.equal(isEpiItemAgeApplicable("HEPA B", DOB, visit), false);
  assert.deepEqual(
    visibleEpiVaccineOptions(["BCG", "HEPA B", "OPV 1", "HPV"], {
      birthDate: DOB,
      visitDate: visit,
      historyLabels: ["BCG"],
    }),
    ["BCG", "OPV 1"],
  );
});

test("age-applicable infant schedule at 4 months excludes IPV 2, MCV, and HPV", () => {
  const labels = applicableInfantScheduleLabels(DOB, onDate("2026-05-01"));
  assert.ok(labels.includes("OPV 1"));
  assert.ok(labels.includes("IPV 1"));
  assert.equal(labels.includes("IPV 2"), false);
  assert.equal(labels.includes("MCV 1"), false);
  assert.equal(EPI_INFANT_SCHEDULE.includes("HPV"), false);
});

test("missed OPV and PENTA stay offered at 13 months and 5 years; HPV stays hidden until 9", () => {
  const atThirteenMonths = visibleEpiVaccineOptions(
    ["BCG", "OPV 1", "PENTA 1", "HPV"],
    { birthDate: DOB, visitDate: onDate("2027-02-01") },
  );
  assert.deepEqual(atThirteenMonths, ["OPV 1", "PENTA 1"]);
  const atFiveYears = visibleEpiVaccineOptions(
    ["OPV 1", "PENTA 1", "MCV 2", "HPV"],
    { birthDate: DOB, visitDate: onDate("2031-01-01") },
  );
  assert.deepEqual(atFiveYears, ["OPV 1", "PENTA 1", "MCV 2"]);
});
