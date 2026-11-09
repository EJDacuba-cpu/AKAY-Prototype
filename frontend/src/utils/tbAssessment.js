// Pure assessment helpers: safe to use from diagnosis and draft mappers.
export function tbManagementFields(entry = {}) {
  const stored = entry?.tbManagement || entry?.tb_management || {};
  const diagnosisType = String(stored.diagnosisType ?? stored.diagnosis_type ?? "").trim();
  const drugResistance = diagnosisType === "tb_disease"
    ? String(stored.drugResistance ?? stored.drug_resistance ?? "").trim()
    : "";
  return {
    diagnosisType,
    drugResistance,
    openTreatmentCard: diagnosisType === "tb_disease" && drugResistance === "drug_susceptible"
      && (stored.openTreatmentCard === true || stored.open_treatment_card === true),
  };
}

export function tbManagementEntryFields(entry = {}) {
  return entry?.tbManagement || entry?.tb_management
    ? { tbManagement: tbManagementFields(entry) }
    : {};
}

// Consultation drafts/assessments never authorize registration.
export function tbEvaluationEntryFields(entry = {}) {
  const fields = tbManagementEntryFields(entry);
  if (fields.tbManagement) fields.tbManagement.openTreatmentCard = false;
  return fields;
}

export function canConfirmTbDiagnosis(user = {}) {
  return user.role === "rhu" && user.staff_role === "doctor" && String(user.status).toLowerCase() === "active"
    && (user.permissions || []).includes("conditions.confirm");
}

export function tbManagementFor(entry, next = {}) {
  const previous = tbManagementFields(entry);
  const changed = (next.diagnosisType !== undefined && next.diagnosisType !== previous.diagnosisType)
    || (next.drugResistance !== undefined && next.drugResistance !== previous.drugResistance);
  return {
    ...entry,
    tbManagement: tbManagementFields({ tbManagement: {
      ...previous,
      ...next,
      ...(changed ? { openTreatmentCard: false } : {}),
    } }),
  };
}
