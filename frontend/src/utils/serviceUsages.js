/**
 * RHU service items actually used/administered during a consultation.
 * EPI rows are derived from immunization vaccineEntries (already given).
 * Maternal / Family Planning / Nutrition may add manual usage rows.
 * Inventory reconciliation happens later in To Dispense — not here.
 */

import { PRESCRIPTION_SERVICE_KEYS } from "./rhuPrescriptions.js";

/** Screenings stored in vaccineEntries that are not inventory-reconcile vaccines. */
const ESSENTIAL_NON_VACCINE = Object.freeze(["Newborn Screening"]);

const MANUAL_PROGRAMS = Object.freeze(["Maternal", "Family Planning", "Nutrition"]);
const KNOWN = new Set(PRESCRIPTION_SERVICE_KEYS);

const LIMITS = {
  count: 50,
  id: 64,
  itemDescription: 255,
  unit: 50,
  note: 2000,
};

const text = (value) => String(value ?? "").trim();

const clip = (value, max) => text(value).slice(0, max);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createServiceUsageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `su-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isEssentialNonVaccine(name) {
  const label = text(name).toLowerCase();
  return ESSENTIAL_NON_VACCINE.some((service) => service.toLowerCase() === label);
}

/**
 * Read-only EPI usage references derived from vaccine tracking entries that
 * already have a Date Given. No duplicate data entry.
 */
export function deriveEpiUsagesFromVaccineEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  const rows = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const vaccineName = text(entry.vaccineName);
    if (!vaccineName || isEssentialNonVaccine(vaccineName)) return;
    const dateGiven = text(entry.dateGiven).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateGiven)) return;
    const dose = text(entry.dose);
    const timeGiven = text(entry.timeGiven);
    rows.push({
      id: `epi-derived-${index}`,
      serviceProgram: "EPI",
      itemDescription: clip(`${vaccineName}${dose ? ` ${dose}` : ""}`, LIMITS.itemDescription),
      quantity: 1,
      unit: "dose",
      usedAt: dateGiven,
      note: timeGiven ? `Time given: ${timeGiven}` : "",
      derived: true,
      clinicalSourceHint: { vaccineName, dose, dateGiven, timeGiven, index },
    });
  });
  return rows;
}

export function normalizeServiceUsages(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = clip(item.id, LIMITS.id) || createServiceUsageId();
    if (seen.has(id)) continue;
    seen.add(id);
    const serviceProgram = clip(item.serviceProgram ?? item.service_program, 64);
    if (!MANUAL_PROGRAMS.includes(serviceProgram)) continue;
    rows.push({
      id,
      serviceProgram,
      itemDescription: clip(item.itemDescription ?? item.item_description, LIMITS.itemDescription),
      quantity: (() => {
        const raw = item.quantity;
        if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
        if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
          const n = Number(raw.trim());
          return n >= 1 ? n : "";
        }
        return raw == null || raw === "" ? "" : raw;
      })(),
      unit: clip(item.unit, LIMITS.unit),
      usedAt: text(item.usedAt ?? item.used_at).slice(0, 10),
      note: clip(item.note, LIMITS.note),
      derived: false,
    });
    if (rows.length >= LIMITS.count) break;
  }
  return rows;
}

export function serviceUsagesForSave(list) {
  return normalizeServiceUsages(list)
    .filter((row) => text(row.itemDescription) && Number(row.quantity) >= 1 && text(row.unit))
    .map((row) => ({
      id: row.id,
      serviceProgram: row.serviceProgram,
      itemDescription: row.itemDescription,
      quantity: Number(row.quantity),
      unit: row.unit,
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(row.note ? { note: row.note } : {}),
    }));
}

export function serviceUsageErrors(list, selectedPrograms = []) {
  const errors = {};
  const selected = new Set((Array.isArray(selectedPrograms) ? selectedPrograms : []).filter((p) => KNOWN.has(p)));
  const rows = normalizeServiceUsages(list);
  if (rows.length > LIMITS.count) {
    errors.serviceUsages = "Too many service usage entries.";
    return errors;
  }
  const seen = new Set();
  for (const row of rows) {
    const key = `serviceUsages.${row.id}`;
    if (seen.has(row.id)) {
      errors[`${key}.id`] = "Each service usage needs a distinct id.";
      continue;
    }
    seen.add(row.id);
    if (!selected.has(row.serviceProgram)) {
      errors[`${key}.serviceProgram`] = "That health service was not selected for this consultation.";
    }
    if (!text(row.itemDescription)) {
      errors[`${key}.itemDescription`] = "Enter the item that was used.";
    }
    const qty = Number(row.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      errors[`${key}.quantity`] = "Quantity must be a whole number of at least 1.";
    }
    if (!text(row.unit)) {
      errors[`${key}.unit`] = "Enter the unit.";
    }
  }
  return errors;
}

/** Service-linked-only prescriptions left from the removed Selected Health Services Rx block. */
export function legacyServiceOnlyPrescriptions(prescriptions = []) {
  if (!Array.isArray(prescriptions)) return [];
  return prescriptions.filter((rx) => {
    if (!isRecord(rx)) return false;
    const diagnosisIds = Array.isArray(rx.diagnosisIds) ? rx.diagnosisIds.filter(Boolean) : [];
    const serviceKeys = Array.isArray(rx.serviceKeys)
      ? rx.serviceKeys.filter((key) => KNOWN.has(key))
      : [];
    return diagnosisIds.length === 0 && serviceKeys.length > 0;
  });
}

export function manualProgramsAvailable(selectedPrograms = []) {
  return (Array.isArray(selectedPrograms) ? selectedPrograms : []).filter((p) =>
    MANUAL_PROGRAMS.includes(p));
}

export { MANUAL_PROGRAMS };
