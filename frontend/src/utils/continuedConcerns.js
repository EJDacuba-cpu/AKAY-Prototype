import { CARE_OUTCOMES, isCareOutcome } from './conditionCards.js';
import { isScheduledServiceFollowUp } from './followUpSchedules.js';

export const continuedPurposeKey = (id) => `continued:${Number(id)}`;

export function concernFollowUpTaskIds(ids = [], followUps = []) {
  const byId = new Map((Array.isArray(followUps) ? followUps : []).map((task) => [Number(task.id), task]));
  return (Array.isArray(ids) ? ids : []).filter((id) => !isScheduledServiceFollowUp(byId.get(Number(id)) || {}));
}

export function stripServiceConcernSchedules(schedules = [], followUps = []) {
  const serviceIds = new Set(
    (Array.isArray(followUps) ? followUps : []).filter(isScheduledServiceFollowUp).map((task) => Number(task.id)),
  );
  return (Array.isArray(schedules) ? schedules : []).filter((item) => {
    const key = String(item?.purposeKey || '');
    if (serviceIds.has(Number(item?.predecessorTaskId)) && key.startsWith('continued:')) return false;
    if (key.startsWith('continued:') && serviceIds.has(Number(key.slice('continued:'.length)))) return false;
    return true;
  });
}

export function linkedScheduledFollowUpReviewRows(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).filter(isScheduledServiceFollowUp).map((task) => ({
    label: `Linked scheduled follow-up · FU-${task.id}`,
    value: [task.purpose || task.reason, task.dueDate].filter(Boolean).join(' · ') || 'Selected follow-up',
  }));
}

/** Missing decisions stay missing, including on legacy drafts. */
export function continuedConcernPayload(ids = [], decisions = []) {
  const selected = new Set(ids.map(Number));
  return (Array.isArray(decisions) ? decisions : [])
    .filter(item => selected.has(Number(item?.taskId)))
    .map(item => ({ taskId: Number(item.taskId), careOutcome: isCareOutcome(item.careOutcome) ? item.careOutcome : '' }));
}

export function setContinuedSchedule(schedules = [], id, value) {
  const key = continuedPurposeKey(id);
  const rest = schedules.filter(item => item.purposeKey !== key && Number(item.predecessorTaskId) !== Number(id));
  if (value === null) return rest;
  return [...rest, { purposeKey: key, purpose: value.purpose ?? '', date: value.date ?? '', time: value.time ?? '', predecessorTaskId: Number(id), sourceEntryId: null }];
}

export function pruneContinuedSchedules(schedules = [], ids = []) {
  const keys = new Set(ids.map(continuedPurposeKey));
  return schedules.filter(item => !String(item.purposeKey).startsWith('continued:') || keys.has(item.purposeKey));
}

export function continuedConcernErrors(ids = [], decisions = [], schedules = []) {
  const errors = {};
  for (const id of ids) {
    const decision = decisions.find(item => Number(item.taskId) === Number(id));
    if (!isCareOutcome(decision?.careOutcome)) errors[`continuedConcern.${id}.careOutcome`] = 'Choose a care outcome.';
    if (decision?.careOutcome !== 'bhc_follow_up') continue;
    const key = continuedPurposeKey(id);
    const schedule = schedules.find(item => item.purposeKey === key);
    if (!schedule?.date?.trim()) errors[`followUpSchedule.${key}.date`] = 'Set the follow-up date.';
    if (!schedule?.purpose?.trim()) errors[`followUpSchedule.${key}.purpose`] = 'Describe the reason for return.';
    if (schedule?.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) errors[`followUpSchedule.${key}.time`] = 'Enter a valid follow-up time.';
  }
  return errors;
}

export function continuedConcernReviewRows(tasks = [], decisions = []) {
  return tasks.map(task => ({
    label: `Continued concern · FU-${task.id}`,
    value: [task.purpose || task.reason, CARE_OUTCOMES[decisions.find(item => Number(item.taskId) === Number(task.id))?.careOutcome] || 'Outcome not selected'].filter(Boolean).join(' · '),
  }));
}
