import { matchConditionKey } from "./carePlan.js";

/**
 * What a consultation continues (Start Consultation modal, or a resumed
 * draft), resolved against the patient's care overview
 * (services/careOverviewService.getCareOverview). Kept out of the workspace
 * page so it is tested.
 *
 * A continued monitoring is `{ id, conditionName, conditionKey, startedAt,
 * lastHealthRecordId }`. A pending follow-up's conditions carry no registry
 * key or start date in the overview, so those stay null/"" and identity falls
 * back to the condition name (a registered condition's stored name is its
 * registry name - utils/carePlan.conditionIdentity).
 */

function positiveId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function uniqueIds(list = []) {
  return [...new Set(list.map(positiveId).filter(Boolean))];
}

/** First entry per id wins. */
export function uniqueById(list = []) {
  const seen = new Set();
  return list.filter((item) => {
    const id = Number(item?.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function fromUnscheduled(monitoring) {
  return {
    id: Number(monitoring.id),
    conditionName: monitoring.conditionName || "",
    conditionKey: monitoring.conditionKey || null,
    startedAt: monitoring.startedAt || "",
    lastHealthRecordId: monitoring.lastHealthRecordId || null,
  };
}

function fromFollowUpCondition(task, condition) {
  return {
    id: Number(condition.monitoringId),
    conditionName: condition.conditionName || "",
    conditionKey: condition.conditionKey || null,
    startedAt: condition.startedAt || "",
    // The ITR that scheduled the follow-up is that condition's latest visit.
    lastHealthRecordId: task.sourceHealthRecordId || null,
  };
}

function followUpConditions(task) {
  return (Array.isArray(task?.conditions) ? task.conditions : []).filter((condition) =>
    positiveId(condition?.monitoringId),
  );
}

/**
 * Every active monitoring record in the overview, selected or not - Care Plan
 * uses it to note "Monitored at BHC" on a diagnosis already being monitored.
 */
export function activeMonitoringsFromOverview(overview) {
  return uniqueById([
    ...(overview?.monitoringWithoutFollowUp || []).map(fromUnscheduled),
    ...(overview?.pendingFollowUps || []).flatMap((task) =>
      followUpConditions(task).map((condition) => fromFollowUpCondition(task, condition)),
    ),
  ]);
}

/**
 * Resolve continued follow-up / monitoring ids against a fresh overview.
 *
 * - Seeding from the modal (`includeFollowUpConditions: true`) also continues
 *   each selected follow-up's monitored conditions; a resumed draft already
 *   stored them, so it does not.
 * - An id no longer in the overview (fulfilled, stopped, rescheduled) is
 *   dropped and reported - the server would reject it on save. Stops of a
 *   dropped monitoring go with it.
 * - A follow-up may link no conditions (`conditions: []`): it is still
 *   continued, and only its source record is kept.
 */
export function resolveContinuedCare(
  overview,
  { followUpIds = [], monitoringIds = [], stops = {}, includeFollowUpConditions = false } = {},
) {
  const pending = overview?.pendingFollowUps || [];
  const active = new Map(activeMonitoringsFromOverview(overview).map((monitoring) => [monitoring.id, monitoring]));

  const followUps = [];
  const droppedFollowUpIds = [];
  for (const id of uniqueIds(followUpIds)) {
    const task = pending.find((item) => Number(item.id) === id);
    if (task) followUps.push(task);
    else droppedFollowUpIds.push(id);
  }

  // A selected follow-up's own conditions keep the follow-up's source record.
  const fromSelectedFollowUps = new Map();
  if (includeFollowUpConditions) {
    for (const task of followUps) {
      for (const condition of followUpConditions(task)) {
        const id = Number(condition.monitoringId);
        if (!fromSelectedFollowUps.has(id)) fromSelectedFollowUps.set(id, fromFollowUpCondition(task, condition));
      }
    }
  }

  const continuedMonitorings = [];
  const droppedMonitoringIds = [];
  for (const id of uniqueIds([...fromSelectedFollowUps.keys(), ...monitoringIds])) {
    const monitoring = fromSelectedFollowUps.get(id) || active.get(id);
    if (monitoring) continuedMonitorings.push(monitoring);
    else droppedMonitoringIds.push(id);
  }

  const monitoringStops = keepStopsFor(stops, continuedMonitorings);

  return {
    continuedFollowUpTaskIds: followUps.map((task) => Number(task.id)),
    continuedFollowUps: followUps.map((task) => ({
      id: Number(task.id),
      sourceHealthRecordId: task.sourceHealthRecordId || null,
    })),
    continuedMonitorings,
    monitoringStops,
    droppedFollowUpIds,
    droppedMonitoringIds,
  };
}

/** Stops apply only to continued monitoring; a dropped one's stop goes with it. */
export function keepStopsFor(stops = {}, continuedMonitorings = []) {
  const continuedIds = new Set(continuedMonitorings.map((monitoring) => Number(monitoring.id)));
  return Object.fromEntries(Object.entries(stops || {}).filter(([id]) => continuedIds.has(Number(id))));
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The notice shown when continued items were dropped; "" when none were. */
export function droppedContinuedCareNotice({ droppedFollowUpIds = [], droppedMonitoringIds = [] } = {}) {
  const parts = [];
  if (droppedFollowUpIds.length) parts.push(countLabel(droppedFollowUpIds.length, "follow-up", "follow-ups"));
  if (droppedMonitoringIds.length) {
    parts.push(countLabel(droppedMonitoringIds.length, "monitored condition", "monitored conditions"));
  }
  if (!parts.length) return "";
  const one = droppedFollowUpIds.length + droppedMonitoringIds.length === 1;
  return `${parts.join(" and ")} ${one ? "is" : "are"} no longer active (already completed or stopped) and ${
    one ? "was" : "were"
  } removed from Care Plan.`;
}

/**
 * The ITR to pre-fill the TB-DOTS card from when a continued monitoring is
 * Tuberculosis (what the old follow-up form did); null otherwise.
 */
export function tbPrefillRecordId(continuedMonitorings = [], registry = {}) {
  const tb = continuedMonitorings.find(
    (monitoring) =>
      monitoring?.lastHealthRecordId &&
      (monitoring.conditionKey || matchConditionKey(monitoring.conditionName, registry)) === "tuberculosis",
  );
  return tb ? tb.lastHealthRecordId : null;
}
