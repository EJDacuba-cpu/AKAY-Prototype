import test from "node:test";
import assert from "node:assert/strict";
import {
  changeFamilySerial,
  linkParent,
  memberAgeLabel,
  omitParentLinks,
  parentRoleFor,
  unlinkParent,
} from "./householdParents.js";

const yearsAgo = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

const juana = { id: "7", fullName: "Juana Cruz", sex: "Female", birthdate: yearsAgo(34) };
const pedro = { id: "8", fullName: "Pedro Cruz", sex: "Male", birthdate: yearsAgo(36) };
const form = {
  familySerialNumber: "FSN-100",
  motherPatientId: "", motherName: "", motherBirthDate: "",
  fatherPatientId: "", fatherName: "", fatherBirthDate: "",
};

test("a member's sex decides which parent they can be", () => {
  assert.equal(parentRoleFor(juana), "mother");
  assert.equal(parentRoleFor(pedro), "father");
  assert.equal(parentRoleFor({ ...juana, sex: "Other" }), null);
});

test("a household child cannot be offered as a parent", () => {
  assert.equal(parentRoleFor({ ...juana, birthdate: yearsAgo(8) }), null);
  assert.equal(parentRoleFor({ ...juana, birthdate: "" }), "mother");
});

test("linking fills the parent's name, birthdate and link", () => {
  const next = linkParent(form, "mother", juana);
  assert.equal(next.motherPatientId, "7");
  assert.equal(next.motherName, "Juana Cruz");
  assert.equal(next.motherBirthDate, juana.birthdate);
  assert.equal(next.fatherPatientId, "");

  const both = linkParent(next, "father", pedro);
  assert.equal(both.fatherPatientId, "8");
  assert.equal(both.fatherName, "Pedro Cruz");
  assert.equal(both.motherPatientId, "7");
});

test("unlinking keeps the values as editable text", () => {
  const next = unlinkParent(linkParent(form, "father", pedro), "father");
  assert.equal(next.fatherPatientId, "");
  assert.equal(next.fatherName, "Pedro Cruz");
  assert.equal(next.fatherBirthDate, pedro.birthdate);
});

test("changing the serial drops links that came from the old household", () => {
  const linked = linkParent(linkParent(form, "mother", juana), "father", pedro);
  const next = changeFamilySerial(linked, "FSN-200");
  assert.equal(next.familySerialNumber, "FSN-200");
  assert.equal(next.motherPatientId, "");
  assert.equal(next.fatherPatientId, "");
  assert.equal(next.motherName, "Juana Cruz");
});

test("re-typing the same serial keeps the links", () => {
  const linked = linkParent(form, "mother", juana);
  assert.equal(changeFamilySerial(linked, " FSN-100 ").motherPatientId, "7");
});

test("member ages read compactly in years, or months for infants", () => {
  assert.equal(memberAgeLabel(juana), "34 y");
  const infant = new Date();
  infant.setMonth(infant.getMonth() - 5);
  assert.equal(memberAgeLabel({ birthdate: infant.toISOString().slice(0, 10) }), "5 mo");
  assert.equal(memberAgeLabel({ birthdate: "" }), "Age —");
});

import { toPayload } from "./patientRegistrationPayload.js";

test("registration drops confirmed parent links so they are never sent, cleared, or created from a label", () => {
  const form = { firstName: "Nina", lastName: "Garcia", motherName: "Lucia", motherPatientId: "7", mother_patient_id: 7, fatherPatientId: "8", father_patient_id: 8, relationshipToHouseholdHead: "Niece" };
  const rest = omitParentLinks(form);
  for (const key of ["motherPatientId", "mother_patient_id", "fatherPatientId", "father_patient_id"]) assert.equal(Object.hasOwn(rest, key), false, key);
  assert.equal(rest.motherName, "Lucia");
  assert.equal(form.motherPatientId, "7");
  const payload = toPayload({ ...rest, motherName: "Lucia" });
  assert.equal(Object.hasOwn(payload, "mother_patient_id"), false);
  assert.equal(Object.hasOwn(payload, "father_patient_id"), false);
  assert.equal(payload.mother_name, "Lucia");
});

test("a household relationship label alone produces no parent link in the payload", () => {
  for (const label of ["Son", "Daughter", "Niece", "Grandson", "Husband", "Brother"]) {
    const payload = toPayload({ ...omitParentLinks({ firstName: "A", lastName: "B", relationshipToHouseholdHead: label }) });
    assert.equal(Object.hasOwn(payload, "mother_patient_id"), false, label);
    assert.equal(Object.hasOwn(payload, "father_patient_id"), false, label);
  }
});
