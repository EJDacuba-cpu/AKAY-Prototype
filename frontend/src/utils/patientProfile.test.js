import assert from "node:assert/strict";
import test from "node:test";
import {
  createPatientForm,
  formatShortDate,
  getEffectiveFollowUpState,
  getPatientAge,
  getPatientValue,
  getSectionErrors,
  getTodayIsoDate,
  groupFollowUpsByStatus,
  mergeBackgroundSection,
  orderFollowUps,
  validatePatientForm,
} from "./patientProfile.js";

const validAdult = {
  firstName: "Ana",
  lastName: "Cruz",
  birthDate: "1990-01-01",
  sex: "Female",
  civilStatus: "Single",
  streetAddress: "1 Main St",
  barangay: "Perez",
  municipality: "Bulakan",
  philHealthStatus: "No PhilHealth",
};

test("a complete adult registration has no errors", () => {
  assert.deepEqual(validatePatientForm(validAdult, "2026-09-26"), {});
});

test("required fields and the future birth date are reported", () => {
  const errors = validatePatientForm({ ...validAdult, firstName: " ", birthDate: "2030-01-01", barangay: "" }, "2026-09-26");
  assert.equal(errors.firstName, "First name is required.");
  assert.equal(errors.birthDate, "Date of Birth cannot be in the future.");
  assert.equal(errors.barangay, "Barangay is required.");
});

test("a child needs a mother name but not a civil status under one year", () => {
  // Relative to now: age is computed against the real clock.
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const infant = { ...validAdult, birthDate: getTodayIsoDate(threeMonthsAgo), civilStatus: "" };
  const errors = validatePatientForm(infant, getTodayIsoDate());
  assert.equal(errors.civilStatus, undefined);
  assert.equal(errors.motherName, "Mother name is required.");
});

test("PhilHealth number is required only with PhilHealth", () => {
  const errors = validatePatientForm({ ...validAdult, philHealthStatus: "With PhilHealth" }, "2026-09-26");
  assert.equal(errors.philHealthNumber, "PhilHealth number is required if marked with PhilHealth.");
});

test("saving one section ignores errors that belong to another", () => {
  const errors = validatePatientForm({ ...validAdult, barangay: "", civilStatus: "" }, "2026-09-26");
  assert.deepEqual(Object.keys(getSectionErrors(errors, "demographics")), ["civilStatus"]);
  assert.deepEqual(Object.keys(getSectionErrors(errors, "contact")), ["barangay"]);
  assert.deepEqual(getSectionErrors(errors, "family"), {});
  assert.deepEqual(getSectionErrors(errors, "unknown"), {});
});

test("the form reads alias keys and defaults the municipality", () => {
  const form = createPatientForm({ first_name: "Ana", contact: "+639171234567", purok: "3" });
  assert.equal(form.firstName, "Ana");
  assert.equal(form.contactNumber, "+639171234567");
  assert.equal(form.purokArea, "3");
  assert.equal(form.municipality, "Bulakan");
  assert.equal(getPatientValue({}, ["x"]), "Not recorded");
});

test("saving one background section keeps the other sections' latest data", () => {
  const latest = {
    currentDiseases: [{ name: "Asthma" }],
    allergies: "Penicillin",
    hospitalizations: "",
    surgeries: "",
    familyHistory: { similarIllness: "latest family", chronicIllness: "", hereditaryIllness: "" },
    personalSocial: { diet: "latest diet", smoking: "", alcohol: "", notes: "" },
    updatedAt: { medical: "2026-01-01", family: "2026-02-02", social: "2026-03-03" },
  };
  // The medical editor started from a stale copy of the other sections.
  const edited = {
    currentDiseases: [{ name: "Asthma" }, { name: "Hypertension" }],
    allergies: "Penicillin",
    hospitalizations: "",
    surgeries: "None",
    familyHistory: { similarIllness: "STALE", chronicIllness: "", hereditaryIllness: "" },
    personalSocial: { diet: "STALE", smoking: "", alcohol: "", notes: "" },
    updatedAt: { medical: "2026-09-26", family: "1999-01-01", social: "1999-01-01" },
  };
  const merged = mergeBackgroundSection(latest, edited, "medical");
  assert.equal(merged.currentDiseases.length, 2);
  assert.equal(merged.surgeries, "None");
  assert.equal(merged.familyHistory.similarIllness, "latest family");
  assert.equal(merged.personalSocial.diet, "latest diet");
  assert.deepEqual(merged.updatedAt, { medical: "2026-09-26", family: "2026-02-02", social: "2026-03-03" });
  assert.equal(mergeBackgroundSection(latest, edited, "family").familyHistory.similarIllness, "STALE");
  assert.equal(mergeBackgroundSection(latest, edited, "social").personalSocial.diet, "STALE");
});

test("overdue pending follow-ups read as no-show and resolved ones stay resolved", () => {
  const today = "2026-09-26";
  assert.equal(getEffectiveFollowUpState({ dueDate: "2026-09-26" }, today), "due_today");
  assert.equal(getEffectiveFollowUpState({ dueDate: "2026-09-20" }, today), "no_show");
  assert.equal(getEffectiveFollowUpState({ dueDate: "2026-10-01", state: "rescheduled" }, today), "rescheduled");
  assert.equal(getEffectiveFollowUpState({ dueDate: "2026-09-20", state: "fulfilled" }, today), "fulfilled");
  assert.equal(getEffectiveFollowUpState({}, today), "upcoming");
});

test("follow-ups list open work soonest-first, then resolved newest-first", () => {
  const today = "2026-09-26";
  const { ordered, open } = orderFollowUps([
    { id: "old-done", dueDate: "2026-08-01", state: "fulfilled" },
    { id: "later", dueDate: "2026-10-10" },
    { id: "newer-done", dueDate: "2026-09-01", state: "fulfilled" },
    { id: "soon", dueDate: "2026-09-28" },
  ], today);
  assert.deepEqual(ordered.map((task) => task.id), ["soon", "later", "newer-done", "old-done"]);
  assert.deepEqual(open.map((task) => task.id), ["soon", "later"]);
  assert.equal(ordered[0].effectiveState, "upcoming");
});

test("short dates are compact and tolerate bad input", () => {
  assert.equal(formatShortDate("2026-09-26"), "Sep 26, 2026");
  assert.equal(formatShortDate("2026-09-26T09:00:00+08:00"), "Sep 26, 2026");
  assert.equal(formatShortDate("", "-"), "-");
  assert.equal(formatShortDate("not a date"), "Not recorded");
});

test("age falls back to the birth date when the row carries none", () => {
  assert.equal(getPatientAge({ age: 30 }), 30);
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  tenYearsAgo.setDate(tenYearsAgo.getDate() - 2);
  assert.equal(getPatientAge({ birthDate: getTodayIsoDate(tenYearsAgo) }), 10);
  assert.equal(getPatientAge({}), "");
});

test("follow-ups group into overdue, pending, completed and cancelled", () => {
  const { ordered } = orderFollowUps(
    [
      { id: 1, state: "pending", dueDate: "2026-09-01" },
      { id: 2, state: "pending", dueDate: "2026-09-27" },
      { id: 3, state: "rescheduled", dueDate: "2026-10-05" },
      { id: 4, state: "fulfilled", dueDate: "2026-08-01" },
      { id: 5, state: "cancelled", dueDate: "2026-08-02" },
      { id: 6, state: "no_show", dueDate: "2026-09-10" },
    ],
    "2026-09-27",
  );
  const ids = Object.fromEntries(
    groupFollowUpsByStatus(ordered).map((group) => [group.key, group.items.map((task) => task.id)]),
  );
  assert.deepEqual(ids, {
    overdue: [1, 6],
    pending: [2, 3],
    completed: [4],
    cancelled: [5],
  });
});
