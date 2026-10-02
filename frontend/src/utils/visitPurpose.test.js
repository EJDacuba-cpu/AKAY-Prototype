import test from 'node:test';
import assert from 'node:assert/strict';
import { VISIT_SERVICES } from './visitPurpose.js';
import { buildConsultationSteps, getFormSequence } from './consultationSteps.js';

test('every flow, program-only included, keeps assessment, vitals, treatment and final actions', () => {
  // Service forms are a detour from the first step, not part of Next/Previous.
  assert.deepEqual(getFormSequence(), ['interview', 'assessment']);
  const steps = buildConsultationSteps({ selectedPrograms: ['EPI'], primaryProgram: 'EPI' });
  assert.equal(steps[0].label, 'Concern & Vital Signs');
  assert.equal(steps.some(step => step.key === 'assessment'), true);
  assert.equal(steps.at(-1).key, 'review');
});

test('Hypertension and Diabetes are no longer visit services', () => {
  assert.deepEqual(Object.keys(VISIT_SERVICES), ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB']);
});
