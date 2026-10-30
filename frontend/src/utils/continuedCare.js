import { matchConditionKey } from "./carePlan.js";

/**
 * What a consultation continues (Start Consultation modal, or a resumed
 * draft), resolved against the patient's care overview
 * (services/careOverviewService.getCareOverview). Kept out of the workspace
 * page so it is tested.
 *
 * A continued monitoring is `{ id, conditionName, conditionKey, startedAt,
 * lastHealthRecordId, conditionStatus, legacy }` (`conditionStatus` is the
 * RHU's status, null with `legacy` true when it predates confirmation). A pending follow-up's conditions carry no registry
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
    conditionStatus: monitoring.conditionStatus || null,
    legacy: monitoring.legacy === true,
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
    conditionStatus: condition.conditionStatus || null,
    legacy: condition.legacy === true,
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
 * - `includeLinkedFollowUps` also continues every pending follow-up that links
 *   one of the passed `monitoringIds`, so the visit fulfils it. Only the
 *   explicit `followUpIds` pull in their own conditions; a linked follow-up's
 *   other conditions stay as they were (nothing is selected for the worker).
 * - An id no longer in the overview (fulfilled, stopped, rescheduled) is
 *   dropped and reported - the server would reject it on save. Stops of a
 *   dropped monitoring go with it.
 * - `startConditionIds` are confirmed conditions BHC starts monitoring this
 *   visit; each is resolved against the overview's `monitoringRecommendations`
 *   (`startingConditions`), and one no longer recommended is dropped and
 *   reported in `droppedConditionIds`.
 * - Legacy monitoring (`legacy: true`, no RHU-confirmed condition) is never
 *   continued: the server rejects it. A selected follow-up is still continued
 *   and its legacy condition names come back in `legacyConditionNames`
 *   (per task in `legacyNamesByFollowUp`, so unlinking one can update them); a
 *   legacy `monitoringId` passed directly is dropped (also reported in
 *   `droppedLegacyMonitoringIds`, a subset of `droppedMonitoringIds`).
 * - A follow-up may link no conditions (`conditions: []`): it is still
 *   continued, and only its source record is kept.
 */
export function resolveContinuedCare(
  overview,
  {
    followUpIds = [],
    monitoringIds = [],
    stops = {},
    includeFollowUpConditions = false,
    includeLinkedFollowUps = false,
    startConditionIds = [],
  } = {},
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
  // `viaFollowUpId` marks one pulled in only through a single follow-up (not
  // ticked, not shared with another selected follow-up), so unlinking that
  // follow-up can take it along (removeContinuedFollowUp). UI state only: the
  // draft and the payload carry ids.
  const fromSelectedFollowUps = new Map();
  if (includeFollowUpConditions) {
    const ticked = new Set(uniqueIds(monitoringIds));
    const owners = new Map();
    for (const task of followUps) {
      for (const condition of followUpConditions(task)) {
        // Legacy monitoring is pending RHU verification: the server rejects
        // continuing it, so only the task is continued (legacyConditionNames).
        if (condition.legacy === true) continue;
        const id = Number(condition.monitoringId);
        owners.set(id, (owners.get(id) || 0) + 1);
        if (!fromSelectedFollowUps.has(id)) {
          const monitoring = fromFollowUpCondition(task, condition);
          fromSelectedFollowUps.set(id, ticked.has(id) ? monitoring : { ...monitoring, viaFollowUpId: Number(task.id) });
        }
      }
    }
    for (const [id, count] of owners) {
      if (count > 1) delete fromSelectedFollowUps.get(id).viaFollowUpId;
    }
  }

  if (includeLinkedFollowUps) {
    const selectedMonitoringIds = new Set(uniqueIds(monitoringIds));
    for (const task of pending) {
      const linksSelected = followUpConditions(task).some((condition) =>
        selectedMonitoringIds.has(Number(condition.monitoringId)),
      );
      if (linksSelected && !followUps.some((item) => Number(item.id) === Number(task.id))) followUps.push(task);
    }
  }

  const continuedMonitorings = [];
  const droppedMonitoringIds = [];
  const droppedLegacyMonitoringIds = [];
  const legacyNames = [];
  const legacyNamesByFollowUp = {};
  for (const id of uniqueIds([...fromSelectedFollowUps.keys(), ...monitoringIds])) {
    const monitoring = fromSelectedFollowUps.get(id) || active.get(id);
    if (monitoring?.legacy === true) {
      droppedMonitoringIds.push(id);
      droppedLegacyMonitoringIds.push(id);
      legacyNames.push(monitoring.conditionName);
    } else if (monitoring) continuedMonitorings.push(monitoring);
    else droppedMonitoringIds.push(id);
  }
  for (const task of followUps) {
    for (const condition of followUpConditions(task)) {
      if (condition.legacy === true) {
        legacyNames.push(condition.conditionName || "");
        const owned = (legacyNamesByFollowUp[Number(task.id)] ||= []);
        if (condition.conditionName && !owned.includes(condition.conditionName)) owned.push(condition.conditionName);
      }
    }
  }
  const legacyConditionNames = [...new Set(legacyNames.filter(Boolean))];

  const monitoringStops = keepStopsFor(stops, continuedMonitorings);

  const recommended = new Map((overview?.monitoringRecommendations || []).map((r) => [Number(r.conditionId), r]));
  const startingConditions = [];
  const droppedConditionIds = [];
  for (const id of uniqueIds(startConditionIds)) {
    // `id` is the condition id the care plan payload and the draft carry.
    if (recommended.has(id)) startingConditions.push({ ...recommended.get(id), id });
    else droppedConditionIds.push(id);
  }

  return {
    continuedFollowUpTaskIds: followUps.map((task) => Number(task.id)),
    continuedFollowUps: followUps.map((task) => ({
      id: Number(task.id),
      sourceHealthRecordId: task.sourceHealthRecordId || null,
      reason: task.purpose || task.reason || "",
      purpose: task.purpose || task.reason || "",
      purposeKey: task.purposeKey || "",
      dueDate: task.dueDate || "",
      sourceDate: task.sourceDate || "",
      sourceChiefComplaint: task.sourceChiefComplaint || "",
      sourceAssessment: task.sourceAssessment || "",
      sourceSelectedPrograms: Array.isArray(task.sourceSelectedPrograms) ? task.sourceSelectedPrograms : null,
      sourceCategory: task.sourceCategory || "",
    })),
    continuedMonitorings,
    monitoringStops,
    droppedFollowUpIds,
    droppedMonitoringIds,
    droppedLegacyMonitoringIds,
    legacyConditionNames,
    legacyNamesByFollowUp,
    startingConditions,
    droppedConditionIds,
  };
}

/** Stops apply only to continued monitoring; a dropped one's stop goes with it. */
export function keepStopsFor(stops = {}, continuedMonitorings = []) {
  const continuedIds = new Set(continuedMonitorings.map((monitoring) => Number(monitoring.id)));
  return Object.fromEntries(Object.entries(stops || {}).filter(([id]) => continuedIds.has(Number(id))));
}

/**
 * Unlink one continued follow-up before saving: it is dropped, and so are the
 * monitorings that came in only through it (`viaFollowUpId`), with their stops
 * and RHU referral ticks, and recomputes the legacy condition names from the
 * follow-ups that remain. Monitorings the worker ticked directly stay. Pure.
 */
export function removeContinuedFollowUp(
  {
    continuedFollowUpTaskIds = [],
    continuedFollowUps = [],
    continuedMonitorings = [],
    monitoringStops = {},
    monitoringReferrals = [],
    legacyNamesByFollowUp = {},
  } = {},
  id,
) {
  const removed = Number(id);
  const remainingTaskIds = continuedFollowUpTaskIds.filter((taskId) => Number(taskId) !== removed);
  const remainingLegacyNames = Object.fromEntries(
    remainingTaskIds
      .filter((taskId) => legacyNamesByFollowUp[Number(taskId)]?.length)
      .map((taskId) => [Number(taskId), legacyNamesByFollowUp[Number(taskId)]]),
  );
  const keptMonitorings = continuedMonitorings.filter((monitoring) => Number(monitoring.viaFollowUpId) !== removed);
  return {
    continuedFollowUpTaskIds: remainingTaskIds,
    continuedFollowUps: continuedFollowUps.filter((task) => Number(task.id) !== removed),
    continuedMonitorings: keptMonitorings,
    monitoringStops: keepStopsFor(monitoringStops, keptMonitorings),
    monitoringReferrals: keepReferralsFor(monitoringReferrals, keptMonitorings),
    legacyNamesByFollowUp: remainingLegacyNames,
    // Only names a remaining follow-up still owns stay on the "legacy" line.
    legacyConditionNames: [...new Set(Object.values(remainingLegacyNames).flat())],
  };
}

function keepReferralsFor(referrals = [], continuedMonitorings = []) {
  const continuedIds = new Set(continuedMonitorings.map((monitoring) => Number(monitoring.id)));
  return referrals.filter((id) => continuedIds.has(Number(id)));
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The notice shown when continued items were dropped; "" when none were.
 * A withdrawn RHU recommendation is worded on its own: the worker did not
 * lose an active record, the RHU no longer recommends starting it.
 */
export function droppedContinuedCareNotice({
  droppedFollowUpIds = [],
  droppedMonitoringIds: droppedIds = [],
  droppedLegacyMonitoringIds = [],
  droppedConditionIds = [],
} = {}) {
  const legacyIds = new Set(droppedLegacyMonitoringIds.map(Number));
  const droppedMonitoringIds = droppedIds.filter((id) => !legacyIds.has(Number(id)));
  const sentences = [];
  const parts = [];
  if (droppedFollowUpIds.length) parts.push(countLabel(droppedFollowUpIds.length, "follow-up", "follow-ups"));
  if (droppedMonitoringIds.length) {
    parts.push(countLabel(droppedMonitoringIds.length, "monitored condition", "monitored conditions"));
  }
  if (parts.length) {
    const one = droppedFollowUpIds.length + droppedMonitoringIds.length === 1;
    sentences.push(
      `${parts.join(" and ")} ${one ? "is" : "are"} no longer active (already completed or stopped) and ${
        one ? "was" : "were"
      } removed from Care Plan.`,
    );
  }
  if (legacyIds.size) {
    const one = legacyIds.size === 1;
    sentences.push(
      `${countLabel(legacyIds.size, "legacy monitored condition", "legacy monitored conditions")} ${
        one ? "is" : "are"
      } pending RHU verification and cannot be continued, so ${one ? "it was" : "they were"} removed from Care Plan.`,
    );
  }
  if (droppedConditionIds.length) {
    const one = droppedConditionIds.length === 1;
    sentences.push(
      `${countLabel(droppedConditionIds.length, "RHU-recommended condition", "RHU-recommended conditions")} ${
        one ? "is" : "are"
      } no longer recommended for BHC monitoring and ${one ? "was" : "were"} removed from Care Plan.`,
    );
  }
  return sentences.join(" ");
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
