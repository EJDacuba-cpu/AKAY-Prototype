/**
 * Read-only display helpers for the BHC/RHU Follow-ups list.
 * Condition labels come only from an explicit diagnosis link on the task —
 * never from guessing against free-text purpose.
 */

function text(value) {
  return String(value ?? "").trim();
}

function purposeKeyOf(task = {}) {
  return text(task.purposeKey || task.purpose_key);
}

function sourceEntryIdOf(task = {}) {
  return text(task.sourceEntryId || task.source_entry_id);
}

/** Diagnosis entry id when purpose_key is entry:{id} or source_entry_id is set. */
export function followUpLinkedEntryId(task = {}) {
  const key = purposeKeyOf(task);
  if (key.startsWith("entry:")) return key.slice("entry:".length);
  return sourceEntryIdOf(task);
}

function parentDiagnoses(record = {}) {
  const list = record.diagnoses || record.diagnosis_entries || record.diagnosisEntries || [];
  return Array.isArray(list) ? list : [];
}

/**
 * Condition name only when the task links to a diagnosis on the source record.
 * Returns "" when there is no linkage or the linked entry is missing.
 */
export function getFollowUpConditionLabel(task = {}) {
  const entryId = followUpLinkedEntryId(task);
  if (!entryId) return "";
  const record = task.healthRecord || task.health_record || {};
  const matched = parentDiagnoses(record).find((entry) => text(entry?.id) === entryId);
  return text(matched?.name || matched?.conditionName || matched?.condition_name);
}

/** Saved follow-up purpose/reason only — never invented. */
export function getFollowUpReasonText(task = {}) {
  return text(task.purpose || task.reason);
}

/**
 * Rows for the Follow-up Reason column: optional linked condition, then saved purpose.
 * Omits a duplicate purpose when it exactly matches the condition name.
 */
export function getFollowUpReasonDisplay(task = {}) {
  const condition = getFollowUpConditionLabel(task);
  const purpose = getFollowUpReasonText(task);
  if (condition && purpose && purpose.toLowerCase() === condition.toLowerCase()) {
    return { condition, purpose: "" };
  }
  return { condition, purpose };
}
