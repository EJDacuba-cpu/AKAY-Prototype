/** Build the searchable text for a follow-up task (list + calendar). */
export function followUpSearchHaystack(task = {}) {
  const recordId = task.healthRecordId;
  const followUpId = task?.id != null ? `FU-${task.id}` : "";
  const record = task.healthRecord || {};

  return [
    task.patientName,
    task.patient?.name,
    task.patientId,
    recordId,
    recordId ? `Record #${recordId}` : "",
    recordId ? `record ${recordId}` : "",
    followUpId,
    task.id,
    record.chiefComplaint,
    task.programLabel,
    task.serviceType,
    task.classification,
    task.category,
    task.patientClassification,
    task.recordType,
    record.category,
    record.patientClassification,
    record.recordType,
    ...(Array.isArray(record.selectedPrograms) ? record.selectedPrograms : []),
    task.contact,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesFollowUpSearch(task, searchValue) {
  const needle = String(searchValue || "").trim().toLowerCase();
  if (!needle) return true;
  return followUpSearchHaystack(task).includes(needle);
}
