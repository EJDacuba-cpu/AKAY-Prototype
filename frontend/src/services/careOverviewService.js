import { apiRequest, unwrapData } from "./apiClient";

/** Pending follow-ups and unscheduled active monitoring for Start Consultation. */
export async function getCareOverview(patientId) {
  const data = unwrapData(await apiRequest(`/patients/${patientId}/care-overview`)) || {};
  return {
    pendingFollowUps: (data.pending_follow_ups || []).map((task) => ({
      id: task.id,
      dueDate: task.due_date,
      dueTime: task.due_time,
      state: task.state,
      isOverdue: task.is_overdue === true,
      reason: task.reason || "",
      sourceHealthRecordId: task.source_health_record_id,
      sourceDate: task.source_date,
      // condition_key / started_at are not sent for a follow-up's conditions
      // today; read when present so a richer payload needs no change here.
      conditions: (task.conditions || []).map((c) => ({
        monitoringId: c.monitoring_id,
        conditionName: c.condition_name,
        conditionKey: c.condition_key || null,
        startedAt: c.started_at || "",
      })),
    })),
    monitoringWithoutFollowUp: (data.monitoring_without_follow_up || []).map((m) => ({
      id: m.id,
      conditionName: m.condition_name,
      conditionKey: m.condition_key,
      startedAt: m.started_at,
      lastVisitDate: m.last_visit_date,
      lastHealthRecordId: m.last_health_record_id,
    })),
  };
}
