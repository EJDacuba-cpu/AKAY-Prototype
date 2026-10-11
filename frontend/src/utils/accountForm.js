import { TIERS, isValidContactNumber } from "./staffRoles.js";

export const STEPS = { facility: "Facility", personal: "Personal Details", access: "Role & Access", review: "Review" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every problem on one step, keyed by field, so the form can mark them all at once.
 * `editing` lets the password stay blank; `hasFacility` says a facility of the chosen tier is picked.
 */
export function validateAccountStep(step, form, { editing, hasFacility, confirmed }) {
  const errors = {};
  if (step === STEPS.facility) {
    if (!form.role) errors.role = "Choose where this account will work.";
    else if (form.role === TIERS.bhc && !hasFacility) errors.facility = "Choose the Barangay Health Center.";
    else if (form.role === TIERS.rhu && !hasFacility) errors.facility = "Choose the Rural Health Unit.";
  }
  if (step === STEPS.personal) {
    if (!form.name.trim()) errors.name = "Enter the full name.";
    if (!EMAIL.test(form.email)) errors.email = "Enter a valid email address.";
    if (!isValidContactNumber(form.contact_number)) errors.contact_number = "Enter a mobile number like 09171234567.";
    if (!editing || form.password || form.password_confirmation) {
      if (!form.password && form.password_confirmation) errors.password = "Enter the new password, or clear the confirmation.";
      else if (form.password.length < 8) errors.password = "Password must contain at least 8 characters.";
      else if (form.password !== form.password_confirmation) errors.password_confirmation = "Passwords do not match.";
    }
  }
  if (step === STEPS.access) {
    if (!form.staff_role) errors.staff_role = "Choose a role.";
    if (!form.permissions.length) errors.permissions = "Select at least one duty.";
  }
  if (step === STEPS.review && !confirmed) errors.confirmed = "Tick the confirmation before saving.";
  return errors;
}

// Backend field -> [form field, step it is edited on]. Anything else has no home on the page.
const SERVER_FIELDS = {
  name: ["name", STEPS.personal],
  email: ["email", STEPS.personal],
  contact_number: ["contact_number", STEPS.personal],
  password: ["password", STEPS.personal],
  role: ["role", STEPS.facility],
  barangay_health_center_id: ["facility", STEPS.facility],
  rural_health_unit_id: ["facility", STEPS.facility],
  staff_role: ["staff_role", STEPS.access],
  permissions: ["permissions", STEPS.access],
};
const ORDER = [STEPS.facility, STEPS.personal, STEPS.access, STEPS.review];

/** Splits a 422 `errors` object into per-field messages, the earliest step to show, and messages that fit no field. */
export function routeServerErrors(errors = {}) {
  const fields = {};
  const unrouted = [];
  let step = null;
  for (const [key, messages] of Object.entries(errors)) {
    const target = SERVER_FIELDS[key];
    if (!target) { unrouted.push(...[].concat(messages)); continue; }
    fields[target[0]] ??= [].concat(messages)[0];
    if (step === null || ORDER.indexOf(target[1]) < ORDER.indexOf(step)) step = target[1];
  }
  return { step, fields, unrouted };
}
