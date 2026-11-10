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
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

export const SCREENING_DATE_SOURCES = Object.freeze({
  bhc_screening: "Documented BHC screening date",
  referral_fallback: "Referral date used — confirm screening date",
  rhu_visit: "RHU visit / consultation date",
});

export function withTbRegimenRows(regimen, rows) {
  return { ...regimen, rows };
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
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
        description: regimenDescription,
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
      regimen: {
        ...fallback.card_data.regimen,
        ...(value.card_data?.regimen || {}),
        rows: Array.isArray(value.card_data?.regimen?.rows) && value.card_data.regimen.rows.length
          ? value.card_data.regimen.rows
          : fallback.card_data.regimen.rows,
      },
    },
  };
}

export function tbRegistrationPayload({ reportingYear, caseNumber, sourceRevision, confirmed, cardData, treatmentStartDate }) {
  const card = Object.fromEntries(Object.entries(editable).map(([group, keys]) => [group, pick(cardData[group], keys)]));
  card.regimen = {
    ...pick(cardData.regimen, ["description", "weightKg"]),
    rows: (cardData.regimen?.rows || []).map(row => pick(row, ["dateStart", ...doses, "strength", "unit"])),
  };
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
  if (data.classification?.anatomicalSite === "extrapulmonary" && !data.classification.extrapulmonarySite?.trim()) errors["card_data.classification.extrapulmonarySite"] = "Specify the extra-pulmonary site.";
  const regimen = data.regimen || {};
  if (!regimen.description?.trim()) errors["card_data.regimen.description"] = "Enter the physician-prescribed regimen.";
  if (!(Number(regimen.weightKg) > 0)) errors["card_data.regimen.weightKg"] = "Enter a positive baseline weight in kg.";
  if (!regimen.rows?.length) errors["card_data.regimen.rows"] = "Enter a prescribed dosage row.";
  for (const [index, row] of (regimen.rows || []).entries()) {
    const prefix = `card_data.regimen.rows.${index}`;
    for (const field of ["dateStart", "strength", "unit"]) {
      if (!String(row[field] || "").trim()) errors[`${prefix}.${field}`] = `Regimen row ${index + 1}: ${field === "dateStart" ? "start date" : field} is required.`;
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
