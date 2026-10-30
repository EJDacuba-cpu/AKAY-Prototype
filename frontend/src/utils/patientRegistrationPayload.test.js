import test from 'node:test';
import assert from 'node:assert/strict';
import { EDUCATION_COMPLETED_OPTIONS, EDUCATION_LEVEL_OPTIONS, readEducation, toPayload } from './patientRegistrationPayload.js';

test('an edited registration DOB wins over saved API date aliases', () => {
  const payload=toPayload({firstName:'Ana',lastName:'Cruz',birthdate:'1990-01-01',dateOfBirth:'1990-01-01',birthDate:'1991-02-03'});
  assert.equal(payload.birthdate,'1991-02-03');
});
test('structured membership cannot send a contradictory compatibility FSN', () => {
  const selection={kind:'existing',household_id:'4',relationship:'Sibling',version:2};
  const payload=toPayload({firstName:'Ana',lastName:'Cruz',familySerialNumber:'OLD',household:selection});
  assert.deepEqual(payload.household,selection);
  assert.equal(Object.hasOwn(payload,'family_serial_number'),false);
});
test('walk-in check-in fields pass through only when present', () => {
  const sent = toPayload({ firstName: 'Ana', lastName: 'Cruz', check_in: { key: 'k1' }, confirm_possible_duplicate: true });
  assert.deepEqual(sent.check_in, { key: 'k1' });
  assert.equal(sent.confirm_possible_duplicate, true);
  const plain = toPayload({ firstName: 'Ana', lastName: 'Cruz' });
  assert.equal(Object.hasOwn(plain, 'check_in'), false);
  assert.equal(Object.hasOwn(plain, 'confirm_possible_duplicate'), false);
});
test('legacy callers retain their explicit serial without a structured selection', () => {
  assert.equal(toPayload({familySerialNumber:'PAPER-01'}).family_serial_number,'PAPER-01');
});
test('an identity save without a structured selection never sends a household command', () => {
  const payload = toPayload({ firstName: 'Ana', lastName: 'Cruz', familySerialNumber: 'PAPER-01' });
  assert.equal(Object.hasOwn(payload, 'household'), false);
  assert.equal(payload.family_serial_number, 'PAPER-01');
});
test('a structured household selection is sent for BHC and RHU registration', () => {
  const selection={kind:'new',serial_mode:'auto',address:{barangay:'Pitpitan'}};
  assert.deepEqual(toPayload({firstName:'Ana',lastName:'Cruz',household:selection}).household, selection);
});
test('a read-only household summary is not mistaken for a membership command', () => {
  const payload=toPayload({familySerialNumber:'FSN-2026-0001',household:{id:4,serial_number:'FSN-2026-0001'}});
  assert.equal(Object.hasOwn(payload,'household'),false);
  assert.equal(payload.family_serial_number,'FSN-2026-0001');
});
test('explicitly cleared registration fields never revive saved aliases', () => {
  const payload=toPayload({motherPatientId:'',mother_patient_id:17,fatherPatientId:'',father_patient_id:19,
    contactNumber:'',contact:'09123456789',spouseName:'',spouse_name:'Old spouse',
    motherBirthDate:'',mother_birth_date:'1970-01-01',purokArea:'',purok_area:'Old purok'});
  for(const field of ['mother_patient_id','father_patient_id','contact_number','spouse_name','mother_birth_date','purok_area']) assert.equal(payload[field],null,field);
});
test('education level and completion are sent as registration fields', () => {
  const payload=toPayload({firstName:'Ana',lastName:'Cruz',educationLevel:'College',educationCompleted:'Graduate'});
  assert.equal(payload.education_level,'College');
  assert.equal(payload.education_completed,'Graduate');
});
test('an explicitly cleared education is sent as null and never revives the saved value', () => {
  const payload=toPayload({educationLevel:'',education_level:'College',educationCompleted:'',education_completed:'Graduate'});
  assert.equal(payload.education_level,null);
  assert.equal(payload.education_completed,null);
});
test('a form without education fields leaves saved education untouched', () => {
  const payload=toPayload({firstName:'Ana',lastName:'Cruz',occupation:'Farmer'});
  assert.equal(Object.hasOwn(payload,'education_level'),false);
  assert.equal(Object.hasOwn(payload,'education_completed'),false);
});
test('saved education is read from either API spelling, blank when missing', () => {
  assert.deepEqual(readEducation({education_level:'High School',education_completed:'Level'}),{educationLevel:'High School',educationCompleted:'Level'});
  assert.deepEqual(readEducation({educationLevel:'College',educationCompleted:null}),{educationLevel:'College',educationCompleted:''});
  assert.deepEqual(readEducation({education_level:null}),{educationLevel:'',educationCompleted:''});
  assert.deepEqual(readEducation(),{educationLevel:'',educationCompleted:''});
});
test('education options match the API and the history form lists', () => {
  assert.deepEqual(EDUCATION_LEVEL_OPTIONS,['None','Elementary','High School','Senior High School','Vocational','College','Postgraduate']);
  assert.deepEqual(EDUCATION_COMPLETED_OPTIONS,['Level','Graduate']);
});

test('birth details are never sent, even when a form still carries stored values', () => {
  const payload=toPayload({firstName:'Mia',lastName:'Cruz',birthPlace:'Bulakan',birth_place:'Bulakan',birthTime:'08:30',birthWeight:'3.1',birthHeight:'50'});
  for(const field of ['birth_place','birth_time','birth_weight','birth_height']) assert.equal(Object.hasOwn(payload,field),false,field);
});
function monthsAgoIso(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

test('an infant payload omits adult socio-demographic fields instead of sending Single or null', () => {
  const payload = toPayload({
    firstName: 'Mia', lastName: 'Cruz', birthDate: monthsAgoIso(3), sex: 'Female',
    civilStatus: 'Single', occupation: 'Should omit', educationLevel: 'None',
    educationCompleted: 'Level', nhtsStatus: 'NHTS', spouseName: 'Should omit',
    spouseOccupation: 'Should omit', motherName: 'Ana Cruz',
  });
  for (const field of ['civil_status', 'occupation', 'education_level', 'education_completed', 'nhts_status', 'spouse_name', 'spouse_occupation']) {
    assert.equal(Object.hasOwn(payload, field), false, field);
  }
  assert.equal(payload.mother_name, 'Ana Cruz');
  assert.equal(payload.birthdate, monthsAgoIso(3));
});

test('an adult payload still sends socio-demographic fields', () => {
  const payload = toPayload({
    firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01',
    civilStatus: 'Married', occupation: 'Farmer', educationLevel: 'College',
    educationCompleted: 'Graduate', nhtsStatus: 'Non-NHTS', spouseName: 'Ben',
    spouseOccupation: 'Driver',
  });
  assert.equal(payload.civil_status, 'Married');
  assert.equal(payload.occupation, 'Farmer');
  assert.equal(payload.education_level, 'College');
  assert.equal(payload.nhts_status, 'Non-NHTS');
  assert.equal(payload.spouse_name, 'Ben');
});

test('parent links are sent only by forms that carry them', () => {
  assert.equal(Object.hasOwn(toPayload({firstName:'Mia',lastName:'Cruz',motherName:'Ana'}),'mother_patient_id'),false);
  assert.equal(Object.hasOwn(toPayload({firstName:'Mia',lastName:'Cruz'}),'father_patient_id'),false);
  const linked=toPayload({firstName:'Mia',lastName:'Cruz',motherPatientId:'7',fatherPatientId:'8'});
  assert.equal(linked.mother_patient_id,'7');
  assert.equal(linked.father_patient_id,'8');
  assert.equal(toPayload({motherPatientId:''}).mother_patient_id,null);
});
