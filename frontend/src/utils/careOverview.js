/**
 * GET /patients/{id}/care-overview (CareOverviewController) in the client's
 * shape: pending follow-ups (each with the active monitored conditions it was
 * scheduled for) and active monitoring with no pending follow-up.
 */
export function mapCareOverview(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    pendingFollowUps: (source.pending_follow_ups || []).map((task) => ({
      id: task.id,
      dueDate: task.due_date,
      dueTime: task.due_time,
      state: task.state,
      isOverdue: task.is_overdue === true,
      reason: task.reason || "",
      sourceHealthRecordId: task.source_health_record_id,
      sourceDate: task.source_date,
      conditions: (task.conditions || []).map((c) => ({
        monitoringId: c.monitoring_id,
        conditionName: c.condition_name,
        conditionKey: c.condition_key || null,
        startedAt: c.started_at || "",
      })),
    })),
    monitoringWithoutFollowUp: (source.monitoring_without_follow_up || []).map((m) => ({
      id: m.id,
      conditionName: m.condition_name,
      conditionKey: m.condition_key,
      startedAt: m.started_at,
      lastVisitDate: m.last_visit_date,
      lastHealthRecordId: m.last_health_record_id,
    })),
  };
}
