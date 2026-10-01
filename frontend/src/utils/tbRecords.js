const TB_CATEGORY = "TB DOTS / TB Monitoring";

function hasContent(value) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) =>
    entry && typeof entry === "object" ? hasContent(entry) : entry !== null && entry !== undefined && String(entry).trim() !== "",
  );
}

/**
 * A TB record: saved TB-DOTS data (new records are General Consultation or a
 * service category), or - for records saved before the Care Plan change - the
 * TB category or a "TB" program selection.
 */
export function isTbRecord(record = {}) {
  if ((record.category || record.recordType || record.patientClassification) === TB_CATEGORY) return true;
  const programs = record.selectedPrograms ?? record.monitoringData?.selectedPrograms ?? record.monitoring_data?.selectedPrograms;
  if (Array.isArray(programs) && programs.includes("TB")) return true;
  return hasContent(record.tb_data ?? record.tbData);
}
