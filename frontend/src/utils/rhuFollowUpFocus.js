import { emptyRhuDiagnosis, matchingMonitorableCondition } from "./rhuCarePlan.js";

function text(value) {
  return String(value ?? "").trim();
}

function purposeEntryId(purposeKey) {
  const key = text(purposeKey);
  return key.startsWith("entry:") ? key.slice("entry:".length) : "";
}

function parentDiagnoses(record) {
  const list = record?.diagnoses || record?.diagnosis_entries || [];
  return Array.isArray(list) ? list : [];
}

function diagnosisName(entry) {
  return text(entry?.name || entry?.conditionName || entry?.condition_name);
}

function monitorableReferences(conditions, focusedName) {
  const focused = text(focusedName).toLowerCase();
  return (conditions || []).filter((condition) => {
    if (!["active", "controlled"].includes(text(condition?.status).toLowerCase())) return false;
    const name = text(condition?.conditionName || condition?.condition_name || condition?.name);
    return name.toLowerCase() !== focused;
  });
}

export function continuedDiagnosisFromCondition(condition, id) {
  const name = diagnosisName(condition) || "Continued condition";
  return {
    ...emptyRhuDiagnosis(name, id || `continued:${condition?.id || name}`),
    continued: true,
    continuedConditionId: condition?.id || null,
    activate: false,
  };
}

export function focusedRhuFollowUp({
  task = null,
  parentRecord = null,
  conditions = [],
} = {}) {
  if (!task) {
    return { focused: null, diagnoses: [], references: [], linkedTaskId: null };
  }

  const entryId = purposeEntryId(task.purposeKey || task.purpose_key);
  const diagnoses = parentDiagnoses(parentRecord);
  const matched = entryId
    ? diagnoses.find((entry) => text(entry?.id) === entryId)
    : null;
  const focusedName = diagnosisName(matched) || text(task.purpose || task.reason);
  const condition = focusedName ? matchingMonitorableCondition(focusedName, conditions) : null;
  const focused = focusedName
    ? {
        ...continuedDiagnosisFromCondition(condition || { name: focusedName }, matched?.id || entryId || `follow-up:${task.id}`),
        name: focusedName,
      }
    : null;

  return {
    focused,
    diagnoses: focused ? [focused] : [],
    references: monitorableReferences(conditions, focusedName),
    linkedTaskId: Number(task.id) || null,
  };
}
