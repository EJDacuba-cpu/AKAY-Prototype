import test from 'node:test';
import assert from 'node:assert/strict';
import { parentLinkPayload, parentInformation, reportedParentValues } from './parentLinks.js';

test('a parent change sends only one relationship and its saved base, never demographics or reported text', () => {
  assert.deepEqual(parentLinkPayload('mother', '8', ''), {
    mother_patient_id: 8, parent_link_base: { mother_patient_id: null },
  });
  assert.deepEqual(parentLinkPayload('father', '', '9'), {
    father_patient_id: null, parent_link_base: { father_patient_id: 9 },
  });
  assert.throws(() => parentLinkPayload('guardian', '8', ''), /parent role/i);
});

test('linked parent identity takes priority while reported data remains available separately', () => {
  const patient = { mother_patient_id: 8, mother_name: 'Reported mother', mother_birth_date: '1970-01-01',
    mother: { id: 8, first_name: 'Registered', last_name: 'Mother', birthdate: '1971-02-03' } };
  const result = parentInformation(patient, 'mother');
  assert.equal(result.name, 'Registered Mother');
  assert.equal(result.birthDate, '1971-02-03');
  assert.equal(result.reportedName, 'Reported mother');
  assert.equal(result.reportedBirthDate, '1970-01-01');
  assert.equal(result.linked, true);
  assert.equal(patient.mother_name, 'Reported mother');
});

test('unregistered and inaccessible linked parents remain distinct', () => {
  assert.equal(parentInformation({ fatherName: 'Reported father' }, 'father').name, 'Reported father');
  const unavailable = parentInformation({ fatherPatientId: '8', fatherName: 'Reported father' }, 'father');
  assert.equal(unavailable.linked, true);
  assert.equal(unavailable.name, 'Linked patient unavailable');
  assert.equal(unavailable.reportedName, 'Reported father');
});

test('reported parent values are optional and preserved for adults as well as minors', () => {
  assert.deepEqual(reportedParentValues({ birthDate: '1980-01-01', motherName: 'Saved mother', fatherBirthDate: '1950-01-01' }), {
    motherName: 'Saved mother', motherBirthDate: null, fatherName: null, fatherBirthDate: '1950-01-01',
  });
});
