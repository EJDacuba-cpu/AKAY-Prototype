import assert from "node:assert/strict";
import test from "node:test";
import { historyCardEditing, hasHistoryCardData } from "./historyCardState.js";

test("empty sections start open independently of other recorded sections", () => {
  const background = { familyHistory: { noneKnown: true } };
  assert.equal(historyCardEditing({ background, section: "family" }), false);
  assert.equal(historyCardEditing({ background, section: "medical" }), true);
  assert.equal(historyCardEditing({ background, section: "obstetric" }), true);
});

test("partial saved history and explicit none-known answers start as summaries", () => {
  for (const [section, background] of [
    ["medical", { allergies: { noneKnown: true } }],
    ["social", { personalSocial: { smoking: { status: "never" } } }],
    ["obstetric", { obstetric: { menarcheAge: 12 } }],
  ]) assert.equal(historyCardEditing({ background, section }), false);
});

test("typing and staged draft updates do not collapse a first intake editor", () => {
  assert.equal(historyCardEditing({ background: {}, section: "family", editing: true }), true);
  assert.equal(historyCardEditing({ background: {}, section: "family" }), true);
});

test("pencil and Done override the default, including clearing all recorded values", () => {
  const background = { familyHistory: { noneKnown: true } };
  assert.equal(historyCardEditing({ background, section: "family", editing: true }), true);
  assert.equal(historyCardEditing({ background: {}, section: "family", editing: false }), false);
});

test("validation errors reopen a closed editor", () => {
  assert.equal(historyCardEditing({ section: "family", editing: false, hasErrors: true }), true);
});

test("hidden social fields never make an otherwise empty section look recorded", () => {
  const background = { personalSocial: { education: { level: "College" }, pastOccupations: "Driver" } };
  const omitFields = ["education", "pastOccupations"];
  assert.equal(hasHistoryCardData(background, "social", omitFields), false);
  assert.equal(historyCardEditing({ background, section: "social", omitFields }), true);
  assert.equal(hasHistoryCardData({ personalSocial: { environment: { waterSource: "Level I" } } }, "social", omitFields), true);
});
