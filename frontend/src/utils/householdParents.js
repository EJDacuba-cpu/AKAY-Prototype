import { calculateAge, calculateAgeInMonths } from "./patientUtils.js";

/**
 * The Family Serial Number is the household: a child's Mother and Father are
 * linked from the registered members sharing its serial. These helpers keep
 * the registration form's parent fields consistent with those links.
 */

const memberName = (member = {}) =>
  member.fullName || member.full_name ||
  [member.firstName || member.first_name, member.middleName || member.middle_name, member.lastName || member.last_name]
    .filter(Boolean).join(" ") || "";

const memberLabel = (member = {}) =>
  String(member.relationshipToHouseholdHead || member.relationship_to_household_head || "").trim();

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
    [fields.name]: memberName(member),
    [fields.birthDate]: member.birthdate || member.birthDate || "",
  };
}

function householdMembers(registry = {}, household) {
  if (!household) return [];
  const fromRegistry = (registry.patients || []).filter((item) => String(item.householdId || item.household_id) === String(household.id));
  const fromHousehold = household.members || [];
  return [...new Map([...fromHousehold, ...fromRegistry].filter(Boolean).map((item) => [String(item.id), item])).values()];
}

/** Prefer head by sex, then Mother/Father label, then Wife/Husband of the opposite-sex head. */
export function parentCandidateFor(role, members = [], head) {
  const label = role === "mother" ? "Mother" : "Father";
  const spouseLabel = role === "mother" ? "Wife" : "Husband";
  if (head && parentRoleFor(head) === role) return head;
  const labeled = members.find((item) => item.id !== head?.id && memberLabel(item) === label && parentRoleFor(item) === role);
  if (labeled) return labeled;
  if (head && parentRoleFor(head) && parentRoleFor(head) !== role) {
    return members.find((item) => item.id !== head.id && memberLabel(item) === spouseLabel && parentRoleFor(item) === role) || null;
  }
  return null;
}

/**
 * When registering a Son/Daughter into an existing household, draft-fill Mother and
 * Father fields from household members so infant validation does not block save.
 * Backend still confirms links via household.relationship_link, not these draft IDs.
 */
export function applyHouseholdParentFields(form = {}, registry = {}, connection, household) {
  const relationship = connection?.relationship;
  if (relationship !== "Son" && relationship !== "Daughter") return form;

  const members = householdMembers(registry, household);
  const head = members.find((item) => String(item.id) === String(household?.headPatientId || household?.head_patient_id))
    || (registry.patients || []).find((item) => String(item.id) === String(household?.headPatientId || household?.head_patient_id));

  let next = { ...form };
  for (const role of Object.keys(PARENT_FIELDS)) {
    const candidate = parentCandidateFor(role, members, head);
    if (!candidate?.id) continue;
    const fields = PARENT_FIELDS[role];
    // Always refresh draft link from the current household selection.
    next = linkParent(next, role, candidate);
    if (!String(next[fields.name] || "").trim()) next[fields.name] = memberName(candidate);
  }
  return next;
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
 * Registration never puts mother/father patient IDs on the patient payload.
 * Parent links for Son/Daughter (and reverse Mother/Father) are confirmed through
 * household.relationship_link during save; draft IDs on the form are UI-only.
 */
export function omitParentLinks(form = {}) {
  const rest = { ...form };
  for (const key of PARENT_LINK_KEYS) delete rest[key];
  return rest;
}
