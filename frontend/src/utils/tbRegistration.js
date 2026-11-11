import { createIdempotencyKey } from "./idempotency.js";

const editable = {
  caseFinding: ["ntpFacilityCode", "provinceHuc", "region", "referredBy", "screeningCategory", "dateOfScreening"],
  diagnosis: ["dateOfNotification"],
  classification: ["bacteriologicalStatus", "anatomicalSite", "extrapulmonarySite", "registrationGroup"],
  comorbidities: ["hivStatus", "hivTestDate", "artStatus", "artStartDate", "cptStatus", "cptStartDate", "otherComorbidities"],
  treatmentSupporter: ["locationOfTreatment", "supporterName", "supporterDesignation", "supporterType", "contactInfo", "datSupported", "scheduleOfTreatment"],
  phases: ["intensiveStart", "intensiveEnd", "continuationStart", "continuationEnd"],
};
const doses = ["drug4fdc", "drug2fdc", "drugH", "drugR", "drugZ", "drugE"];
const REGIMEN_PHASES = Object.freeze(["intensive", "continuation", "individualized"]);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

export const SCREENING_DATE_SOURCES = Object.freeze({
  bhc_screening: "Documented BHC screening date",
  referral_fallback: "Referral date used — confirm screening date",
  rhu_visit: "RHU visit / consultation date",
});

export const TB_REGIMEN_CODES = Object.freeze({
  standard_2hrze_4hr: "2hrze_4hr",
  standard_2hrze_10hr: "2hrze_10hr",
  other: "other",
});

export const TB_REGIMEN_CODE_OPTIONS = Object.freeze([
  { value: TB_REGIMEN_CODES.standard_2hrze_4hr, label: "Standard DS-TB regimen: 2HRZE/4HR" },
  { value: TB_REGIMEN_CODES.standard_2hrze_10hr, label: "Extended regimen: 2HRZE/10HR" },
  { value: TB_REGIMEN_CODES.other, label: "Other / Individualized Regimen" },
]);

export const TB_REGIMEN_PHASE_OPTIONS = Object.freeze([
  { value: "intensive", label: "Intensive Phase" },
  { value: "continuation", label: "Continuation Phase" },
  { value: "individualized", label: "Individualized / Single-Drug Regimen" },
]);

export const TB_EPTB_SITE_OPTIONS = Object.freeze([
  { value: "lymph_node", label: "Lymph node" },
  { value: "pleural", label: "Pleural" },
  { value: "bones_joints", label: "Bones/joints" },
  { value: "cns_meningitis", label: "CNS/meningitis" },
  { value: "genitourinary", label: "Genitourinary" },
  { value: "abdominal", label: "Abdominal" },
  { value: "other", label: "Other" },
]);

const EPTB_LABEL_BY_CODE = Object.fromEntries(TB_EPTB_SITE_OPTIONS.map((option) => [option.value, option.label]));
const EPTB_CODE_BY_LABEL = Object.fromEntries(
  TB_EPTB_SITE_OPTIONS
    .filter((option) => option.value !== "other")
    .map((option) => [option.label.toLowerCase(), option.value]),
);

const REGIMEN_LABEL_BY_CODE = Object.freeze({
  [TB_REGIMEN_CODES.standard_2hrze_4hr]: "2HRZE/4HR",
  [TB_REGIMEN_CODES.standard_2hrze_10hr]: "2HRZE/10HR",
});

export function withTbRegimenRows(regimen, rows) {
  return { ...regimen, rows };
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

export function isValidRegimenPhase(phase) {
  return REGIMEN_PHASES.includes(String(phase || "").trim());
}

export function isInvalidRegimenDescription(description) {
  const text = String(description || "").trim();
  if (!text) return true;
  return text.toLowerCase() === "none";
}

export function regimenDescriptionForCode(code, otherText = "") {
  if (code === TB_REGIMEN_CODES.standard_2hrze_4hr) return REGIMEN_LABEL_BY_CODE[code];
  if (code === TB_REGIMEN_CODES.standard_2hrze_10hr) return REGIMEN_LABEL_BY_CODE[code];
  return String(otherText || "").trim();
}

export function resolveRegimenCode(regimen = {}) {
  const code = String(regimen.code || "").trim();
  if (code === TB_REGIMEN_CODES.standard_2hrze_4hr
    || code === TB_REGIMEN_CODES.standard_2hrze_10hr
    || code === TB_REGIMEN_CODES.other) {
    return code;
  }
  const description = String(regimen.description || "").trim().toUpperCase().replace(/\s+/g, "");
  if (description === "2HRZE/4HR") return TB_REGIMEN_CODES.standard_2hrze_4hr;
  if (description === "2HRZE/10HR") return TB_REGIMEN_CODES.standard_2hrze_10hr;
  if (String(regimen.description || "").trim()) return TB_REGIMEN_CODES.other;
  return "";
}

export function formatExtrapulmonarySite(code, otherText = "") {
  const key = String(code || "").trim();
  if (!key) return "";
  if (key === "other" || key === "legacy") {
    const detail = String(otherText || "").trim();
    return detail ? (key === "legacy" ? detail : `Other: ${detail}`) : (key === "other" ? "Other:" : "");
  }
  return EPTB_LABEL_BY_CODE[key] || String(otherText || key).trim();
}

export function parseExtrapulmonarySite(value) {
  const raw = String(value || "").trim();
  if (!raw) return { code: "", otherText: "" };
  const otherMatch = /^other\s*:\s*(.*)$/i.exec(raw);
  if (otherMatch) return { code: "other", otherText: String(otherMatch[1] || "").trim() };
  const byLabel = EPTB_CODE_BY_LABEL[raw.toLowerCase()];
  if (byLabel) return { code: byLabel, otherText: "" };
  if (EPTB_LABEL_BY_CODE[raw]) return { code: raw, otherText: "" };
  return { code: "legacy", otherText: raw };
}

/** DOH NTP MOP 6th Ed. Table 7 adult FDC bands. Null when outside verified integer bands. */
export function adultFdcDailyTablets(weightKg) {
  const weight = Number(weightKg);
  if (!Number.isFinite(weight)) return null;
  if (weight >= 25 && weight <= 37) return 2;
  if (weight >= 38 && weight <= 54) return 3;
  if (weight >= 55 && weight <= 70) return 4;
  if (weight > 70) return 5;
  return null;
}

export function canShowAdultFdcReference({ ageYears, weightKg, regimenCode } = {}) {
  if (!Number.isFinite(Number(ageYears)) || Number(ageYears) < 18) return false;
  if (regimenCode !== TB_REGIMEN_CODES.standard_2hrze_4hr && regimenCode !== TB_REGIMEN_CODES.standard_2hrze_10hr) {
    return false;
  }
  return adultFdcDailyTablets(weightKg) != null;
}

export function materialPrescriptionSignature(cardData = {}) {
  const classification = cardData.classification || {};
  const regimen = cardData.regimen || {};
  return JSON.stringify({
    bacteriologicalStatus: classification.bacteriologicalStatus || "",
    anatomicalSite: classification.anatomicalSite || "",
    extrapulmonarySite: classification.extrapulmonarySite || "",
    registrationGroup: classification.registrationGroup || "",
    code: regimen.code || "",
    description: String(regimen.description || "").trim(),
    weightKg: String(regimen.weightKg ?? ""),
    rows: (regimen.rows || []).map((row) => ({
      phase: row?.phase || "",
      dateStart: row?.dateStart || "",
      drug4fdc: row?.drug4fdc ?? "",
      drug2fdc: row?.drug2fdc ?? "",
      drugH: row?.drugH ?? "",
      drugR: row?.drugR ?? "",
      drugZ: row?.drugZ ?? "",
      drugE: row?.drugE ?? "",
      strength: row?.strength || "",
      unit: row?.unit || "",
    })),
  });
}

/** Prefer documented screening date; otherwise label referral or visit fallbacks. */
export function screeningPrefillFromVisit(visit = {}, { today = new Date() } = {}) {
  const referral = visit?.referral || {};
  const documented = dateOnly(
    referral.screening_date
    || referral.screeningDate
    || referral.date_of_screening
    || referral.dateOfScreening,
  );
  if (documented) {
    return { dateOfScreening: documented, screeningDateSource: "bhc_screening", referralSourceLabel: referral.sending_bhc?.name || referral.sendingBhc?.name || referral.barangay_health_center?.name || "BHC referral" };
  }
  const referralDate = dateOnly(referral.referral_datetime || referral.referralDateTime || referral.date);
  if (visit?.referral?.id || visit?.referral_id || referralDate) {
    return {
      dateOfScreening: referralDate || dateOnly(visit.consultationDate || visit.date || visit.checked_in_at || visit.checkedInAt || today.toISOString()),
      screeningDateSource: referralDate ? "referral_fallback" : "rhu_visit",
      referralSourceLabel: referral.sending_bhc?.name || referral.sendingBhc?.name || "BHC referral",
    };
  }
  return {
    dateOfScreening: dateOnly(visit.consultationDate || visit.date || visit.checked_in_at || visit.checkedInAt || today.toISOString()),
    screeningDateSource: "rhu_visit",
    referralSourceLabel: "RHU walk-in",
  };
}

export function emptyTbCaseRegistration({
  visit = {},
  reportingYear = new Date().getFullYear(),
  createKey = createIdempotencyKey,
  weightKg = "",
  prescriptionText = "",
} = {}) {
  const screening = screeningPrefillFromVisit(visit);
  const weight = Number(weightKg) > 0 ? String(weightKg) : "";
  const regimenDescription = String(prescriptionText || "").trim().slice(0, 2000);
  const resolvedCode = resolveRegimenCode({ description: regimenDescription });
  return {
    registration_key: createKey(),
    reporting_year: Number(reportingYear),
    case_number: "",
    treatment_start_date: "",
    confirmed: false,
    screeningDateSource: screening.screeningDateSource,
    referralSourceLabel: screening.referralSourceLabel,
    card_data: {
      caseFinding: {
        ntpFacilityCode: "",
        provinceHuc: "",
        region: "",
        referredBy: "",
        screeningCategory: "",
        dateOfScreening: screening.dateOfScreening,
      },
      diagnosis: { dateOfNotification: "" },
      classification: {
        bacteriologicalStatus: "",
        anatomicalSite: "",
        extrapulmonarySite: "",
        registrationGroup: "",
      },
      comorbidities: {},
      regimen: {
        code: resolvedCode && !isInvalidRegimenDescription(regimenDescription) ? resolvedCode : "",
        description: isInvalidRegimenDescription(regimenDescription) ? "" : regimenDescription,
        weightKg: weight,
        rows: [{ dateStart: "", drug4fdc: "", drug2fdc: "", drugH: "", drugR: "", drugZ: "", drugE: "", strength: "", unit: "" }],
      },
      treatmentSupporter: {},
      phases: {},
    },
  };
}

export function normalizeTbCaseRegistration(value, { visit = {}, createKey = createIdempotencyKey } = {}) {
  const fallback = emptyTbCaseRegistration({ visit, createKey });
  if (!value || typeof value !== "object") return fallback;
  const mergedRegimen = {
    ...fallback.card_data.regimen,
    ...(value.card_data?.regimen || {}),
    rows: Array.isArray(value.card_data?.regimen?.rows) && value.card_data.regimen.rows.length
      ? value.card_data.regimen.rows
      : fallback.card_data.regimen.rows,
  };
  if (!mergedRegimen.code) {
    mergedRegimen.code = resolveRegimenCode(mergedRegimen);
  }
  return {
    ...fallback,
    ...value,
    registration_key: String(value.registration_key || fallback.registration_key),
    reporting_year: Number(value.reporting_year || fallback.reporting_year),
    case_number: value.case_number == null ? "" : String(value.case_number),
    treatment_start_date: dateOnly(value.treatment_start_date || value.treatmentStartDate || fallback.treatment_start_date),
    confirmed: Boolean(value.confirmed),
    screeningDateSource: value.screeningDateSource || fallback.screeningDateSource,
    referralSourceLabel: value.referralSourceLabel || fallback.referralSourceLabel,
    card_data: {
      ...fallback.card_data,
      ...(value.card_data || {}),
      caseFinding: { ...fallback.card_data.caseFinding, ...(value.card_data?.caseFinding || {}) },
      diagnosis: { ...fallback.card_data.diagnosis, ...(value.card_data?.diagnosis || {}) },
      classification: { ...fallback.card_data.classification, ...(value.card_data?.classification || {}) },
      regimen: mergedRegimen,
    },
  };
}

export function tbRegistrationPayload({ reportingYear, caseNumber, sourceRevision, confirmed, cardData, treatmentStartDate }) {
  const card = Object.fromEntries(Object.entries(editable).map(([group, keys]) => [group, pick(cardData[group], keys)]));
  const regimen = cardData.regimen || {};
  card.regimen = {
    ...pick(regimen, ["description", "weightKg", "code"]),
    rows: (regimen.rows || []).map((row) => {
      const next = pick(row, ["dateStart", ...doses, "strength", "unit", "phase"]);
      if (!isValidRegimenPhase(next.phase)) delete next.phase;
      return next;
    }),
  };
  if (!card.regimen.code) {
    const resolved = resolveRegimenCode(card.regimen);
    if (resolved) card.regimen.code = resolved;
  }
  const start = dateOnly(treatmentStartDate);
  if (start && !card.phases?.intensiveStart) {
    card.phases = { ...(card.phases || {}), intensiveStart: start };
  }
  return {
    reporting_year: Number(reportingYear),
    case_number: caseNumber?.trim() || null,
    source_revision: sourceRevision,
    confirmed: Boolean(confirmed),
    treatment_start_date: start || null,
    card_data: card,
  };
}

export function tbRegistrationErrors(payload) {
  const errors = {};
  if (!Number.isInteger(payload.reporting_year) || payload.reporting_year < 1900 || payload.reporting_year > 9999) errors.reporting_year = "Enter a valid reporting year.";
  if (!payload.confirmed) errors.confirmed = "Confirm that you reviewed the diagnostic evidence and prescription.";
  if (!dateOnly(payload.treatment_start_date)) errors.treatment_start_date = "Enter the actual treatment start date.";
  const data = payload.card_data || {};
  for (const [field, label] of [["bacteriologicalStatus", "Bacteriological status"], ["anatomicalSite", "Anatomical site"], ["registrationGroup", "Registration group"]]) {
    if (!data.classification?.[field]) errors[`card_data.classification.${field}`] = `${label} is required.`;
  }
  const anatomicalSite = data.classification?.anatomicalSite;
  const epSite = String(data.classification?.extrapulmonarySite || "").trim();
  if (anatomicalSite === "extrapulmonary") {
    const parsed = parseExtrapulmonarySite(epSite);
    if (!epSite || (parsed.code === "other" && !parsed.otherText)) {
      errors["card_data.classification.extrapulmonarySite"] = "Specify the extra-pulmonary site.";
    }
  }
  const regimen = data.regimen || {};
  const code = resolveRegimenCode(regimen);
  if (code && ![TB_REGIMEN_CODES.standard_2hrze_4hr, TB_REGIMEN_CODES.standard_2hrze_10hr, TB_REGIMEN_CODES.other].includes(code)) {
    errors["card_data.regimen.code"] = "Select a physician-authorized regimen.";
  }
  if (isInvalidRegimenDescription(regimen.description)) {
    errors["card_data.regimen.description"] = "Enter the physician-prescribed regimen.";
  } else if (code === TB_REGIMEN_CODES.other && !String(regimen.description || "").trim()) {
    errors["card_data.regimen.description"] = "Enter the physician-prescribed regimen.";
  }
  if (!(Number(regimen.weightKg) > 0)) errors["card_data.regimen.weightKg"] = "Enter a positive baseline weight in kg.";
  if (!regimen.rows?.length) errors["card_data.regimen.rows"] = "Enter a prescribed dosage row.";
  for (const [index, row] of (regimen.rows || []).entries()) {
    const prefix = `card_data.regimen.rows.${index}`;
    for (const field of ["dateStart", "strength", "unit"]) {
      if (!String(row[field] || "").trim()) errors[`${prefix}.${field}`] = `Regimen row ${index + 1}: ${field === "dateStart" ? "start date" : field} is required.`;
    }
    if (row.phase != null && String(row.phase).trim() !== "" && !isValidRegimenPhase(row.phase)) {
      errors[`${prefix}.phase`] = `Regimen row ${index + 1}: select a valid treatment phase.`;
    }
    for (const field of doses) {
      if (row[field] !== "" && row[field] != null && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) errors[`${prefix}.${field}`] = `Regimen row ${index + 1}: doses must be nonnegative numbers.`;
    }
    if (!doses.some(field => Number(row[field]) > 0)) errors[prefix] = `Regimen row ${index + 1}: enter at least one positive prescribed dose.`;
  }
  return errors;
}

export function tbRegistrationAttempt(previous, sourceId, payload, createKey = createIdempotencyKey) {
  const fingerprint = JSON.stringify([String(sourceId), payload]);
  if (previous?.fingerprint === fingerprint) return previous;
  return { key: createKey(), sourceId, payload: structuredClone(payload), fingerprint };
}

export async function registerOrRecoverTbCase(attempt, write, read) {
  try {
    return await write(attempt);
  } catch (failure) {
    if (failure.isNetworkError || failure.status >= 500) {
      const recovered = await read().catch(() => null);
      if (recovered?.case && String(recovered.case.source_health_record_id) === String(attempt.sourceId)) return recovered.case;
    }
    throw failure;
  }
}
