import test from "node:test";
import assert from "node:assert/strict";
import { isNoAllergyText } from "./allergies.js";

test("negative allergy answers are not allergies", () => {
  for (const text of [
    "None",
    "none.",
    "None reported",
    "none reported.",
    "None known",
    "No known allergies",
    "No known drug allergies",
    "No allergy",
    "No allergies",
    "NKA",
    "NKDA",
    "N/A",
    "na",
    "-",
    "  None reported  ",
  ]) {
    assert.equal(isNoAllergyText(text), true, text);
  }
});

test("a recorded allergy is an allergy", () => {
  for (const text of ["Penicillin", "Shrimp, peanuts", "None reported by mother; penicillin rash 2019", "Nonsteroidal anti-inflammatories"]) {
    assert.equal(isNoAllergyText(text), false, text);
  }
});

test("blank text is not a negative answer (it is unrecorded)", () => {
  assert.equal(isNoAllergyText(""), false);
  assert.equal(isNoAllergyText(null), false);
});
