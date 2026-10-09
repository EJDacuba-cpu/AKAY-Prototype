import assert from "node:assert/strict";
import test from "node:test";

import {
  allConflictsResolved,
  backgroundChangeRows,
  buildBackgroundUpdate,
  editedSectionKeys,
  newPatientReportedCondition,
  overlayBackgroundUpdate,
  readBackgroundConflicts,
  resolveBackgroundConflicts,
  sliceBackground,
  toRecordBackgroundUpdate,
} from "./backgroundUpdate.js";

const loaded = {
  currentDiseases: [{ name: "Hypertension", status: "Active", conditionKey: "hypertension" }],
  allergies: "Dust",
  hospitalizations: "",
  surgeries: "",
  familyHistory: { similarIllness: "Mother - Asthma", chronicIllness: "", hereditaryIllness: "" },
  personalSocial: { diet: "", smoking: "Never", alcohol: "", notes: "" },
  revisions: { medical: 3, family: 1, social: 0 },
};

test("nothing edited stages nothing", () => {
  assert.equal(buildBackgroundUpdate(loaded, structuredClone(loaded)), null);
});

test("whitespace-only and conditionKey differences are not edits", () => {
  const edited = structuredClone(loaded);
  edited.allergies = "  Dust ";
  edited.currentDiseases[0].conditionKey = null;
  assert.equal(buildBackgroundUpdate(loaded, edited), null);
});

test("only the edited section is staged, at the revision it was loaded at", () => {
  const edited = structuredClone(loaded);
  edited.personalSocial.smoking = "Former smoker";
  const update = buildBackgroundUpdate(loaded, edited);

  assert.deepEqual(editedSectionKeys(update), ["social"]);
  assert.deepEqual(update.baseRevisions, { social: 0 });
  assert.equal(update.sections.social.personalSocial.smoking, "Former smoker");
});

test("a section keeps its first base revision when the background is refetched", () => {
  const edited = structuredClone(loaded);
  edited.allergies = "Penicillin";
  const first = buildBackgroundUpdate(loaded, edited);
  const refetched = { ...loaded, revisions: { ...loaded.revisions, medical: 4 } };

  assert.equal(buildBackgroundUpdate(refetched, edited, first).baseRevisions.medical, 3);
});

test("reverting a section un-stages it", () => {
  const edited = structuredClone(loaded);
  edited.allergies = "Penicillin";
  const staged = buildBackgroundUpdate(loaded, edited);
  edited.allergies = "Dust";
  assert.equal(buildBackgroundUpdate(loaded, edited, staged), null);
});

test("overlay shows staged sections over the loaded background", () => {
  const edited = structuredClone(loaded);
  edited.familyHistory.chronicIllness = "Father - Diabetes";
  const overlaid = overlayBackgroundUpdate(loaded, buildBackgroundUpdate(loaded, edited));

  assert.equal(overlaid.familyHistory.chronicIllness, "Father - Diabetes");
  assert.equal(overlaid.allergies, "Dust");
});

test("change rows list only the fields that differ, as text", () => {
  const edited = structuredClone(loaded);
  edited.allergies = "Penicillin";
  edited.currentDiseases.push({ name: "Asthma", status: "Controlled" });

  assert.deepEqual(backgroundChangeRows(loaded, edited, "medical"), [
    { key: "currentDiseases", label: "Current Conditions", before: "Hypertension (Active)", after: "Hypertension (Active); Asthma (Controlled)" },
    { key: "allergies", label: "Allergies", before: "Dust", after: "Penicillin" },
  ]);
  assert.deepEqual(backgroundChangeRows(loaded, edited, "family"), []);
});

test("change rows read a slice as well as a whole background", () => {
  const rows = backgroundChangeRows(
    sliceBackground(loaded, "family"),
    { familyHistory: { similarIllness: "", chronicIllness: "Father - Diabetes" } },
    "family",
  );
  assert.deepEqual(rows.map((row) => [row.label, row.before, row.after]), [
    ["Similar Illness", "Mother - Asthma", ""],
    ["Chronic Illness", "", "Father - Diabetes"],
  ]);
});

test("the record payload uses the API spelling, and nothing when empty", () => {
  const edited = structuredClone(loaded);
  edited.allergies = "Penicillin";
  const payload = toRecordBackgroundUpdate(buildBackgroundUpdate(loaded, edited));

  assert.deepEqual(payload.base_revisions, { medical: 3 });
  assert.equal(payload.sections.medical.allergies, "Penicillin");
  assert.equal(toRecordBackgroundUpdate(null), undefined);
});

test("only a background conflict 409 is read as one", () => {
  const conflicts = [{ section: "medical", revision: 4, current: {} }];
  assert.deepEqual(readBackgroundConflicts({ status: 409, payload: { code: "PATIENT_BACKGROUND_CONFLICT", conflicts } }), conflicts);
  assert.equal(readBackgroundConflicts({ status: 409, payload: { code: "CONDITION_MONITORING_CONFLICT" } }), null);
  assert.equal(readBackgroundConflicts({ status: 500 }), null);
});

test("conflict choices rebase kept sections and drop the others", () => {
  const update = {
    sections: { medical: sliceBackground(loaded, "medical"), social: sliceBackground(loaded, "social") },
    baseRevisions: { medical: 3, social: 0 },
  };
  const conflicts = [{ section: "medical", revision: 5 }, { section: "social", revision: 1 }];

  assert.equal(allConflictsResolved(conflicts, { medical: "mine" }), false);
  assert.equal(allConflictsResolved(conflicts, { medical: "mine", social: "latest" }), true);

  const resolved = resolveBackgroundConflicts(update, conflicts, { medical: "mine", social: "latest" });
  assert.deepEqual(resolved.baseRevisions, { medical: 5 });
  assert.deepEqual(editedSectionKeys(resolved), ["medical"]);
  assert.equal(resolveBackgroundConflicts(update, conflicts, { medical: "latest", social: "latest" }), null);
});

test("a new condition is patient-reported: name and optional note, no status", () => {
  assert.deepEqual(newPatientReportedCondition("  Migraine ", " since 2020 "), {
    name: "Migraine",
    note: "since 2020",
    source: "Patient-reported",
  });
  assert.deepEqual(newPatientReportedCondition("Gout"), { name: "Gout", note: "", source: "Patient-reported" });
  assert.equal(newPatientReportedCondition("   "), null);
});

test("adding a patient-reported condition stages the medical section and keeps legacy entries unchanged", () => {
  const withLegacy = {
    ...loaded,
    currentDiseases: [{ name: "Asthma", status: "Active", firstRecorded: "2025-01-02", source: "Consultation", conditionKey: null }],
  };
  const edited = structuredClone(withLegacy);
  edited.currentDiseases.push(newPatientReportedCondition("Migraine", "since 2020"));
  const update = buildBackgroundUpdate(withLegacy, edited);
  const [legacy, added] = update.sections.medical.currentDiseases;

  assert.deepEqual(editedSectionKeys(update), ["medical"]);
  assert.deepEqual(legacy, sliceBackground(withLegacy, "medical").currentDiseases[0]);
  assert.equal(added.name, "Migraine");
  assert.equal(added.note, "since 2020");
  assert.equal(added.source, "Patient-reported");
  assert.equal(added.status, "");
});

test("a patient-reported note edit is an edit and shows as a change row", () => {
  const before = { ...loaded, currentDiseases: [{ name: "Migraine", note: "", source: "Patient-reported" }] };
  const after = { ...loaded, currentDiseases: [{ name: "Migraine", note: "since 2020", source: "Patient-reported" }] };

  assert.notEqual(buildBackgroundUpdate(before, after), null);
  assert.deepEqual(
    backgroundChangeRows(before, after, "medical").map((row) => [row.before, row.after]),
    [["Migraine", "Migraine - since 2020"]],
  );
});
