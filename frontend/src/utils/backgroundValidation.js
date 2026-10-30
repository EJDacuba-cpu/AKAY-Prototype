/**
 * Client checks for a staged Patient Background update, matching the
 * finalize rules in PatientBackground::rules (ranges, enums, exclusive
 * none/items, required keys on a non-blank row). Blank optional fields
 * stay valid. Nothing here rewrites clinical values.
 *
 * Keys use the record API spelling (`background_update.sections…`) so the
 * history panel, step routing, and focus lookup share one path.
 */

import { toRecordBackgroundUpdate } from "./backgroundUpdate.js";
import { PREVIOUS_FP_METHOD_OPTIONS } from "./familyPlanning.js";

const STATUS = ["never", "former", "current"];
const PREFIX = "background_update.sections";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function integerValue(value) {
  if (!isPresent(value)) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

function rangeError(value, { min, max, label }) {
  if (!isPresent(value)) return "";
  const number = integerValue(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return "";
}

function enumError(value, allowed, label) {
  if (!isPresent(value)) return "";
  return allowed.includes(value) ? "" : `Choose a valid ${label}.`;
}

function requiredOnRow(item, key, label) {
  return isPresent(item?.[key]) ? "" : `Enter the ${label}.`;
}

function setError(errors, key, message) {
  if (message) errors[key] = message;
}

function exclusiveError(group, flag) {
  if (!isObject(group)) return "";
  const flagged = group[flag] === true || group[flag] === 1 || group[flag] === "1" || group[flag] === "true";
  const items = Array.isArray(group.items) ? group.items : [];
  return flagged && items.length ? "Choose either none or list the items, not both." : "";
}

function validateRows(errors, items, path, required) {
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (!isObject(item)) return;
    Object.entries(required).forEach(([key, rule]) => {
      const field = `${path}.${index}.${key}`;
      if (rule.type === "required") {
        setError(errors, field, requiredOnRow(item, key, rule.label));
        if (isPresent(item[key]) && rule.in) {
          setError(errors, field, enumError(item[key], rule.in, rule.label));
        }
        return;
      }
      if (rule.type === "int") {
        setError(errors, field, rangeError(item[key], rule));
        return;
      }
      if (rule.type === "enum") {
        setError(errors, field, enumError(item[key], rule.in, rule.label));
      }
    });
  });
}

function validateMedical(slice, errors) {
  const base = `${PREFIX}.medical`;
  const allergies = slice?.allergies;
  const hospitalizations = slice?.hospitalizations;
  setError(errors, `${base}.allergies`, exclusiveError(allergies, "noneKnown"));
  setError(errors, `${base}.hospitalizations`, exclusiveError(hospitalizations, "none"));
  validateRows(errors, slice?.currentDiseases, `${base}.currentDiseases`, {
    name: { type: "required", label: "condition name" },
    yearDiagnosed: { type: "int", min: 1900, max: 2100, label: "Year diagnosed" },
  });
  validateRows(errors, allergies?.items, `${base}.allergies.items`, {
    allergen: { type: "required", label: "allergen" },
  });
  validateRows(errors, hospitalizations?.items, `${base}.hospitalizations.items`, {
    type: { type: "required", label: "type", in: ["Hospitalization", "Surgery"] },
    year: { type: "int", min: 1900, max: 2100, label: "Year" },
  });
}

function validateFamily(slice, errors) {
  const base = `${PREFIX}.family.familyHistory`;
  const family = slice?.familyHistory;
  setError(errors, base, exclusiveError(family, "noneKnown"));
  validateRows(errors, family?.items, `${base}.items`, {
    condition: { type: "required", label: "condition" },
    kind: { type: "enum", in: ["Chronic", "Hereditary"], label: "kind" },
    relation: {
      type: "enum",
      in: ["Mother", "Father", "Sibling", "Grandparent", "Child", "Other"],
      label: "relation",
    },
    relativePatientId: { type: "int", min: 1, max: Number.MAX_SAFE_INTEGER, label: "Linked relative" },
  });
}

function validateSocial(slice, errors) {
  const social = slice?.personalSocial || {};
  const base = `${PREFIX}.social.personalSocial`;
  const smoking = social.smoking || {};
  const alcohol = social.alcohol || {};
  const education = social.education || {};
  const sexual = social.sexual || {};
  const environment = social.environment || {};

  setError(errors, `${base}.education.level`, enumError(education.level, [
    "None", "Elementary", "High School", "Senior High School", "Vocational", "College", "Postgraduate",
  ], "education level"));
  setError(errors, `${base}.education.completed`, enumError(education.completed, ["Level", "Graduate"], "education completed"));
  setError(errors, `${base}.smoking.status`, enumError(smoking.status, STATUS, "smoking status"));
  setError(
    errors,
    `${base}.smoking.sticksPerDay`,
    rangeError(smoking.sticksPerDay, { min: 1, max: 100, label: "Sticks per day" }),
  );
  setError(errors, `${base}.smoking.years`, rangeError(smoking.years, { min: 0, max: 80, label: "Years smoked" }));
  setError(errors, `${base}.smoking.quitYear`, rangeError(smoking.quitYear, { min: 1900, max: 2100, label: "Year quit" }));
  setError(errors, `${base}.alcohol.status`, enumError(alcohol.status, STATUS, "alcohol status"));
  setError(errors, `${base}.alcohol.frequency`, enumError(alcohol.frequency, ["occasional", "weekly", "daily"], "frequency"));
  setError(errors, `${base}.sexual.active`, enumError(sexual.active, ["yes", "no", "declined"], "sexually active answer"));
  setError(errors, `${base}.environment.waterSource`, enumError(environment.waterSource, [
    "Level I", "Level II", "Level III", "Other",
  ], "water source"));
  setError(errors, `${base}.environment.toilet`, enumError(environment.toilet, [
    "Water-sealed (own)", "Water-sealed (shared)", "Pit latrine", "None", "Other",
  ], "toilet type"));
}

function validateObstetric(slice, errors) {
  const obstetric = slice?.obstetric || {};
  const base = `${PREFIX}.obstetric.obstetric`;
  setError(errors, `${base}.menarcheAge`, rangeError(obstetric.menarcheAge, { min: 6, max: 25, label: "Age at first period" }));
  setError(errors, `${base}.menstrualStatus`, enumError(obstetric.menstrualStatus, ["menstruating", "menopause"], "menstrual status"));
  setError(errors, `${base}.menopauseAge`, rangeError(obstetric.menopauseAge, { min: 30, max: 70, label: "Age at menopause" }));
  setError(errors, `${base}.intervalDays`, rangeError(obstetric.intervalDays, { min: 10, max: 90, label: "Cycle interval" }));
  setError(errors, `${base}.durationDays`, rangeError(obstetric.durationDays, { min: 1, max: 15, label: "Duration" }));
  setError(errors, `${base}.amount`, enumError(obstetric.amount, ["light", "moderate", "heavy"], "amount"));
  setError(errors, `${base}.regularity`, enumError(obstetric.regularity, ["regular", "irregular"], "regularity"));
  setError(errors, `${base}.previousFpMethod`, enumError(obstetric.previousFpMethod, [...PREVIOUS_FP_METHOD_OPTIONS, "Other"], "previous FP method"));
  validateRows(errors, obstetric.pregnancies, `${base}.pregnancies`, {
    year: { type: "int", min: 1900, max: 2100, label: "Year" },
    outcome: { type: "enum", in: ["liveBirth", "miscarriage", "stillbirth"], label: "outcome" },
    delivery: { type: "enum", in: ["normal", "cesarean", "notApplicable"], label: "delivery" },
  });
}

const SECTION_VALIDATORS = {
  medical: validateMedical,
  family: validateFamily,
  social: validateSocial,
  obstetric: validateObstetric,
};

/**
 * Field errors for the staged update that finalize would send. Completely
 * blank rows are ignored (the record payload already drops them). `sections`
 * limits the check to those keys (Interview: family/medical/social).
 */
export function backgroundUpdateErrors(update, { sections } = {}) {
  const payload = toRecordBackgroundUpdate(update);
  const given = payload?.sections;
  if (!isObject(given)) return {};

  const errors = {};
  const wanted = Array.isArray(sections) && sections.length ? sections : Object.keys(SECTION_VALIDATORS);
  wanted.forEach((section) => {
    if (!given[section] || !SECTION_VALIDATORS[section]) return;
    SECTION_VALIDATORS[section](given[section], errors);
  });
  return errors;
}

/** The first message for a field key, or "". */
export function historyFieldError(errors, key) {
  if (!errors || !key) return "";
  const value = errors[key];
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
}
