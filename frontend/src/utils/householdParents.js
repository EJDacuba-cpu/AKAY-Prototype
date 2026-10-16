import { calculateAge, calculateAgeInMonths } from "./patientUtils.js";

/**
 * The Family Serial Number is the household: a child's Mother and Father are
 * linked from the registered members sharing its serial. These helpers keep
 * the registration form's parent fields consistent with those links.
 */

export const PARENT_FIELDS = {
  mother: {
    label: "Mother",
    sex: "Female",
    id: "motherPatientId",
    name: "motherName",
    birthDate: "motherBirthDate",
  },
  father: {
    label: "Father",
    sex: "Male",
    id: "fatherPatientId",
    name: "fatherName",
    birthDate: "fatherBirthDate",
  },
};

// Same floor the old Mother search used: younger members are the household's
// children, not candidate parents.
const MIN_PARENT_AGE = 12;

/** "mother" | "father" | null - the parent this member can be linked as. */
export function parentRoleFor(member = {}) {
  const role = Object.keys(PARENT_FIELDS).find(
    (key) => PARENT_FIELDS[key].sex === member.sex,
  );
  if (!role) return null;

  const age = calculateAge(member.birthdate || member.birthDate);
  return age !== "" && age < MIN_PARENT_AGE ? null : role;
}

export function linkParent(form, role, member) {
  const fields = PARENT_FIELDS[role];
  return {
    ...form,
    [fields.id]: String(member.id),
    [fields.name]: member.fullName || member.full_name || "",
    [fields.birthDate]: member.birthdate || member.birthDate || "",
  };
}

/** Drops the link; the name and birthdate stay as manually editable text. */
export function unlinkParent(form, role) {
  return { ...form, [PARENT_FIELDS[role].id]: "" };
}

/**
 * Links only ever come from the household on screen, so moving to another
 * serial drops them (the typed values stay, as with Unlink).
 */
export function changeFamilySerial(form, serial) {
  if (serial.trim() === form.familySerialNumber.trim()) {
    return { ...form, familySerialNumber: serial };
  }

  return {
    ...form,
    familySerialNumber: serial,
    motherPatientId: "",
    fatherPatientId: "",
  };
}

export function memberAgeLabel(member = {}) {
  const birthDate = member.birthdate || member.birthDate;
  const months = calculateAgeInMonths(birthDate);
  if (months === "") return "Age —";
  return months < 12 ? `${months} mo` : `${calculateAge(birthDate)} y`;
}

const PARENT_LINK_KEYS = ["motherPatientId", "mother_patient_id", "fatherPatientId", "father_patient_id"];

/**
 * Registration never sets, clears, or resends a confirmed parent link (mother/father patient IDs);
 * those are managed through Families. A household relationship label never creates one either.
 */
export function omitParentLinks(form = {}) {
  const rest = { ...form };
  for (const key of PARENT_LINK_KEYS) delete rest[key];
  return rest;
}
