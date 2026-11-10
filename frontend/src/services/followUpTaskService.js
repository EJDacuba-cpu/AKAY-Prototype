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
    treatmentNotes: record.treatment_notes || record.treatmentNotes || "",
    notes: record.notes || "",
    visitType: record.visit_type || record.visitType || "",
    parentHealthRecordId:
      record.parent_health_record_id || record.parentHealthRecordId || "",
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
    originalHealthRecordId:
      task.original_health_record_id
        ? String(task.original_health_record_id)
        : task.originalHealthRecordId ||
          (task.health_record_id ? String(task.health_record_id) : task.healthRecordId || ""),
    patientId: task.patient_id ? String(task.patient_id) : task.patientId || "",
    barangayHealthCenterId:
      task.barangay_health_center_id || task.barangayHealthCenterId || "",
    dueDate: task.due_date || task.dueDate || "",
    purpose: task.purpose || task.reason || "",
    purposeKey: task.purpose_key || task.purposeKey || "",
    sourceEntryId: task.source_entry_id || task.sourceEntryId || "",
    state: task.state || "pending",
    notes: task.notes || "",
    noShowAt: task.no_show_at || task.noShowAt || "",
    rescheduledAt: task.rescheduled_at || task.rescheduledAt || "",
    cancelledAt: task.cancelled_at || task.cancelledAt || "",
    fulfilledAt: task.fulfilled_at || task.fulfilledAt || "",
    fulfilledByHealthRecordId:
      task.fulfilled_by_health_record_id ||
      task.fulfilledByHealthRecordId ||
      fulfilledByHealthRecord.id ||
      "",
    // Set once this task has been superseded by a reschedule - it's no
    // longer the current/active row for its health record. Only the
    // /follow-up-tasks/calendar endpoint still returns rows like this; the
    // List endpoint (getFollowUpTasks) excludes them server-side.
    rescheduledToId:
      task.rescheduled_to_id != null
        ? String(task.rescheduled_to_id)
        : task.rescheduledToId
          ? String(task.rescheduledToId)
          : "",
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
    dueTime: task.due_time || task.dueTime || "",
    practitioner: task.practitioner
      ? {
          id: String(task.practitioner.id),
          name: task.practitioner.name || "",
        }
      : task.practitioner_id || task.practitionerId
        ? { id: String(task.practitioner_id || task.practitionerId), name: "" }
        : null,
  };
}

export async function getFollowUpTasks(params = {}) {
  // Laravel `boolean` accepts 1/0/true/false — URLSearchParams turns JS true into "true", which fails.
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [
        key,
        typeof value === "boolean" ? (value ? "1" : "0") : value,
      ]),
  );
  // #region agent log
  fetch('http://127.0.0.1:7870/ingest/4496b291-2322-4832-a8af-ec3aee060b02',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3bdd39'},body:JSON.stringify({sessionId:'3bdd39',runId:'post-fix',hypothesisId:'A',location:'followUpTaskService.js:getFollowUpTasks',message:'follow-up-tasks query params before request',data:{params,paramTypes:Object.fromEntries(Object.entries(params).map(([k,v])=>[k,typeof v])),query:query.toString(),activeRaw:params.active,activeInQuery:query.get('active')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const response = await apiRequest(
      `/follow-up-tasks${query.size ? `?${query}` : ""}`,
    );
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/4496b291-2322-4832-a8af-ec3aee060b02',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3bdd39'},body:JSON.stringify({sessionId:'3bdd39',runId:'post-fix',hypothesisId:'A',location:'followUpTaskService.js:getFollowUpTasks:ok',message:'follow-up-tasks request succeeded',data:{query:query.toString(),count:unwrapList(response).length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return unwrapList(response).map(normalizeFollowUpTask);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/4496b291-2322-4832-a8af-ec3aee060b02',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3bdd39'},body:JSON.stringify({sessionId:'3bdd39',runId:'post-fix',hypothesisId:'A',location:'followUpTaskService.js:getFollowUpTasks:error',message:'follow-up-tasks request failed',data:{query:query.toString(),status:error?.status,message:error?.message,errors:error?.errors||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

/** Full patient history, including fulfilled/cancelled tasks, across all API pages. */
export async function getPatientFollowUpTasks(patientId) {
  const tasks = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({ patient_id: String(patientId), per_page: "100", page: String(page) });
    const response = await apiRequest(`/follow-up-tasks?${query}`);
    tasks.push(...unwrapList(response).map(normalizeFollowUpTask));
    if (page >= (Number(response?.data?.last_page) || 1)) return tasks;
  }
}

/**
 * Part A.4/B.3: the Calendar is a full history for a date range, including
 * rows the List view (getFollowUpTasks) excludes because they've been
 * superseded by a reschedule. The backend groups by due_date for the
 * month-grid response shape; flattened back into one array here so callers
 * can reuse the existing groupTasksByDay client-side grouping/sorting.
 */
export async function getFollowUpTasksCalendar({ start, end } = {}) {
  const query = new URLSearchParams({ start, end });
  const response = await apiRequest(`/follow-up-tasks/calendar?${query}`);
  const byDay = unwrapData(response) || {};
  return Object.values(byDay).flat().map(normalizeFollowUpTask);
}

export async function getFollowUpTask(taskId) {
  const response = await apiRequest(`/follow-up-tasks/${taskId}`);
  return normalizeFollowUpTask(unwrapData(response));
}

export async function rescheduleFollowUp(
  taskId,
  dueDateOrPayload,
  legacyNotes = "",
) {
  const payload =
    typeof dueDateOrPayload === "object"
      ? dueDateOrPayload
      : { dueDate: dueDateOrPayload, notes: legacyNotes };
  const response = await apiRequest(`/follow-up-tasks/${taskId}/reschedule`, {
    method: "PATCH",
    body: {
      due_date: payload.dueDate,
      due_time: payload.dueTime || null,
      notes: payload.notes || "",
    },
  });
  return normalizeFollowUpTask(unwrapData(response));
}

export async function cancelFollowUp(taskId, notes = "") {
  const response = await apiRequest(`/follow-up-tasks/${taskId}/cancel`, {
    method: "PATCH",
    body: { notes },
  });
  return normalizeFollowUpTask(unwrapData(response));
}

export default {
  getFollowUpTasks,
  getFollowUpTasksCalendar,
  getFollowUpTask,
  rescheduleFollowUp,
  cancelFollowUp,
};
