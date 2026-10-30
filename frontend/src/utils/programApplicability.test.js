import assert from "node:assert/strict";
import test from "node:test";

import {
  getConditionalProgramTabs,
  isPediatricApplicable,
  isWomensHealthApplicable,
} from "./programApplicability.js";

function birthdateForAge(age) {
  const today = new Date();
  return new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
    .toISOString()
    .slice(0, 10);
}

const maternalRecord = { category: "Maternal / Prenatal" };
const familyPlanningRecord = { category: "Family Planning" };
const epiRecord = { category: "Child Health / EPI" };
const generalRecord = { category: "General Consultation" };

function tabKeys(patient, records) {
  return getConditionalProgramTabs(patient, records).map((tab) => tab.key);
}

test("women's health applies to a non-male patient of reproductive age", () => {
  assert.equal(
    isWomensHealthApplicable({ sex: "Female", birthdate: birthdateForAge(28) }),
    true,
  );
});

test("women's health does not apply to a male patient", () => {
  assert.equal(
    isWomensHealthApplicable({ sex: "Male", birthdate: birthdateForAge(28) }),
    false,
  );
});

test("women's health does not apply below the service age", () => {
  assert.equal(
    isWomensHealthApplicable({ sex: "Female", birthdate: birthdateForAge(6) }),
    false,
  );
});

/** Sex alone must never be enough - an unknown age cannot open the window. */
test("women's health does not apply on sex alone when age is unknown", () => {
  assert.equal(isWomensHealthApplicable({ sex: "Female" }), false);
  assert.deepEqual(tabKeys({ sex: "Female" }, []), []);
});

test("pediatric applies below the adult immunization boundary only", () => {
  assert.equal(isPediatricApplicable({ birthdate: birthdateForAge(4) }), true);
  assert.equal(isPediatricApplicable({ birthdate: birthdateForAge(17) }), true);
  assert.equal(isPediatricApplicable({ birthdate: birthdateForAge(18) }), false);
  assert.equal(isPediatricApplicable({}), false);
});

test("an applicable patient gets the tab with no records at all", () => {
  const patient = { sex: "Female", birthdate: birthdateForAge(30) };
  assert.deepEqual(tabKeys(patient, [generalRecord]), ["womensHealth"]);
});

/**
 * Women's health has no upper age bound on purpose: family planning has none
 * in this app's own eligibility rule, so adding one here would disagree with
 * the record form about who is eligible. Prenatal's narrower window stays in
 * the form, where a specific program is chosen.
 */
test("women's health stays applicable past reproductive age", () => {
  assert.equal(
    isWomensHealthApplicable({ sex: "Female", birthdate: birthdateForAge(74) }),
    true,
  );
});

/**
 * The rule that matters most: history outlives eligibility. A patient outside
 * the window keeps the chart documenting the care they received, flagged so
 * the UI can say why it is still there.
 */
test("history keeps women's health visible for a non-applicable patient", () => {
  const patient = { sex: "Male", birthdate: birthdateForAge(40) };
  const [tab] = getConditionalProgramTabs(patient, [maternalRecord]);

  assert.equal(tab.key, "womensHealth");
  assert.equal(tab.applicable, false);
  assert.equal(tab.hasHistory, true);
  assert.equal(tab.historyOnly, true);
  assert.equal(tab.recordCount, 1);
});

test("history keeps pediatric visible after the patient ages out", () => {
  const patient = { sex: "Male", birthdate: birthdateForAge(34) };
  const [tab] = getConditionalProgramTabs(patient, [epiRecord]);

  assert.equal(tab.key, "pediatric");
  assert.equal(tab.applicable, false);
  assert.equal(tab.historyOnly, true);
});

test("family planning history alone opens women's health for a male patient", () => {
  const patient = { sex: "Male", birthdate: birthdateForAge(40) };
  assert.deepEqual(tabKeys(patient, [familyPlanningRecord]), ["womensHealth"]);
});

test("both areas can be visible at once and count their own records", () => {
  const patient = { sex: "Female", birthdate: birthdateForAge(16) };
  const tabs = getConditionalProgramTabs(patient, [
    maternalRecord,
    familyPlanningRecord,
    epiRecord,
    generalRecord,
  ]);

  assert.deepEqual(
    tabs.map((tab) => [tab.key, tab.recordCount]),
    [
      ["womensHealth", 2],
      ["pediatric", 1],
    ],
  );
});

test("a patient with neither eligibility nor history gets no program tabs", () => {
  const patient = { sex: "Male", birthdate: birthdateForAge(45) };
  assert.deepEqual(tabKeys(patient, [generalRecord]), []);
});
