import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBackground } from "./backgroundUpdate.js";
import {
  BACKGROUND_SAVED_TITLE,
  backgroundSaveErrorLines,
  backgroundSavedFeedback,
  canUpdateBackground,
  consultationBannerVisible,
  historyReferenceSections,
  isSectionEditDirty,
  omitHiddenSocialFromUpdate,
  resolveSectionConflict,
  sectionConflict,
  sectionSavePayload,
  shouldBlockBackgroundLeave,
  startSectionEdit,
  updateSectionEdit,
} from "./backgroundEditing.js";

const background = normalizeBackground({
  currentDiseases: [{ name: "Asthma", yearDiagnosed: 2019, diagnosedWhere: "RHU", note: "" }],
  allergies: { noneKnown: false, items: [{ allergen: "Penicillin", reaction: "Rash" }] },
  hospitalizations: { none: true, items: [] },
  familyHistory: { noneKnown: false, items: [{ condition: "Hypertension", kind: "Chronic", relation: "Mother" }] },
  personalSocial: {
    education: { level: "High School", completed: "Graduate" },
    pastOccupations: "Farmer",
    smoking: { status: "former", sticksPerDay: 5, years: 10, quitYear: 2020 },
    alcohol: { status: "never" },
    diet: { highSalt: true },
    sexual: { active: "yes" },
    environment: { waterSource: "Level III", toilet: "Water-sealed", exposures: [], notes: "" },
  },
  obstetric: { menarcheAge: 12, menstrualStatus: "menstruating" },
  revisions: { medical: 3, family: 1, social: 7, obstetric: 2 },
});

test("starting an edit captures the section's revision and a copy of its values", () => {
  const edit = startSectionEdit(background, "social");
  assert.equal(edit.section, "social");
  assert.equal(edit.baseRevision, 7);
  assert.equal(edit.value.personalSocial.smoking.status, "former");
  assert.equal(isSectionEditDirty(edit), false);
});

test("a refetched background never moves the captured base revision", () => {
  const edit = startSectionEdit(background, "medical");
  const typed = updateSectionEdit(edit, { ...edit.value, allergies: { noneKnown: true, items: [] } });
  // The edit holds its own copy: a newer background is not consulted.
  const payload = sectionSavePayload(typed);
  assert.deepEqual(payload.base_revisions, { medical: 3 });
  assert.equal(isSectionEditDirty(typed), true);
});

test("the save payload holds only the edited section and its base revision", () => {
  const edit = startSectionEdit(background, "family");
  const typed = updateSectionEdit(edit, {
    familyHistory: {
      noneKnown: false,
      items: [...edit.value.familyHistory.items, { condition: "", kind: "", relation: "", relativePatientId: null }],
    },
  });
  const payload = sectionSavePayload(typed);
  assert.deepEqual(Object.keys(payload), ["sections", "base_revisions"]);
  assert.deepEqual(Object.keys(payload.sections), ["family"]);
  // A completely blank row is left out.
  assert.equal(payload.sections.family.familyHistory.items.length, 1);
  assert.deepEqual(payload.base_revisions, { family: 1 });
});

test("the social payload never sends Education or Past Occupations", () => {
  const edit = startSectionEdit(background, "social");
  const typed = updateSectionEdit(edit, {
    personalSocial: { ...edit.value.personalSocial, alcohol: { status: "current", frequency: "weekly" } },
  });
  const social = sectionSavePayload(typed).sections.social.personalSocial;
  assert.equal(Object.hasOwn(social, "education"), false);
  assert.equal(Object.hasOwn(social, "pastOccupations"), false);
  assert.equal(social.alcohol.frequency, "weekly");
  assert.equal(social.smoking.status, "former");
});

test("hidden Education / Past Occupations never make a social edit dirty", () => {
  const edit = startSectionEdit(background, "social");
  const typed = updateSectionEdit(edit, {
    personalSocial: { ...edit.value.personalSocial, education: { level: "", completed: "" }, pastOccupations: "" },
  });
  assert.equal(isSectionEditDirty(typed), false);
});

test("the social payload never sends infant smoking, alcohol, diet, or sexual history", () => {
  const edit = startSectionEdit(background, "social");
  const infant = { birthdate: "2026-06-01" };
  const social = sectionSavePayload(edit, { patient: infant, today: "2026-10-04" }).sections.social.personalSocial;
  assert.equal(Object.hasOwn(social, "smoking"), false);
  assert.equal(Object.hasOwn(social, "alcohol"), false);
  assert.equal(Object.hasOwn(social, "diet"), false);
  assert.equal(Object.hasOwn(social, "sexual"), false);
  assert.equal(Object.hasOwn(social, "environment"), true);
  assert.equal(background.personalSocial.smoking.status, "former");
});

test("a staged consultation update omits hidden infant social keys without emptying stored values", () => {
  const infant = { birthdate: "2026-06-01" };
  const update = {
    sections: {
      social: {
        personalSocial: {
          smoking: { status: "" },
          environment: { waterSource: "Level III" },
        },
      },
    },
  };
  const omitted = omitHiddenSocialFromUpdate(update, infant, "2026-10-04", { includeBhcProfileFields: true });
  assert.equal(Object.hasOwn(omitted.sections.social.personalSocial, "smoking"), false);
  assert.equal(omitted.sections.social.personalSocial.environment.waterSource, "Level III");
  assert.equal(update.sections.social.personalSocial.smoking.status, "");
});

test("clearing hidden infant lifestyle fields does not make a social edit dirty", () => {
  const infant = { birthdate: "2026-06-01" };
  const today = "2026-10-04";
  const edit = startSectionEdit(background, "social");
  const typed = updateSectionEdit(edit, {
    personalSocial: {
      ...edit.value.personalSocial,
      smoking: { status: "" },
      alcohol: { status: "" },
      diet: {},
      sexual: { active: "" },
    },
  });
  assert.equal(isSectionEditDirty(typed, { patient: infant, today }), false);
});

test("a 409 for this section is kept with the draft; other sections are ignored", () => {
  const error = {
    status: 409,
    payload: {
      code: "PATIENT_BACKGROUND_CONFLICT",
      conflicts: [{ section: "medical", current: { allergies: { noneKnown: true, items: [] } }, revision: 5, updatedAt: "2026-10-16" }],
    },
  };
  assert.equal(sectionConflict(error, "family"), null);
  const conflict = sectionConflict(error, "medical");
  assert.equal(conflict.revision, 5);
  assert.equal(sectionConflict({ status: 422 }, "medical"), null);
});

test("resolving a conflict is explicit: keep mine rebases, use latest reloads", () => {
  const edit = startSectionEdit(background, "medical");
  const typed = updateSectionEdit(edit, { ...edit.value, allergies: { noneKnown: true, items: [] } });
  const conflict = {
    section: "medical",
    current: { currentDiseases: [], allergies: { noneKnown: false, items: [{ allergen: "Sulfa", reaction: "" }] }, hospitalizations: { none: true, items: [] } },
    revision: 5,
  };

  const mine = resolveSectionConflict(typed, conflict, "mine");
  assert.equal(mine.baseRevision, 5);
  assert.equal(mine.value.allergies.noneKnown, true);
  assert.equal(isSectionEditDirty(mine), true);

  const latest = resolveSectionConflict(typed, conflict, "latest");
  assert.equal(latest.baseRevision, 5);
  assert.equal(latest.value.allergies.items[0].allergen, "Sulfa");
  assert.equal(isSectionEditDirty(latest), false);
});

test("422 errors become readable lines; other failures keep their message", () => {
  const lines = backgroundSaveErrorLines({
    status: 422,
    message: "The given data was invalid.",
    errors: { "background_update.sections.medical.hospitalizations.items.0.type": ["The type field is required."] },
  });
  assert.deepEqual(lines, ["Past Medical History · Hospitalizations & Surgeries, entry 1: The type field is required."]);
  assert.deepEqual(backgroundSaveErrorLines({ status: 422, message: "Choose a section.", errors: { background_update: ["Choose a section."] } }), [
    "Patient History: Choose a section.",
  ]);
  assert.deepEqual(backgroundSaveErrorLines({ status: 403, message: "Not allowed." }), ["Not allowed."]);
  assert.deepEqual(backgroundSaveErrorLines(null), ["Unable to save this section. Please try again."]);
});

test("after a save: modal while a consultation draft is open, toast otherwise", () => {
  assert.deepEqual(backgroundSavedFeedback({ draft: { id: 9 }, section: "social" }), {
    kind: "modal",
    title: BACKGROUND_SAVED_TITLE,
    message: "Personal & Social History was updated. Your consultation is still open.",
  });
  assert.equal(BACKGROUND_SAVED_TITLE, "Background saved");
  assert.deepEqual(backgroundSavedFeedback({ draft: null, section: "medical" }), { kind: "toast", message: "Background saved" });
});

test("the Consultation in progress banner follows the draft, not navigation", () => {
  assert.equal(consultationBannerVisible({ draft: { id: 1 } }), true);
  assert.equal(consultationBannerVisible({ draft: null }), false);
  // Any BHC user viewing the tab sees it: it does not depend on the editing duty.
  assert.equal(consultationBannerVisible({ draft: { id: 1 }, canEdit: false }), true);
});

test("leaving with an unsaved edit is blocked, staying on Background is not", () => {
  const here = { pathname: "/bhc/patients/4", search: "?tab=background" };
  assert.equal(shouldBlockBackgroundLeave({ dirty: true, currentLocation: here, nextLocation: { pathname: "/bhc/patients/4", search: "?tab=background" } }), false);
  assert.equal(shouldBlockBackgroundLeave({ dirty: true, currentLocation: here, nextLocation: { pathname: "/bhc/patients/4", search: "" } }), true);
  assert.equal(shouldBlockBackgroundLeave({ dirty: true, currentLocation: here, nextLocation: { pathname: "/bhc/health-records/add", search: "?tab=background" } }), true);
  assert.equal(shouldBlockBackgroundLeave({ dirty: false, currentLocation: here, nextLocation: { pathname: "/bhc/patients", search: "" } }), false);
});

test("only a BHC user granted clinical.background.update (with history) may edit", () => {
  const history = ["clinical.history"];
  assert.equal(canUpdateBackground({ role: "bhc", permissions: [...history, "clinical.background.update"] }), true);
  assert.equal(canUpdateBackground({ role: "bhc", permissions: history }), false);
  assert.equal(canUpdateBackground({ role: "bhc", permissions: ["clinical.background.update"] }), false);
  assert.equal(canUpdateBackground({ role: "rhu", permissions: [...history, "clinical.background.update"] }), false);
  assert.equal(canUpdateBackground(null), false);
});

test("the history reference lists the spec's fields and omits obstetric without a visible Section V", () => {
  const sections = historyReferenceSections(background);
  assert.deepEqual(sections.map((section) => section.key), ["medical", "family", "social"]);
  const keys = sections.flatMap((section) => section.rows.map((row) => row.key));
  assert.deepEqual(keys, [
    "currentDiseases",
    "allergies",
    "hospitalizations",
    "familyHistory",
    "smoking",
    "alcohol",
    "diet",
    "sexual",
    "environment",
  ]);
  const social = sections.find((section) => section.key === "social");
  assert.match(social.rows.find((row) => row.key === "smoking").value, /Former smoker/);
});

test("Section V is read-only in the history reference for a female patient", () => {
  const woman = { sex: "Female", birthdate: "1995-01-01" };
  const recorded = normalizeBackground({
    obstetric: {
      menarcheAge: 12,
      menstrualStatus: "menstruating",
      symptoms: ["dysmenorrhea"],
      pregnancies: [{ year: 2019, outcome: "liveBirth", delivery: "cesarean", note: "Recorded history note" }],
    },
  });
  const sections = historyReferenceSections(recorded, { patient: woman });
  assert.deepEqual(sections.map((section) => section.key), ["medical", "family", "social", "obstetric"]);
  const obstetric = sections.find((section) => section.key === "obstetric");
  assert.equal(obstetric.title, "Obstetric & Menstrual History");
  assert.match(obstetric.rows.find((row) => row.key === "cycle").value, /Menarche at 12/);
  assert.match(obstetric.rows.find((row) => row.key === "symptoms").value, /Dysmenorrhea/);
  assert.match(obstetric.rows.find((row) => row.key === "pregnancies").value, /2019 live birth \(cesarean\)/);
  assert.match(obstetric.rows.find((row) => row.key === "pregnancies").value, /Recorded history note/);
});

test("empty obstetric history is blank rows, not leftover pregnancies", () => {
  const woman = { sex: "Female", birthdate: "1995-01-01" };
  const obstetric = historyReferenceSections(normalizeBackground({}), { patient: woman })
    .find((section) => section.key === "obstetric");
  assert.ok(obstetric);
  obstetric.rows.forEach((row) => assert.equal(row.value, "", row.key));
});

test("Section V is hidden for males and unknown sex", () => {
  const keys = (patient) => historyReferenceSections(background, { patient }).map((section) => section.key);
  assert.deepEqual(keys({ sex: "Male", birthdate: "1990-01-01" }), ["medical", "family", "social"]);
  assert.deepEqual(keys({ sex: "", birthdate: "1990-01-01" }), ["medical", "family", "social"]);
  assert.deepEqual(keys(undefined), ["medical", "family", "social"]);
});

test("Section V still shows when obstetric is collapsed for age", () => {
  const girl = { sex: "Female", birthdate: "2018-01-01" };
  const sections = historyReferenceSections(background, { patient: girl, today: "2026-10-29" });
  assert.ok(sections.find((section) => section.key === "obstetric"));
});

test("infant history reference keeps household environment and omits adult lifestyle rows", () => {
  const infant = { sex: "Female", birthdate: "2026-06-01" };
  const sections = historyReferenceSections(background, { patient: infant, today: "2026-10-04" });
  assert.deepEqual(sections.map((section) => section.key), ["medical", "family", "social"]);
  assert.deepEqual(
    sections.find((section) => section.key === "social").rows.map((row) => row.key),
    ["environment"],
  );
});

test("missing reference data is blank (shown as Not recorded), never a negative answer", () => {
  const sections = historyReferenceSections(normalizeBackground(null));
  sections.flatMap((section) => section.rows).forEach((row) => assert.equal(row.value, "", row.key));
  assert.deepEqual(historyReferenceSections(undefined).flatMap((section) => section.rows).map((row) => row.value).filter(Boolean), []);
});
