import test from 'node:test';
import assert from 'node:assert/strict';
import { VISIT_SERVICES, knownVisitPurpose, emptyVisitPurpose, serviceEligibility, purposePrograms, purposeErrors, teenagePrenatal, visitAge } from './visitPurpose.js';
import { buildConsultationSteps, getFormSequence, getProgramFormSteps } from './consultationSteps.js';

const patient = birthdate => ({ birthdate, sex: 'Female' });
const date = '2026-09-23';

test('infant bracket includes exactly 12 months, then age override begins', () => {
  assert.equal(serviceEligibility('EPI', patient('2025-09-23'), date).eligible, true);
  assert.equal(serviceEligibility('Prenatal', patient('2025-09-23'), date).overridable, undefined);
  assert.equal(serviceEligibility('EPI', patient('2025-09-22'), date).overridable, true);
  assert.equal(serviceEligibility('General', patient('2026-09-22'), date).eligible, true);
});
test('10 needs override; 11–17 female gets Maternal; 18 gets FP', () => {
  assert.equal(serviceEligibility('Prenatal', patient('2015-09-24'), date).overridable, true);
  assert.equal(serviceEligibility('Prenatal', patient('2015-09-23'), date).eligible, true);
  assert.equal(serviceEligibility('Postpartum', patient('2008-09-24'), date).eligible, true);
  assert.equal(serviceEligibility('Family Planning', patient('2008-09-24'), date).eligible, false);
  assert.equal(serviceEligibility('Family Planning', patient('2008-09-23'), date).eligible, true);
});
test('unknown or future birthdates do not enable specialized services', () => {
  assert.equal(visitAge('2025-02-30', date), null);
  assert.equal(visitAge('2027-01-01', date), null);
  assert.equal(serviceEligibility('Prenatal', patient(''), date).eligible, false);
  assert.equal(serviceEligibility('Prenatal', { birthdate: '2000-01-01', sex: 'Male' }, date).eligible, false);
});
test('purpose is explicit and override needs a nonblank reason', () => {
  assert.ok(purposeErrors(emptyVisitPurpose(), patient('2018-01-01'), date));
  const purpose = { ...emptyVisitPurpose(), services: ['General', 'Prenatal'] };
  assert.ok(purposeErrors(purpose, patient('2018-01-01'), date));
  assert.equal(purposeErrors({ ...purpose, overrideReason: 'Recorded exception' }, patient('2018-01-01'), date), '');
  assert.deepEqual(purposePrograms(['General', 'Prenatal', 'Postpartum']), ['Maternal']);
});
test('teenage confirmation is scoped to Prenatal, not postpartum or adult visits', () => {
  const purpose = { services: ['General', 'Prenatal'] };
  assert.equal(teenagePrenatal(purpose, patient('2010-01-01'), date), true);
  assert.equal(teenagePrenatal({ services: ['Postpartum'] }, patient('2010-01-01'), date), false);
  assert.equal(teenagePrenatal(purpose, patient('2000-01-01'), date), false);
});
test('every flow, program-only included, keeps assessment, vitals, treatment and final actions', () => {
  const programs = getProgramFormSteps(['Maternal'], 'Maternal');
  assert.deepEqual(getFormSequence(programs), ['interview', 'assessment', 'program:Maternal', 'treatment']);
  const steps = buildConsultationSteps({ selectedPrograms: ['EPI'], primaryProgram: 'EPI' });
  assert.equal(steps[0].label, 'Concern & Vital Signs');
  assert.equal(steps.some(step => step.key === 'assessment'), true);
  assert.equal(steps.at(-1).key, 'review');
});

test('Hypertension and Diabetes are no longer visit services', () => {
  assert.deepEqual(Object.keys(VISIT_SERVICES), ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB']);
  assert.equal(serviceEligibility('Hypertension', patient('1980-01-01'), date).eligible, false);
});

test('a restored purpose drops removed services and never ends up empty', () => {
  assert.equal(knownVisitPurpose(null), null);
  assert.deepEqual(knownVisitPurpose({ version: 1, services: ['Prenatal', 'Hypertension'] }).services, ['Prenatal']);
  assert.deepEqual(knownVisitPurpose({ version: 1, services: ['Hypertension', 'Diabetes'] }).services, ['General']);
  assert.deepEqual(knownVisitPurpose({ version: 1, services: [] }).services, []);
  assert.equal(purposeErrors(knownVisitPurpose({ version: 1, services: ['Diabetes'] }), patient('1990-01-01'), date), '');
});
