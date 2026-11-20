import { applyEstablishedTbDiseaseAssessment } from "./establishedTbDisease.js";
import { followUpLinkedEntryId } from "../components/features/followups/followUpListDisplay.js";
import { entryDestinations } from "./reportingEntries.js";
import { emptyRhuDiagnosis, matchingMonitorableCondition } from "./rhuCarePlan.js";
import { tbManagementFields, tbManagementFor } from "./tbAssessment.js";

function text(value) {
  return String(value ?? "").trim();
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
  establishedLock = null,
} = {}) {
  if (!task) {
    return { focused: null, diagnoses: [], references: [], linkedTaskId: null };
  }

  const entryId = followUpLinkedEntryId(task);
  const diagnoses = parentDiagnoses(parentRecord);
  const matched = entryId
    ? diagnoses.find((entry) => text(entry?.id) === entryId)
    : null;
  const focusedName = diagnosisName(matched) || text(task.purpose || task.reason);
  const condition = focusedName ? matchingMonitorableCondition(focusedName, conditions) : null;
  let focused = focusedName
    ? {
        ...continuedDiagnosisFromCondition(condition || { name: focusedName }, matched?.id || entryId || `follow-up:${task.id}`),
        name: focusedName,
      }
    : null;

  if (focused && matched) {
    const parentManagement = tbManagementFields(matched);
    if (parentManagement.diagnosisType) {
      focused = tbManagementFor(focused, {
        diagnosisType: parentManagement.diagnosisType,
        drugResistance: parentManagement.drugResistance,
        tbCaseNumber: parentManagement.tbCaseNumber,
      });
    }
  }
  if (focused) {
    focused = applyEstablishedTbDiseaseAssessment(focused, establishedLock);
  }

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
  return (parentRecords || []).find((record) => recordId(record) === parentId) || task.healthRecord || null;
}

/** Reporting belongs to the visit where this particular diagnosis was classified. */
export function reportedFollowUpDiagnosisIds(tasks, patientRecords) {
  const reported = new Set();
  if (!tasks.length) return reported;
  const records = new Map(patientRecords.map((record) => [recordId(record), record]));
  for (const task of tasks) {
    const entryId = followUpLinkedEntryId(task);
    if (!entryId) continue;
    const seen = new Set();
    const sources = [
      records.get(Number(task.originalHealthRecordId)),
      task.healthRecord,
      records.get(Number(task.healthRecordId)),
    ];
    while (sources.length) {
      const record = sources.pop();
      if (!record || seen.has(record)) continue;
      seen.add(record);
      const entry = parentDiagnoses(record).find((item) => text(item.id) === entryId);
      if (entryDestinations(entry).length) {
        reported.add(entryId);
        break;
      }
      sources.push(record.parent_record, records.get(Number(record.parentHealthRecordId || record.parent_health_record_id)));
    }
  }
  return reported;
}

export function excludePriorReportSelections(diagnoses, reportedIds) {
  if (!reportedIds.size) return diagnoses;
  return diagnoses.map((entry) => reportedIds.has(entry.id) && entryDestinations(entry).length
    ? { ...entry, reportIn: [], reportAs: null, includeInSurveillance: false }
    : entry);
}

/** Focus every explicitly selected RHU follow-up; unrelated conditions stay references. */
export function focusedRhuFollowUps({
  tasks = [],
  parentRecords = [],
  conditions = [],
  establishedLock = null,
} = {}) {
  const diagnoses = [];
  const linkedTaskIds = [];
  const focusedNames = new Set();
  for (const task of tasks) {
    const one = focusedRhuFollowUp({
      task,
      parentRecord: parentForTask(task, parentRecords),
      conditions,
      establishedLock,
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
