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

export function withTbRegimenRows(regimen, rows) {
  return { ...regimen, rows };
}

export function tbRegistrationPayload({ reportingYear, caseNumber, sourceRevision, confirmed, cardData }) {
  const card = Object.fromEntries(Object.entries(editable).map(([group, keys]) => [group, pick(cardData[group], keys)]));
  card.regimen = {
    ...pick(cardData.regimen, ["description", "weightKg"]),
    rows: (cardData.regimen?.rows || []).map(row => pick(row, ["dateStart", ...doses, "strength", "unit"])),
  };
  return { reporting_year: Number(reportingYear), case_number: caseNumber?.trim() || null,
    source_revision: sourceRevision, confirmed: Boolean(confirmed), card_data: card };
}

export function tbRegistrationErrors(payload) {
  const errors = {};
  if (!Number.isInteger(payload.reporting_year) || payload.reporting_year < 1900 || payload.reporting_year > 9999) errors.reporting_year = "Enter a valid reporting year.";
  if (!payload.confirmed) errors.confirmed = "Confirm that you reviewed the diagnostic evidence and prescription.";
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
