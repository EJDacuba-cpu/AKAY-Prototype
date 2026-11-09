/**
 * GET /patients/{id}/care-overview (CareOverviewController) in the client's
 * shape: pending follow-ups (each with the active monitored conditions it was
 * scheduled for), active monitoring with no pending follow-up, and the
 * confirmed conditions BHC is recommended to start monitoring. A monitoring's
 * `conditionStatus` is null (and `legacy` true) when it predates confirmation.
 * `nutritionCare` is the Nutrition Care summary; a missing payload stays
 * Not Enrolled with an empty measurement history.
 */
function mapNutritionMeasurementHistory(rows) {
  const seen = new Set();
  const history = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const healthRecordId = row?.health_record_id ?? row?.healthRecordId;
    if (healthRecordId === undefined || healthRecordId === null || seen.has(String(healthRecordId))) continue;
    seen.add(String(healthRecordId));
    history.push({
      healthRecordId,
      dateRecorded: row.date_recorded ?? row.dateRecorded ?? "",
      weightKg: row.weight_kg ?? row.weightKg ?? null,
      heightCm: row.height_cm ?? row.heightCm ?? null,
      bmi: row.bmi ?? null,
    });
  }
  return history;
}

function mapNutritionClosures(rows) {
  return (Array.isArray(rows) ? rows : []).map((closure) => ({
    id: closure?.id ?? null,
    reason: closure?.reason || "",
    closedOn: closure?.closed_on || closure?.closedOn || null,
    note: closure?.note ?? null,
    closedByName: closure?.closed_by_name || closure?.closedByName || null,
    startedHealthRecordId: closure?.started_health_record_id ?? closure?.startedHealthRecordId ?? null,
    enrolledOn: closure?.enrolled_on || closure?.enrolledOn || "",
  }));
}

export function mapNutritionCare(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    status: source.status || "Not Enrolled",
    enrolled: source.enrolled === true,
    enrolledOn: source.enrolled_on || source.enrolledOn || null,
    latestWeightKg: source.latest_weight_kg ?? source.latestWeightKg ?? null,
    latestHeightCm: source.latest_height_cm ?? source.latestHeightCm ?? null,
    latestBmi: source.latest_bmi ?? source.latestBmi ?? null,
    latestBmiCategory: source.latest_bmi_category ?? source.latestBmiCategory ?? null,
    measurementHistory: mapNutritionMeasurementHistory(source.measurement_history || source.measurementHistory),
    closures: mapNutritionClosures(source.closures),
  };
}

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
      ruralHealthUnitId: task.rural_health_unit_id || null,
      barangayHealthCenterId: task.barangay_health_center_id || null,
      sourceDate: task.source_date,
      sourceChiefComplaint: task.source_chief_complaint || "",
      sourceAssessment: task.source_assessment || "",
      sourceSelectedPrograms: Array.isArray(task.source_selected_programs) ? task.source_selected_programs : null,
      sourceCategory: task.source_category || "",
      conditions: (task.conditions || []).map((c) => ({
        monitoringId: c.monitoring_id,
        ...(c.condition_id ? { conditionId: c.condition_id } : {}),
        conditionName: c.condition_name,
        conditionKey: c.condition_key || null,
        startedAt: c.started_at || "",
        conditionStatus: c.condition_status || null,
        legacy: c.legacy === true,
      })),
    })),
    monitoringWithoutFollowUp: (source.monitoring_without_follow_up || []).map((m) => ({
      ...(m.condition_id ? { conditionId: m.condition_id } : {}),
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
    nutritionCare: mapNutritionCare(source.nutrition_care),
  };
}
