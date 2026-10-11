import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, isValidEmail, routeServerErrors, validateAccountStep } from "./accountForm.js";

const form = {
  role: "bhc", name: "Joshua", email: "joshua@example.test", contact_number: "0917 123 4567",
  password: "password123", password_confirmation: "password123", staff_role: "encoder", permissions: ["patients.register"],
};
const create = { editing: false, hasFacility: true, confirmed: true };

test("facility step reports the missing piece for each tier", () => {
  assert.deepEqual(validateAccountStep(STEPS.facility, { ...form, role: "" }, create), { role: "Choose where this account will work." });
  assert.deepEqual(validateAccountStep(STEPS.facility, form, { ...create, hasFacility: false }), { facility: "Choose the Barangay Health Center." });
  assert.deepEqual(validateAccountStep(STEPS.facility, { ...form, role: "rhu" }, { ...create, hasFacility: false }), { facility: "Choose the Rural Health Unit." });
  assert.deepEqual(validateAccountStep(STEPS.facility, { ...form, role: "admin" }, { ...create, hasFacility: false }), {});
});

test("personal details reports every problem at once", () => {
  const blank = { ...form, name: " ", email: "nope", contact_number: "", password: "", password_confirmation: "" };

  assert.deepEqual(Object.keys(validateAccountStep(STEPS.personal, blank, create)), ["name", "email", "contact_number", "password"]);
  assert.deepEqual(validateAccountStep(STEPS.personal, form, create), {});
});

test("contact numbers may contain spaces or dashes but must be a PH mobile number", () => {
  assert.deepEqual(validateAccountStep(STEPS.personal, { ...form, contact_number: "0917-123-4567" }, create), {});
  assert.deepEqual(Object.keys(validateAccountStep(STEPS.personal, { ...form, contact_number: "+639171234567" }, create)), ["contact_number"]);
});

test("a missing or malformed mobile number only asks for the mobile number", () => {
  for (const contact_number of ["", "12345", "+639171234567"]) {
    assert.deepEqual(validateAccountStep(STEPS.personal, { ...form, contact_number }, create), { contact_number: "Enter mobile number." });
  }
});

test("email addresses need a name, an @ and a domain", () => {
  assert.equal(isValidEmail("joshua@example.test"), true);
  for (const bad of ["", "nope", "a@b", "a b@c.d", " joshua@example.test"]) assert.equal(isValidEmail(bad), false);
});

test("passwords must match and be long enough", () => {
  assert.equal(validateAccountStep(STEPS.personal, { ...form, password: "short", password_confirmation: "short" }, create).password, "Password must contain at least 8 characters.");
  assert.equal(validateAccountStep(STEPS.personal, { ...form, password_confirmation: "different1" }, create).password_confirmation, "Passwords do not match.");
});

test("editing may leave the password blank, but a lone confirmation is flagged", () => {
  const edit = { ...create, editing: true };

  assert.deepEqual(validateAccountStep(STEPS.personal, { ...form, password: "", password_confirmation: "" }, edit), {});
  assert.equal(validateAccountStep(STEPS.personal, { ...form, password: "", password_confirmation: "abc" }, edit).password, "Enter the new password, or clear the confirmation.");
});

test("role and access needs a role and at least one duty", () => {
  assert.deepEqual(validateAccountStep(STEPS.access, { ...form, staff_role: "", permissions: [] }, create), { staff_role: "Choose a role.", permissions: "Select at least one duty." });
  assert.deepEqual(validateAccountStep(STEPS.access, form, create), {});
});

test("review needs the confirmation", () => {
  assert.deepEqual(validateAccountStep(STEPS.review, form, { ...create, confirmed: false }), { confirmed: "Tick the confirmation before saving." });
  assert.deepEqual(validateAccountStep(STEPS.review, form, create), {});
});

test("server errors land under their field and send the admin to the earliest step", () => {
  const routed = routeServerErrors({
    staff_role: ["A Nurse account must be based at a Barangay Health Center."],
    email: ["The email has already been taken."],
    barangay_health_center_id: ["The selected BHC must be active."],
  });

  assert.equal(routed.step, STEPS.facility);
  assert.deepEqual(routed.fields, {
    staff_role: "A Nurse account must be based at a Barangay Health Center.",
    email: "The email has already been taken.",
    facility: "The selected BHC must be active.",
  });
  assert.deepEqual(routed.unrouted, []);
});

test("server errors that belong to no field are returned for a modal", () => {
  const routed = routeServerErrors({ permissions_confirmed: ["The permissions confirmed must be accepted."] });

  assert.equal(routed.step, null);
  assert.deepEqual(routed.fields, {});
  assert.deepEqual(routed.unrouted, ["The permissions confirmed must be accepted."]);
});
