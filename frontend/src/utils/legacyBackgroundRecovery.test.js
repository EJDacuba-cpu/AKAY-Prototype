import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackgroundUpdate,
  normalizeBackground,
  restoreBackgroundUpdate,
  toDraftBackgroundUpdate,
  toRecordBackgroundUpdate,
} from "./backgroundUpdate.js";
import {
  backgroundUpdateErrorMessages,
  legacyBackgroundRecovery,
  resolveLegacyRecovery,
  legacyRecoveryErrors,
  correctLegacySection,
} from "./legacyBackgroundRecovery.js";

const saved = normalizeBackground({
  allergies: { noneKnown: false, items: [{ allergen: "Penicillin", reaction: "Rash" }] },
  personalSocial: {
    education: { level: "High School", completed: "Graduate" },
    pastOccupations: "Farmer",
    smoking: { status: "never" },
  },
  revisions: { medical: 3, social: 5 },
});

/** A staged update as an old BHC draft stored it, read back the way the workspace restores it. */
function legacyDraftUpdate(edit) {
  const edited = structuredClone(saved);
  edit(edited);
  return restoreBackgroundUpdate(toDraftBackgroundUpdate(buildBackgroundUpdate(saved, edited)));
}

test("a draft with no staged background has nothing to recover", () => {
  assert.equal(legacyBackgroundRecovery(null, saved), null);
  assert.equal(legacyBackgroundRecovery(undefined, saved), null);
  assert.equal(legacyBackgroundRecovery({ sections: {}, baseRevisions: {}, reviewed: [] }, saved), null);
});

test("staged clinical changes are listed per section, before -> after", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.allergies.items.push({ allergen: "Shrimp", reaction: "Hives" });
    bg.personalSocial.smoking.status = "current";
  });
  const recovery = legacyBackgroundRecovery(update, saved);
  assert.deepEqual(recovery.sections.map((s) => s.section), ["medical", "social"]);
  assert.equal(recovery.sections[0].label, "Past Medical History");
  const allergies = recovery.sections[0].rows.find((row) => row.key === "allergies");
  assert.match(allergies.before, /Penicillin/);
  assert.match(allergies.after, /Shrimp/);
  assert.deepEqual(recovery.sections[1].rows.map((row) => row.key), ["smoking"]);
  assert.deepEqual(recovery.removedText, []);
  assert.equal(recovery.hasClinicalChanges, true);
});

test("removed Education / Past Occupations values stay visible as text and are never listed as a clinical change", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.personalSocial.education = { level: "College", completed: "Level" };
    bg.personalSocial.pastOccupations = "Farmer; Fisherman";
  });
  const recovery = legacyBackgroundRecovery(update, saved);
  // Only removed fields changed: no clinical section to save.
  assert.deepEqual(recovery.sections.map((entry) => entry.rows), [[]]);
  assert.equal(recovery.hasClinicalChanges, false);
  assert.deepEqual(recovery.removedText.map((row) => row.key), ["education", "pastOccupations"]);
  assert.match(recovery.removedText[0].value, /College/);
  assert.equal(recovery.removedText[1].value, "Farmer; Fisherman");
  // The staged values themselves are kept, not stripped from the draft.
  assert.equal(update.sections.social.personalSocial.pastOccupations, "Farmer; Fisherman");
});

test("a staged removal of Education is not recoverable text (nothing typed to recover)", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.personalSocial.education = { level: "", completed: "" };
    bg.personalSocial.smoking.status = "former";
  });
  const recovery = legacyBackgroundRecovery(update, saved);
  assert.deepEqual(recovery.removedText, []);
  assert.deepEqual(recovery.sections.map((s) => s.section), ["social"]);
  assert.deepEqual(recovery.sections[0].rows.map((row) => row.key), ["smoking"]);
});

test("sections marked No changes in the old draft are listed too", () => {
  const update = { sections: {}, baseRevisions: {}, reviewed: ["medical", "family"] };
  const recovery = legacyBackgroundRecovery(update, saved);
  assert.deepEqual(recovery.reviewed, ["Past Medical History", "Family History"]);
  assert.deepEqual(recovery.sections, []);
});

test("a staged section matching today's background still needs an explicit recovery choice", () => {
  const update = legacyDraftUpdate((bg) => { bg.personalSocial.smoking.status = "current"; });
  const latest = structuredClone(saved);
  latest.personalSocial.smoking.status = "current";
  latest.revisions.social = 6;
  const recovery = legacyBackgroundRecovery(update, latest);
  assert.ok(recovery, "staged revisions must not bypass the recovery panel when values match");
  assert.equal(recovery.sections[0].section, "social");
  assert.deepEqual(recovery.sections[0].rows, []);
});

test("Keep leaves the staged update exactly as it was, for the draft's own finalization", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.personalSocial.smoking.status = "current";
  });
  const kept = resolveLegacyRecovery(update, "keep");
  assert.equal(kept.acknowledged, true);
  assert.equal(kept.update, update);
  // The finalize payload still carries the draft's own base revisions (stale-revision check stays live).
  assert.deepEqual(toRecordBackgroundUpdate(kept.update).base_revisions, { social: 5 });
});

test("Discard clears the staged update; nothing else is ever chosen silently", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.personalSocial.smoking.status = "current";
  });
  assert.deepEqual(resolveLegacyRecovery(update, "discard"), { update: null, acknowledged: true });
  assert.deepEqual(resolveLegacyRecovery(update, undefined), { update, acknowledged: false });
  assert.deepEqual(resolveLegacyRecovery(update, "save"), { update, acknowledged: false });
});

test("only background_update 422 keys are reported as staged background errors", () => {
  const lines = backgroundUpdateErrorMessages({
    "background_update.sections.medical.hospitalizations.items.0.type": "The type field is required.",
    "informant.relation": "The relation is invalid.",
    pulse: "Enter a valid measurement.",
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Past Medical History · Hospitalizations & Surgeries, entry 1: /);
  assert.deepEqual(backgroundUpdateErrorMessages(undefined), []);
});

test("staged background edits never block finalize", () => {
  const update = legacyDraftUpdate((bg) => { bg.personalSocial.smoking.status = "current"; });
  assert.deepEqual(legacyRecoveryErrors(update, false), {});
  assert.deepEqual(legacyRecoveryErrors(update, true), {});
  assert.deepEqual(legacyRecoveryErrors(null, false), {});
  assert.deepEqual(legacyRecoveryErrors({ sections: {}, reviewed: ["medical"] }, false), {});
});

test("correcting an incomplete legacy row retains other sections and original revisions", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.allergies.items.push({ allergen: "", reaction: "Hives" });
    bg.personalSocial.smoking.status = "current";
  });
  const corrected = structuredClone(update.sections.medical);
  corrected.allergies.items[1].allergen = "Shrimp";
  const next = correctLegacySection(update, "medical", corrected);
  assert.equal(toRecordBackgroundUpdate(next).sections.medical.allergies.items[1].allergen, "Shrimp");
  assert.deepEqual(next.baseRevisions, { medical: 3, social: 5 });
  assert.deepEqual(next.sections.social, update.sections.social);
  assert.equal(update.sections.medical.allergies.items[1].allergen, "");
  assert.equal(correctLegacySection(update, "family", {}), update, "new sections cannot be staged");
});

test("correcting legacy social fields preserves the removed values for copying", () => {
  const update = legacyDraftUpdate((bg) => {
    bg.personalSocial.education = { level: "College", completed: "Level" };
    bg.personalSocial.pastOccupations = "Fisherman";
  });
  const next = correctLegacySection(update, "social", { personalSocial: { smoking: { status: "former" } } });
  assert.equal(next.sections.social.personalSocial.smoking.status, "former");
  assert.deepEqual(next.sections.social.personalSocial.education, { level: "College", completed: "Level" });
  assert.equal(next.sections.social.personalSocial.pastOccupations, "Fisherman");
  assert.deepEqual(next.baseRevisions, { social: 5 });
});
