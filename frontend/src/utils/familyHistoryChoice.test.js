import assert from "node:assert/strict";
import test from "node:test";

import {
  FAMILY_CONDITION_OPTIONS,
  familyConditionChoice,
  familyHistoryForChoice,
} from "./familyHistoryChoice.js";
import { buildBackgroundUpdate, editedSectionKeys, normalizeBackground } from "./backgroundUpdate.js";

const hypertension = [{ condition: "Hypertension", kind: "Chronic", relation: "Mother" }];

test("familyConditionChoice distinguishes Yes, None known, and not recorded", () => {
  assert.equal(familyConditionChoice({ noneKnown: true, items: [] }), "none");
  assert.equal(familyConditionChoice({ noneKnown: false, items: hypertension }), "yes");
  assert.equal(familyConditionChoice({ noneKnown: false, items: [] }), "");
  assert.equal(familyConditionChoice({ items: [{ relation: "Father" }] }), "");
  assert.equal(familyConditionChoice(null), "");
});

test("None known stages an empty list and does not keep previous items in the payload", () => {
  assert.deepEqual(familyHistoryForChoice("none", { items: hypertension }), { noneKnown: true, items: [] });
});

test("Yes stages the current items", () => {
  assert.deepEqual(familyHistoryForChoice("yes", { items: hypertension }), { noneKnown: false, items: hypertension });
});

test("Unsure does not overwrite saved None known or saved conditions", () => {
  assert.deepEqual(familyHistoryForChoice("unsure", { saved: { noneKnown: true, items: [] } }), {
    noneKnown: true,
    items: [],
  });
  assert.deepEqual(familyHistoryForChoice("unsure", { items: [], saved: { noneKnown: false, items: hypertension } }), {
    noneKnown: false,
    items: hypertension,
  });
});

test("Unsure on empty history is not recorded, the same stored shape as leaving it blank", () => {
  assert.deepEqual(familyHistoryForChoice("unsure", { saved: { noneKnown: false, items: [] } }), {
    noneKnown: false,
    items: [],
  });
  assert.equal(familyConditionChoice(familyHistoryForChoice("unsure", { saved: {} })), "");
});

test("radio labels distinguish Yes, None known, and Unsure", () => {
  assert.deepEqual(
    FAMILY_CONDITION_OPTIONS.map((option) => option.label),
    ["Yes — Has known family conditions", "No — None known", "Unsure — Patient doesn't know"],
  );
});

test("Unsure does not stage a change over saved conditions or over an empty first visit", () => {
  const followUp = normalizeBackground({
    familyHistory: { noneKnown: false, items: hypertension },
    revisions: { family: 1 },
  });
  const unsureFollowUp = buildBackgroundUpdate(followUp, {
    ...followUp,
    familyHistory: familyHistoryForChoice("unsure", { saved: followUp.familyHistory }),
  });
  assert.equal(editedSectionKeys(unsureFollowUp).includes("family"), false);

  const firstVisit = normalizeBackground({});
  const unsureFirst = buildBackgroundUpdate(firstVisit, {
    ...firstVisit,
    familyHistory: familyHistoryForChoice("unsure", { saved: firstVisit.familyHistory }),
  });
  assert.equal(editedSectionKeys(unsureFirst).includes("family"), false);
});

test("None known stages over saved conditions; Yes restores the listed items", () => {
  const followUp = normalizeBackground({
    familyHistory: { noneKnown: false, items: hypertension },
    revisions: { family: 1 },
  });
  const none = buildBackgroundUpdate(followUp, {
    ...followUp,
    familyHistory: familyHistoryForChoice("none", { items: hypertension, saved: followUp.familyHistory }),
  });
  assert.deepEqual(none.sections.family.familyHistory, { noneKnown: true, items: [] });

  const yes = buildBackgroundUpdate(followUp, {
    ...followUp,
    familyHistory: familyHistoryForChoice("yes", { items: hypertension }),
  });
  assert.equal(editedSectionKeys(yes).includes("family"), false);
});
