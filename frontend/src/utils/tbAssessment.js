// Pure assessment helpers: safe to use from diagnosis and draft mappers.
export function tbManagementFields(entry = {}) {
  const stored = entry?.tbManagement || entry?.tb_management || {};
  const diagnosisType = String(stored.diagnosisType ?? stored.diagnosis_type ?? "").trim();
  const drugResistance = diagnosisType === "tb_disease"
    ? String(stored.drugResistance ?? stored.drug_resistance ?? "").trim()
    : "";
  const isDsTb = diagnosisType === "tb_disease" && drugResistance === "drug_susceptible";
  const treatmentDecision = isDsTb
    ? String(stored.treatmentDecision ?? stored.treatment_decision ?? "").trim()
    : "";
  const dispositionReason = treatmentDecision === "not_yet_initiated" || treatmentDecision === "refer_elsewhere"
    ? String(stored.dispositionReason ?? stored.disposition_reason ?? "").trim()
    : "";
  const dispositionPlan = treatmentDecision === "not_yet_initiated" || treatmentDecision === "refer_elsewhere"
    ? String(stored.dispositionPlan ?? stored.disposition_plan ?? "").trim()
    : "";
  return {
    diagnosisType,
    drugResistance,
    treatmentDecision,
    dispositionReason,
    dispositionPlan,
    openTreatmentCard: treatmentDecision === "initiate_at_rhu",
  };
}

export function tbManagementEntryFields(entry = {}) {
  return entry?.tbManagement || entry?.tb_management
    ? { tbManagement: tbManagementFields(entry) }
    : {};
}

/** Persist evaluation/decision fields; registration itself still happens server-side. */
export function tbEvaluationEntryFields(entry = {}) {
  return tbManagementEntryFields(entry);
}

export function canConfirmTbDiagnosis(user = {}) {
  return user.role === "rhu" && user.staff_role === "doctor" && String(user.status).toLowerCase() === "active"
    && (user.permissions || []).includes("conditions.confirm");
}

export function tbManagementFor(entry, next = {}) {
  const previous = tbManagementFields(entry);
  const diagnosisType = next.diagnosisType !== undefined ? next.diagnosisType : previous.diagnosisType;
  const drugResistance = next.drugResistance !== undefined ? next.drugResistance : previous.drugResistance;
  const typeChanged = next.diagnosisType !== undefined && next.diagnosisType !== previous.diagnosisType;
  const resistanceChanged = next.drugResistance !== undefined && next.drugResistance !== previous.drugResistance;
  const cleared = typeChanged || resistanceChanged;
  const merged = {
    ...previous,
    ...next,
    diagnosisType,
    drugResistance: diagnosisType === "tb_disease" ? drugResistance : "",
    ...(cleared ? {
      treatmentDecision: next.treatmentDecision !== undefined && !typeChanged && !resistanceChanged
        ? next.treatmentDecision
        : "",
      dispositionReason: "",
      dispositionPlan: "",
      openTreatmentCard: false,
    } : {}),
  };
  return {
    ...entry,
    tbManagement: tbManagementFields({ tbManagement: merged }),
  };
}
