import { tbRegistrationAttempt } from "./tbRegistration.js";

export const TB_DOSE_LABELS = { taken: "Supervised dose taken", missed: "Dose missed", incomplete: "Incomplete regimen", on_hold: "Held per RHU instruction", dispensed: "Drugs dispensed (not observed)" };

export function tbMonitoringPayload(fields, endorsement, entry = null) {
  const voided = Boolean(fields.voided);
  const data = { dose_status: voided ? null : fields.doseStatus || null,
    weight_kg: voided || String(fields.weightKg ?? "").trim() === "" ? null : Number(fields.weightKg),
    notes: String(fields.notes || "").trim(), endorsement_id: Number(endorsement.id), endorsement_version: Number(endorsement.version) };
  return entry ? { ...data, version: Number(entry.version), correction_reason: String(fields.reason || "").trim(), voided }
    : { observed_on: fields.observedOn, ...data };
}

export function tbMonitoringErrors(payload, bounds) {
  const errors = {};
  if (payload.version != null) {
    if (!payload.correction_reason) errors.correction_reason = "Enter the reason for this correction.";
  } else {
    const date = payload.observed_on || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || !bounds.start_date || date < bounds.start_date || date > bounds.today) errors.observed_on = "Choose a valid date between the prescribed start and today.";
  }
  if (!payload.voided) {
    if (!payload.dose_status && payload.weight_kg == null) errors.observation = "Record a dose observation or weight.";
    if (payload.dose_status && !TB_DOSE_LABELS[payload.dose_status]) errors.dose_status = "Choose a dose observation.";
    if (payload.weight_kg != null && (!Number.isFinite(payload.weight_kg) || payload.weight_kg <= 0 || payload.weight_kg > 9999.99 || !/^\d+(\.\d{1,2})?$/.test(String(payload.weight_kg)))) errors.weight_kg = "Enter a positive weight with at most two decimal places.";
    if (payload.dose_status === "on_hold" && !payload.notes) errors.notes = "Record the RHU instruction for holding medication.";
  }
  return errors;
}

export function tbMonitoringAttempt(previous, caseId, entryId, payload, createKey) {
  return { ...tbRegistrationAttempt(previous, `${caseId}:${entryId || "new"}`, payload, createKey), caseId, entryId };
}
