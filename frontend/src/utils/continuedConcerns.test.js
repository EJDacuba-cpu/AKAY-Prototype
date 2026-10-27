import test from 'node:test';
import assert from 'node:assert/strict';
import { continuedConcernErrors, continuedConcernPayload, setContinuedSchedule, pruneContinuedSchedules, continuedConcernReviewRows } from './continuedConcerns.js';
import { followUpSchedulesPayload, managedReturnRows } from './followUpSchedules.js';
import { remapServerErrorKeys, getErrorOwnerStepKey, BHC_STEP_OPTIONS, NEXT_STEP } from './consultationSteps.js';
import { initialNextActions, nextActionsDraft, restoreNextActions, hasReferralDecision } from './nextActions.js';
import { getReportedDiagnoses } from './diagnosisReporting.js';

test('every selected task requires an explicit independent outcome', () => {
  const decisions = [{ taskId: 1, careOutcome: 'managed_at_bhc' }];
  assert.deepEqual(continuedConcernErrors([1, 2], decisions, []), { 'continuedConcern.2.careOutcome': 'Choose a care outcome.' });
  assert.deepEqual(continuedConcernPayload([1], [...decisions, { taskId: 2, careOutcome: 'refer_to_rhu' }]), decisions);
  assert.deepEqual(continuedConcernPayload([1], undefined), []);
});

test('same-name tasks get distinct returns; date and reason required, time optional', () => {
  let schedules = setContinuedSchedule([], 1, { purpose: 'Review', date: '' });
  schedules = setContinuedSchedule(schedules, 2, { purpose: 'Review', date: '2026-11-02' });
  const decisions = [1, 2].map(taskId => ({ taskId, careOutcome: 'bhc_follow_up' }));
  assert.equal(continuedConcernErrors([1, 2], decisions, schedules)['followUpSchedule.continued:1.date'], 'Set the follow-up date.');
  schedules = setContinuedSchedule(schedules, 1, { purpose: 'Review', date: '2026-11-01', time: '' });
  assert.deepEqual(continuedConcernErrors([1, 2], decisions, schedules), {});
  const payload = followUpSchedulesPayload({ extraSchedules: schedules });
  assert.deepEqual(payload.map(s => [s.predecessorTaskId, s.time]), [[2, null], [1, null]]);
  assert.equal(continuedConcernErrors([1], decisions, [{ ...schedules[1], purpose: ' ' }])['followUpSchedule.continued:1.purpose'], 'Describe the reason for return.');
});

test('unlink or changing outcome removes only its return; new same-text concern remains independent', () => {
  const newReturn = { purposeKey: 'entry:new', sourceEntryId: 'new', purpose: 'Review', date: '2026-11-04' };
  const schedules = setContinuedSchedule([newReturn], 1, { purpose: 'Review', date: '2026-11-01' });
  assert.deepEqual(setContinuedSchedule(schedules, 1, null), [newReturn]);
  assert.deepEqual(pruneContinuedSchedules(schedules, []), [newReturn]);
  const payload = followUpSchedulesPayload({ managedReturns: managedReturnRows([{ id: 'new', name: 'Review', clinicalOutcome: 'managed_at_bhc' }], schedules), extraSchedules: schedules.filter(s => s.purposeKey.startsWith('continued:')) });
  assert.equal(payload[0].predecessorTaskId, null);
  assert.equal(payload[1].predecessorTaskId, 1);
});

test('draft decisions survive JSON round trip without inventing missing outcomes', () => {
  const saved = JSON.parse(JSON.stringify({ continuedConcerns: [{ taskId: 9, careOutcome: 'refer_to_rhu' }] }));
  assert.deepEqual(continuedConcernPayload([9], saved.continuedConcerns), saved.continuedConcerns);
  assert.deepEqual(continuedConcernPayload([9], []), []);
  assert.match(continuedConcernReviewRows([{ id: 9, purpose: 'Wound' }], saved.continuedConcerns)[0].value, /Refer to RHU/);
});

test('server decision and optional-time errors return to the exact continued concern field', () => {
  const errors = remapServerErrorKeys({ 'care_plan.continued_concerns.0.careOutcome': 'Choose', 'monitoring_data.followUpSchedules.0.time': 'Invalid' }, [], { continuedConcerns: [{ taskId: 12 }], schedules: [{ purposeKey: 'continued:12' }] });
  assert.deepEqual(errors, { 'continuedConcern.12.careOutcome': 'Choose', 'followUpSchedule.continued:12.time': 'Invalid' });
  for (const key of Object.keys(errors)) assert.equal(getErrorOwnerStepKey(key, BHC_STEP_OPTIONS), NEXT_STEP);
});

test('draft resume then manage or unlink the only referred task clears derived referral intent', () => {
  const draft = JSON.parse(JSON.stringify({ ...nextActionsDraft(initialNextActions()), continuedConcerns: [{ taskId: 12, careOutcome: 'refer_to_rhu' }] }));
  const restored = restoreNextActions(draft);
  const refers = decisions => hasReferralDecision({ referToRhu: restored.referToRhu, conditionReferred: decisions.some(item => item.careOutcome === 'refer_to_rhu') });
  assert.equal(refers(draft.continuedConcerns), true);
  assert.equal(refers([{ taskId: 12, careOutcome: 'managed_at_bhc' }]), false);
  assert.equal(refers(continuedConcernPayload([], draft.continuedConcerns)), false);
});

test('reporting counts original entry once; continued visits do not imply new cases or exclude new entries', () => {
  const original = { diagnoses: [{ id: 'old', name: 'Wound', reportIn: ['morbidity'] }] };
  const returning = { diagnoses: [], monitoringData: { morbidityReportingStatus: 'not_included', continuedConcerns: [{ taskId: 1, sourceHealthRecordId: 10, purpose: 'Wound', careOutcome: 'managed_at_bhc' }] } };
  assert.equal([original, returning].flatMap(record => getReportedDiagnoses(record, 'morbidity')).length, 1);
  const independent = { ...returning, diagnoses: [{ id: 'new', name: 'Wound', reportIn: ['morbidity'] }] };
  assert.equal([original, independent].flatMap(record => getReportedDiagnoses(record, 'morbidity')).length, 2);
});
