import test from 'node:test';
import assert from 'node:assert/strict';
import { SUFFIX_OPTIONS, localContact, contactInput, contactError, savedSuffix, suffixFields, registrationFieldChange } from './patientRegistrationIdentity.js';
import { formatPatientName } from './formatters.js';
import { createPatientForm, validatePatientForm } from './patientProfile.js';
import { registrationDraftSnapshot, restoreRegistrationDraft, toPayload } from './patientRegistrationPayload.js';
import { assertFormDraftPayload } from './formDraftRegistry.js';
import { INITIAL_FORM_STATE } from './patientRegistrationDefaults.js';

test('directory uses middle initials and suffix without changing full names', () => {
  for (const [middle, expected] of [['Reyes', 'R.'], ['Santos', 'S.'], ['Dela Cruz', 'D.'], ['R', 'R.'], ['R.', 'R.'], ['', '']]) {
    const patient = { first_name: 'Juan', middle_name: middle, last_name: 'Dela Cruz', suffix: 'Jr.', full_name: 'Full stored name' };
    assert.equal(formatPatientName(patient, '', { middleInitial: true }), ['Juan', expected, 'Dela Cruz', 'Jr.'].filter(Boolean).join(' '));
    assert.equal(createPatientForm(patient).middleName, middle);
    assert.equal(patient.middle_name, middle);
  }
});
test('suffix options and custom suffix transitions retain actual values', () => {
  assert.deepEqual(SUFFIX_OPTIONS.map(option => option.label), ['None','Jr.','Sr.','II','III','IV','V','Other (Specify)']);
  for (const suffix of ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI']) {
    const form = suffixFields(suffix);
    assert.equal(savedSuffix(form), suffix);
    assert.equal(toPayload(form).suffix, suffix || null);
  }
  assert.ok(validatePatientForm({ suffix: '__other__', customSuffix: ' ' }).customSuffix);
  assert.equal(registrationFieldChange({suffix:'__other__',customSuffix:'VI'}, 'suffix', 'Jr.').customSuffix, '');
  assert.equal(Object.hasOwn(toPayload({ firstName: 'Legacy' }), 'suffix'), false);
});
test('contact inputs sanitize only user input and preserve uncertain legacy values on load', () => {
  for (const value of ['09123456789', '639123456789', '+639123456789']) assert.equal(localContact(value), '09123456789');
  for (const value of ['12345', '091234567890', '+12025550123', 'old extension 4']) assert.equal(localContact(value), value);
  assert.equal(contactInput('09ab12-345 6789'), '09123456789');
  assert.equal(contactInput('091234567890'), '09123456789');
  for (const value of ['', '09123456789', '12345678901']) assert.equal(contactError(value), '');
  for (const value of ['12345', '0912345678', '091234567890', '09a23456789']) {
    assert.equal(contactError(value), 'Contact number must contain exactly 11 digits.');
    assert.equal(contactError(value, true), 'Other contact number must contain exactly 11 digits.');
  }
});
for (const role of ['bhc', 'rhu']) {
  test(`${role} unfinished registration resumes suffix and partial phones without losing other fields`, () => {
    const form = { ...INITIAL_FORM_STATE, firstName: 'Juan', middleName: 'Reyes', lastName: 'Dela Cruz', suffix: '__other__', customSuffix: 'VI', contactNumber: '09123', guardianContactNumber: '09123456' };
    const payload = registrationDraftSnapshot({ form });
    assertFormDraftPayload('patient', payload);
    const restored = restoreRegistrationDraft(payload, INITIAL_FORM_STATE).form;
    assert.deepEqual(restored, form);
    assert.ok(validatePatientForm(restored).contactNumber);
    assert.ok(validatePatientForm(restored).guardianContactNumber);
    const completed = toPayload({ ...restored, contactNumber:'09123456789', guardianContactNumber:'09123456789' });
    assert.equal(completed.middle_name, 'Reyes'); assert.equal(completed.suffix, 'VI');
    assert.equal(completed.contact_number, '09123456789');
    const unfinished = restoreRegistrationDraft(registrationDraftSnapshot({ form: {suffix:'__other__', customSuffix:''} }), INITIAL_FORM_STATE).form;
    assert.equal(unfinished.suffix, '__other__'); assert.equal(unfinished.customSuffix, '');
  });
}
test('old API and nested draft shapes default suffix and safely normalize recognized phone formats', () => {
  for (const payload of [{first_name:'Old',middle_name:'Reyes',contact_number:'+639123456789'}, {registration:{form:{firstName:'Old',middleName:'Reyes',contactNumber:'639123456789'}}}]) {
    const form = restoreRegistrationDraft(payload, INITIAL_FORM_STATE).form;
    assert.equal(form.suffix, ''); assert.equal(form.middleName,'Reyes'); assert.equal(form.contactNumber,'09123456789');
  }
  const legacy = createPatientForm({middle_name:'Reyes',suffix:'VI',contact_number:'bad old value'});
  assert.equal(legacy.customSuffix, 'VI'); assert.equal(legacy.contactNumber, 'bad old value');
});
