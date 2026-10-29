/**
 * GET /patients/{id}/care-overview (CareOverviewController) in the client's
 * shape: pending follow-ups (each with the active monitored conditions it was
 * scheduled for), active monitoring with no pending follow-up, and the
 * confirmed conditions BHC is recommended to start monitoring. A monitoring's
 * `conditionStatus` is null (and `legacy` true) when it predates confirmation.
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
      purpose: task.purpose || task.reason || "",
      purposeKey: task.purpose_key || "",
      predecessorTaskId: task.predecessor_task_id || null,
      reason: task.reason || task.purpose || "",
      sourceHealthRecordId: task.source_health_record_id,
      sourceDate: task.source_date,
      sourceChiefComplaint: task.source_chief_complaint || "",
      sourceAssessment: task.source_assessment || "",
      sourceSelectedPrograms: Array.isArray(task.source_selected_programs) ? task.source_selected_programs : null,
      sourceCategory: task.source_category || "",
      conditions: (task.conditions || []).map((c) => ({
        monitoringId: c.monitoring_id,
        conditionName: c.condition_name,
        conditionKey: c.condition_key || null,
        startedAt: c.started_at || "",
        conditionStatus: c.condition_status || null,
        legacy: c.legacy === true,
      })),
    })),
    monitoringWithoutFollowUp: (source.monitoring_without_follow_up || []).map((m) => ({
      id: m.id,
      conditionName: m.condition_name,
      conditionKey: m.condition_key,
      startedAt: m.started_at,
      lastVisitDate: m.last_visit_date,
      lastHealthRecordId: m.last_health_record_id,
      conditionStatus: m.condition_status || null,
      legacy: m.legacy === true,
    })),
    monitoringRecommendations: (source.monitoring_recommendations || []).map((r) => ({
      conditionId: r.condition_id,
      conditionName: r.condition_name,
      conditionKey: r.condition_key || null,
      status: r.status,
      confirmedAt: r.confirmed_at,
      recommendedAt: r.recommended_at,
    })),
  };
}
