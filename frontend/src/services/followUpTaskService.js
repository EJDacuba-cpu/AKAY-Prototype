import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { normalizePatient } from "./patientService";

function normalizeHealthRecord(record = {}) {
  const monitoringData = record.monitoring_data || record.monitoringData || {};
  const patient = record.patient ? normalizePatient(record.patient) : null;

  return {
    ...record,
    id: record.id ? String(record.id) : "",
    patient,
    patientId: record.patient_id ? String(record.patient_id) : record.patientId || "",
    patientName: patient?.name || record.patientName || "",
    category: record.category || record.patientClassification || "",
    chiefComplaint: record.chief_complaint || record.chiefComplaint || "",
    diagnosis: record.diagnosis || "",
    dateOfVisit:
      record.dateOfVisit ||
      record.date_recorded?.slice?.(0, 10) ||
      record.date_recorded ||
      "",
    followUpDate:
      monitoringData.followUpDate ||
      monitoringData.follow_up_date ||
      record.followUpDate ||
      "",
    followUpStatus:
      monitoringData.followUpStatus ||
      monitoringData.follow_up_status ||
      record.followUpStatus ||
      record.status ||
      "Routine Monitoring",
  };
}

export function normalizeFollowUpTask(task = {}) {
  const patient = task.patient ? normalizePatient(task.patient) : null;
  const healthRecord = normalizeHealthRecord(
    task.health_record || task.healthRecord || {},
  );
  const fulfilledByHealthRecord = normalizeHealthRecord(
    task.fulfilled_by_health_record || task.fulfilledByHealthRecord || {},
  );

  return {
    ...task,
    id: task.id ? String(task.id) : "",
    healthRecordId:
      task.health_record_id ? String(task.health_record_id) : task.healthRecordId || "",
    patientId: task.patient_id ? String(task.patient_id) : task.patientId || "",
    barangayHealthCenterId:
      task.barangay_health_center_id || task.barangayHealthCenterId || "",
    dueDate: task.due_date || task.dueDate || "",
    state: task.state || "pending",
    notes: task.notes || "",
    noShowAt: task.no_show_at || task.noShowAt || "",
    rescheduledAt: task.rescheduled_at || task.rescheduledAt || "",
    fulfilledAt: task.fulfilled_at || task.fulfilledAt || "",
    fulfilledByHealthRecordId:
      task.fulfilled_by_health_record_id ||
      task.fulfilledByHealthRecordId ||
      fulfilledByHealthRecord.id ||
      "",
    latestHealthRecordId:
      task.latest_health_record_id ||
      task.latestHealthRecordId ||
      task.fulfilled_by_health_record_id ||
      task.fulfilledByHealthRecordId ||
      fulfilledByHealthRecord.id ||
      "",
    patient,
    healthRecord,
    fulfilledByHealthRecord,
    patientName: patient?.name || healthRecord.patientName || task.patientName || "",
    contact:
      patient?.contactNumber ||
      patient?.contact ||
      task.contact ||
      task.contactNumber ||
      "",
  };
}

export async function getFollowUpTasks(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(
    `/follow-up-tasks${query.size ? `?${query}` : ""}`,
  );
  return unwrapList(response).map(normalizeFollowUpTask);
}

export async function rescheduleFollowUp(taskId, dueDate, notes = "") {
  const response = await apiRequest(`/follow-up-tasks/${taskId}/reschedule`, {
    method: "PATCH",
    body: { due_date: dueDate, notes },
  });
  return normalizeFollowUpTask(unwrapData(response));
}

export default {
  getFollowUpTasks,
  rescheduleFollowUp,
};
