import assert from "node:assert/strict";
import test from "node:test";

import {
  historyErrorMessages,
  informantPayload,
  linkedRelatives,
  similarIllnessPayload,
  visitAnswerDraftFields,
  visitAnswerErrorMessages,
  visitAnswerRecordFields,
  visitAnswerRows,
} from "./historyStep.js";

test("informantPayload sends only an informant with a relation", () => {
  assert.equal(informantPayload(null), null);
  assert.equal(informantPayload({ relation: "", name: "Ana", patientId: null }), null);
  assert.deepEqual(informantPayload({ relation: "Mother", name: " Ana ", patientId: "12" }), {
    relation: "Mother",
    name: "Ana",
    patientId: 12,
  });
  assert.deepEqual(informantPayload({ relation: "Patient", name: "", patientId: "" }), {
    relation: "Patient",
    name: "",
    patientId: null,
  });
  assert.equal(informantPayload({ relation: "Other", patientId: "x" }).patientId, null);
});

test("similarIllnessPayload sends only an answered question", () => {
  assert.equal(similarIllnessPayload(null), null);
  assert.equal(similarIllnessPayload({ answer: "", who: "Brother", note: "" }), null);
  assert.deepEqual(similarIllnessPayload({ answer: "Yes", who: " Brother ", note: "" }), {
    answer: "Yes",
    who: "Brother",
    note: "",
  });
});

test("historyErrorMessages turns background_update 422 keys into readable lines", () => {
  const messages = historyErrorMessages({
    "background_update.sections.medical.hospitalizations.items.0.type":
      "The background update.sections.medical.hospitalizations.items.0.type field is required.",
    "informant.relation": "The selected informant.relation is invalid.",
    "similar_illness.answer": "The similar illness.answer field is required when similar illness is present.",
    chiefComplaint: "Required.",
  });
  assert.deepEqual(messages, [
    "Past Medical History · Hospitalizations & Surgeries, entry 1: The type field is required.",
    "Informant: The selected relation is invalid.",
    "Similar Illness: The answer field is required when similar illness is present.",
  ]);
  assert.deepEqual(historyErrorMessages({}), []);
  assert.deepEqual(historyErrorMessages(undefined), []);
});

test("historyErrorMessages names nested social and obstetric fields", () => {
  const [social, obstetric, base] = historyErrorMessages({
    "background_update.sections.social.personalSocial.smoking.sticksPerDay":
      "The background_update.sections.social.personalSocial.smoking.sticksPerDay field must be at least 1.",
    "background_update.sections.obstetric.obstetric.pregnancies.2.outcome": "Bad outcome.",
    "background_update.base_revisions.medical": "Missing base.",
  });
  assert.equal(social, "Personal & Social History · Smoking: The sticks per day field must be at least 1.");
  assert.equal(obstetric, "Obstetric & Menstrual History · Pregnancies, entry 3: Bad outcome.");
  assert.equal(base, "Patient History: Missing base.");
});

test("historyErrorMessages reports the section of each error", () => {
  assert.equal(
    historyErrorMessages(
      { "background_update.sections.family.familyHistory.items.0.condition": "x" },
      { withSection: true },
    )[0].section,
    "family",
  );
});

test("linkedRelatives lists the linked mother and father only", () => {
  assert.deepEqual(linkedRelatives(null), []);
  assert.deepEqual(linkedRelatives({ motherPatient: null, fatherPatient: undefined }), []);
  const mother = { id: 4, first_name: "Ana" };
  const father = { patientId: "7", name: "Ben" };
  assert.deepEqual(linkedRelatives({ motherPatient: mother, fatherPatient: father }), [mother, father]);
  assert.deepEqual(linkedRelatives({ motherPatient: { name: "No id" } }), []);
});

test("visit answer rows list only what was answered", () => {
  assert.deepEqual(visitAnswerRows({ informant: null, similarIllness: null }), []);
  assert.deepEqual(
    visitAnswerRows({ informant: { relation: "", name: "Juana" }, similarIllness: { answer: "", who: "Mother" } }),
    [],
  );
  assert.deepEqual(visitAnswerRows({ informant: { relation: "Mother", name: " Juana " }, similarIllness: null }), [
    { label: "Informant", value: "Mother · Juana" },
  ]);
  assert.deepEqual(
    visitAnswerRows({ informant: null, similarIllness: { answer: "Yes", who: "Sibling", note: " cough " } }),
    [{ label: "Similar illness in the family", value: "Yes · Sibling · cough" }],
  );
});

/* ── Visit answers on the BHC Patient Interview (moved from Patient History) ── */

const informant = { relation: "Mother", name: " Juana ", patientId: "12" };
const similarIllness = { answer: "Yes", who: "Sibling", note: "cough" };

test("draft fields keep the same keys and leave out unanswered questions", () => {
  assert.deepEqual(visitAnswerDraftFields({ informant, similarIllness, allowed: true }), {
    informant: { relation: "Mother", name: "Juana", patientId: 12 },
    similarIllness: { answer: "Yes", who: "Sibling", note: "cough" },
  });
  assert.deepEqual(visitAnswerDraftFields({ informant: { relation: "" }, similarIllness: null, allowed: true }), {});
  // Without clinical.history nothing is written to the draft.
  assert.deepEqual(visitAnswerDraftFields({ informant, similarIllness, allowed: false }), {});
});

test("record fields always carry both keys (null when unanswered or not allowed)", () => {
  assert.deepEqual(visitAnswerRecordFields({ informant, similarIllness, allowed: true }), {
    informant: { relation: "Mother", name: "Juana", patientId: 12 },
    similarIllness: { answer: "Yes", who: "Sibling", note: "cough" },
  });
  assert.deepEqual(visitAnswerRecordFields({ informant: null, similarIllness: { answer: "" }, allowed: true }), {
    informant: null,
    similarIllness: null,
  });
  assert.deepEqual(visitAnswerRecordFields({ informant, similarIllness, allowed: false }), {
    informant: null,
    similarIllness: null,
  });
});

test("a restored draft's visit answers round-trip through the draft fields unchanged", () => {
  const draft = visitAnswerDraftFields({ informant, similarIllness, allowed: true });
  assert.deepEqual(informantPayload(draft.informant), draft.informant);
  assert.deepEqual(similarIllnessPayload(draft.similarIllness), draft.similarIllness);
  assert.deepEqual(visitAnswerRows(draft), [
    { label: "Informant", value: "Mother · Juana" },
    { label: "Similar illness in the family", value: "Yes · Sibling · cough" },
  ]);
});

test("visit answer errors are the informant / similar illness lines only", () => {
  const lines = visitAnswerErrorMessages({
    "informant.relation": "The selected informant.relation is invalid.",
    "similar_illness.answer": "The selected similar illness.answer is invalid.",
    "background_update.sections.medical.allergies": "Bad.",
    chiefComplaint: "Chief complaint is required.",
  });
  assert.deepEqual(lines, [
    "Informant: The selected relation is invalid.",
    "Similar Illness: The selected answer is invalid.",
  ]);
  assert.deepEqual(visitAnswerErrorMessages(null), []);
});
