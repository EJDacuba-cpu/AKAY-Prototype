import { compileEpiHistory } from "./epiTracking.js";
import { normalizeDateValue } from "./filterUtils.js";
import {
  isEpiRecord,
  isMaternalRecord,
} from "./healthRecordPrograms.js";
import { patientBirthDate } from "./infantVisibility.js";
import { formatPatientName } from "./formatters.js";
import {
  calculateAgeInMonths,
  isInfantPatient,
} from "./patientUtils.js";
import { calculateAgeInYears } from "./maternalRisk.js";

export const CHILD_CARE_TCL_UNAVAILABLE = "Not recorded";
export const CHILD_CARE_CPAB_NOT_ASSESSED = "Not assessed";
export const CHILD_CARE_CPAB_PROTECTED = "Protected";

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function getPatientId(value = {}) {
  return String(value?.id || value?.patientId || value?.patient_id || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function parseCalendarDate(value) {
  const text = normalizeDateValue(value);
  if (!text) return null;
  const [year, month, day] = text.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function normalizeTimeGiven(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function combineDateAndTime(dateValue, timeValue) {
  const date = parseCalendarDate(dateValue);
  const time = normalizeTimeGiven(timeValue);
  if (!date || !time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

function getPatientSex(patient = {}) {
  return firstFilled(patient.sex, patient.gender);
}

function getRegistrationDate(patient = {}) {
  return (
    normalizeDateValue(
      patient.dateRegistered ||
        patient.date_registered ||
        patient.createdAt ||
        patient.created_at ||
        patient.registeredAt,
    ) || ""
  );
}

function formatAgeForPeriod(birthDate, asOfDate) {
  const months = calculateAgeInMonths(birthDate, asOfDate);
  if (months === "") return "";
  if (months < 24) {
    return `${months} mo`;
  }
  const years = calculateAgeInYears(birthDate, asOfDate);
  if (years === null || years === undefined || Number.isNaN(Number(years))) {
    return "";
  }
  return `${years} yr`;
}

function collectDatedTetanusDoses(maternalRecords = []) {
  const tt = { tt1: "", tt2: "", tt3: "", tt4: "", tt5: "" };
  const td = { td1: "", td2: "", td3: "", td4: "", td5: "" };

  for (const record of maternalRecords) {
    const data = record.maternalData || record.maternal_data || {};
    const ttStatus = asObject(data.tetanusToxoidStatus || data.tetanus_toxoid_status);
    const tdStatus = asObject(
      data.tetanusDiphtheriaStatus || data.tetanus_diphtheria_status,
    );
    for (const key of Object.keys(tt)) {
      if (!tt[key]) tt[key] = normalizeDateValue(ttStatus[key]) || "";
    }
    for (const key of Object.keys(td)) {
      if (!td[key]) td[key] = normalizeDateValue(tdStatus[key]) || "";
    }
  }

  return { tt, td };
}

function highestCompletedDose(doses, prefix, onOrBefore) {
  const keys = [`${prefix}5`, `${prefix}4`, `${prefix}3`, `${prefix}2`, `${prefix}1`];
  for (const key of keys) {
    const date = normalizeDateValue(doses[key]);
    if (date && (!onOrBefore || date <= onOrBefore)) {
      return { key: key.toUpperCase(), date };
    }
  }
  return null;
}

export const CHILD_CARE_CPAB_NOT_PROTECTED = "Not protected";

function latestChildCpabAssessment(childEpiRecords = []) {
  let latest = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const record of childEpiRecords || []) {
    const data = asObject(record.immunizationData || record.immunization_data);
    const assessment = asObject(data.cpabAssessment || data.cpab_assessment);
    const status = String(assessment.status || "").trim().toLowerCase();
    if (!status || status === "not_assessed") continue;
    const stamp = getRecordTime(
      assessment.assessedAt
        || assessment.assessed_at
        || record.dateOfVisit
        || record.date_of_visit
        || record.dateRecorded
        || record.created_at,
    );
    if (stamp >= latestTime) {
      latestTime = stamp;
      latest = { assessment, data, record };
    }
  }
  return latest;
}

function formatManualEvidence(rows = [], childDob = "") {
  const labels = [];
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const type = String(row.vaccineType || row.vaccine_type || "").toUpperCase();
    const dose = String(row.dose || "").trim();
    const date = normalizeDateValue(row.dateAdministered || row.date_administered);
    const source = String(row.evidenceSource || row.evidence_source || "");
    if (!type || !dose) continue;
    if (childDob && date && date > childDob) continue;
    const sourceNote = source === "mother_reported" ? " (reported)" : "";
    labels.push(`${type}${dose}${date ? ` ${date}` : ""}${sourceNote}`);
  }
  return labels;
}

function getRecordTime(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}

/**
 * Conservative CPAB assessment.
 * Prefer finalized child EPI manual CPAB assessment + maternal TT/Td evidence
 * recorded on the child form (no mother-patient link required).
 * Legacy fallback: linked mother maternal TT2+/Td2+ dated on/before DOB.
 * Official FHSIS pregnancy-episode matching is not fully encoded in AKAY.
 * A CPAB vaccine checkbox alone never proves protection.
 */
export function assessChildCpab({
  child = {},
  mother = null,
  motherRecords = [],
  childEpiHistory = new Map(),
  childEpiRecords = [],
} = {}) {
  const dob = normalizeDateValue(patientBirthDate(child));
  const hasCpabCheckbox = childEpiHistory.has("CPAB");
  const manual = latestChildCpabAssessment(childEpiRecords);

  if (manual) {
    const status = String(manual.assessment.status || "").trim().toLowerCase();
    const evidenceRows = manual.data.maternalTtTdEvidence
      || manual.data.maternal_tt_td_evidence
      || [];
    const evidence = formatManualEvidence(evidenceRows, dob || "");
    const notes = String(manual.assessment.notes || "").trim();
    if (status === "protected") {
      const verified = evidence.some((label) => !label.includes("(reported)"));
      if (!verified && evidence.length === 0) {
        return {
          status: "not_assessed",
          label: CHILD_CARE_CPAB_NOT_ASSESSED,
          evidenceLabel: notes || "Protected selected without documented TT/Td evidence",
        };
      }
      // Reported-only evidence must not alone prove protection.
      if (!evidence.some((label) => !label.includes("(reported)"))) {
        return {
          status: "not_assessed",
          label: CHILD_CARE_CPAB_NOT_ASSESSED,
          evidenceLabel: "Only mother/guardian-reported evidence; keep Not assessed",
        };
      }
      return {
        status: "protected",
        label: CHILD_CARE_CPAB_PROTECTED,
        evidenceLabel: [...evidence, notes].filter(Boolean).join(" · "),
      };
    }
    if (status === "not_protected") {
      return {
        status: "not_protected",
        label: CHILD_CARE_CPAB_NOT_PROTECTED,
        evidenceLabel: [...evidence, notes].filter(Boolean).join(" · "),
      };
    }
  }

  // Legacy path for historical records that relied on a linked mother.
  const evidence = [];
  if (mother && getPatientId(mother)) {
    const { tt, td } = collectDatedTetanusDoses(motherRecords);
    const ttDose = highestCompletedDose(tt, "tt", dob || undefined);
    const tdDose = highestCompletedDose(td, "td", dob || undefined);

    if (ttDose && ["TT2", "TT3", "TT4", "TT5"].includes(ttDose.key)) {
      evidence.push(`${ttDose.key} ${ttDose.date}`);
    }
    if (tdDose && ["TD2", "TD3", "TD4", "TD5"].includes(tdDose.key)) {
      evidence.push(`${tdDose.key} ${tdDose.date}`);
    }
  }

  if (evidence.length > 0) {
    return {
      status: "protected",
      label: CHILD_CARE_CPAB_PROTECTED,
      evidenceLabel: evidence.join(" · "),
    };
  }

  return {
    status: "not_assessed",
    label: CHILD_CARE_CPAB_NOT_ASSESSED,
    evidenceLabel: hasCpabCheckbox
      ? "CPAB marked without verified maternal doses"
      : "",
  };
}

/**
 * Newborn BCG / Hep B timing for paper TCL groups.
 * Same-day vaccination is never auto-classified as within 24 hours without times.
 */
export function formatNewbornVaccineTiming({
  birthDate,
  birthTime,
  dateGiven,
  timeGiven,
} = {}) {
  const vaxDate = normalizeDateValue(dateGiven);
  if (!vaxDate) return { display: "", timingVerified: false, group: "" };

  const birthStamp = combineDateAndTime(birthDate, birthTime);
  const vaxStamp = combineDateAndTime(vaxDate, timeGiven);

  if (birthStamp && vaxStamp && vaxStamp >= birthStamp) {
    const hours = (vaxStamp.getTime() - birthStamp.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) {
      return {
        display: `${vaxDate} · Within 24 hours`,
        timingVerified: true,
        group: "within_24h",
      };
    }
    return {
      display: `${vaxDate} · Beyond 24 hours`,
      timingVerified: true,
      group: "beyond_24h",
    };
  }

  return {
    display: `${vaxDate} · timing unverified`,
    timingVerified: false,
    group: "unverified",
  };
}

function resolveMotherName(child, mother) {
  if (mother) {
    const linkedName = formatPatientName(mother, "");
    if (linkedName) return linkedName;
  }
  return firstFilled(child.motherName, child.mother_name);
}

function getVaccineEntryDisplay(historyByCode, code, child) {
  const entry = historyByCode.get(code);
  if (!entry?.dateGiven) return "";
  if (code === "BCG" || code === "HEPA_B") {
    return formatNewbornVaccineTiming({
      birthDate: patientBirthDate(child),
      birthTime: firstFilled(child.birthTime, child.birth_time),
      dateGiven: entry.dateGiven,
      timeGiven: entry.timeGiven || entry.time_given || "",
    }).display;
  }
  return normalizeDateValue(entry.dateGiven) || String(entry.dateGiven);
}

/**
 * Child Care TCL rows: infants registered at the facility (≤12 months at period end),
 * including those with no vaccine doses. Not filtered by vaccination date alone.
 */
export function buildChildCareTclRows({
  records = [],
  patients = [],
  period,
} = {}) {
  const patientList = Array.isArray(patients) ? patients : [];
  const patientMap = new Map(
    patientList.map((patient) => [getPatientId(patient), patient]).filter(([id]) => id),
  );
  const asOf = parseCalendarDate(period?.end) || new Date();

  const recordsByPatient = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const patientId = getPatientId({
      id: record.patientId || record.patient_id || record.patient?.id,
    });
    if (!patientId) continue;
    if (!recordsByPatient.has(patientId)) recordsByPatient.set(patientId, []);
    recordsByPatient.get(patientId).push(record);
  }

  const eligibleIds = new Set();
  for (const patient of patientList) {
    const id = getPatientId(patient);
    if (!id) continue;
    const dob = patientBirthDate(patient);
    if (dob && isInfantPatient(dob, asOf)) eligibleIds.add(id);
  }

  const rows = [];
  for (const patientId of eligibleIds) {
    const patient = patientMap.get(patientId) || { id: patientId };
    const patientRecords = recordsByPatient.get(patientId) || [];
    const epiRecords = patientRecords.filter(isEpiRecord);
    const historyByCode = compileEpiHistory(epiRecords);

    const motherId = firstFilled(patient.motherPatientId, patient.mother_patient_id);
    const mother = motherId ? patientMap.get(String(motherId)) || null : null;
    const motherRecords = mother
      ? (recordsByPatient.get(getPatientId(mother)) || []).filter(isMaternalRecord)
      : [];

    const cpab = assessChildCpab({
      child: patient,
      mother,
      motherRecords,
      childEpiHistory: historyByCode,
      childEpiRecords: epiRecords,
    });

    const dob = normalizeDateValue(patientBirthDate(patient)) || "";
    const ageLabel = dob ? formatAgeForPeriod(dob, asOf) : "";
    const sex = getPatientSex(patient);

    rows.push({
      key: patientId,
      patientId,
      patientName: formatPatientName(patient, CHILD_CARE_TCL_UNAVAILABLE),
      familySerialNumber: firstFilled(
        patient.familySerialNumber,
        patient.family_serial_number,
      ),
      dateRegistered: getRegistrationDate(patient),
      dateOfBirth: dob,
      ageLabel,
      sex,
      motherName: resolveMotherName(patient, mother),
      cpabLabel: cpab.label,
      cpabEvidence: cpab.evidenceLabel,
      cpabStatus: cpab.status,
      bcgDisplay: getVaccineEntryDisplay(historyByCode, "BCG", patient),
      hepaBDisplay: getVaccineEntryDisplay(historyByCode, "HEPA_B", patient),
      canViewPatient: Boolean(patientId),
    });
  }

  return rows.sort((a, b) => {
    const nameCmp = String(a.patientName).localeCompare(String(b.patientName));
    if (nameCmp !== 0) return nameCmp;
    return String(a.patientId).localeCompare(String(b.patientId));
  });
}

export function countCpabProtectedChildren(rows = []) {
  return rows.filter((row) => row.cpabStatus === "protected").length;
}

export function filterChildCareTclRows(
  rows = [],
  { search = "", cpabFilter = "all" } = {},
) {
  const searchLower = String(search || "").trim().toLowerCase();
  const cpab = String(cpabFilter || "all").trim().toLowerCase();

  return rows.filter((row) => {
    if (cpab && cpab !== "all") {
      if (cpab === "protected" && row.cpabStatus !== "protected") return false;
      if (cpab === "not_assessed" && row.cpabStatus === "protected") return false;
    }

    if (!searchLower) return true;
    const haystack = [
      row.patientName,
      row.familySerialNumber,
      row.motherName,
      row.bcgDisplay,
      row.hepaBDisplay,
      row.cpabLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });
}

export function tclDisplayValue(value, fallback = CHILD_CARE_TCL_UNAVAILABLE) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export { normalizeTimeGiven };
