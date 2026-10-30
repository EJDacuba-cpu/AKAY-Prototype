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

function recordId(record) {
  return Number(record?.id || 0);
}

function parentForTask(task, parentRecords) {
  const parentId = Number(task?.healthRecordId || task?.originalHealthRecordId || 0);
  if (!parentId) return null;
  return (parentRecords || []).find((record) => recordId(record) === parentId) || null;
}

/** Focus every explicitly selected RHU follow-up; unrelated conditions stay references. */
export function focusedRhuFollowUps({
  tasks = [],
  parentRecords = [],
  conditions = [],
} = {}) {
  const diagnoses = [];
  const linkedTaskIds = [];
  const focusedNames = new Set();
  for (const task of tasks) {
    const one = focusedRhuFollowUp({
      task,
      parentRecord: parentForTask(task, parentRecords),
      conditions,
    });
    if (one.linkedTaskId) linkedTaskIds.push(one.linkedTaskId);
    if (!one.focused) continue;
    diagnoses.push(one.focused);
    focusedNames.add(text(one.focused.name).toLowerCase());
  }
  const references = (conditions || []).filter((condition) => {
    if (!["active", "controlled"].includes(text(condition?.status).toLowerCase())) return false;
    const name = text(condition?.conditionName || condition?.condition_name || condition?.name).toLowerCase();
    return name && !focusedNames.has(name);
  });
  return { diagnoses, references, linkedTaskIds };
}
