import test from 'node:test';
import assert from 'node:assert/strict';
import { householdPayload, normalizeHousehold, householdRegistry, householdKeys, registrationErrors } from './householdData.js';
import { stageConnection, validateConnection } from '../services/familyRegistry.js';

test('automatic household creation sends mode, never a browser allocated serial', () => {
  assert.deepEqual(householdPayload({kind:'new', household:{serialMode:'auto',serialNumber:'stale',address:{barangay:'Pitpitan'}}}),
    {kind:'new',serial_mode:'auto',address:{barangay:'Pitpitan'}});
  assert.equal(householdPayload({kind:'new',household:{serialMode:'manual',serialNumber:' folder-1 ',address:{}}}).serial_number,' folder-1 ');
});
test('existing household selection sends permanent identity and current version', () => {
  assert.deepEqual(householdPayload({kind:'existing',householdId:'7',relationship:'Son / Daughter'}, {households:[{id:'7',version:3}]}),
    {kind:'existing',household_id:'7',relationship:'Son / Daughter',version:3});
});
test('registry-only registration omits every retired relationship command even from stale drafts', () => {
  for (const type of ['spouse', 'sibling', 'mother', 'father']) {
    assert.deepEqual(householdPayload({ kind: 'existing', householdId: '7', relationship: 'Mother', relationshipLink: { type } },
      { households: [{ id: '7', version: 3 }] }, { includeRelationshipLink: false }), {
      kind: 'existing', household_id: '7', relationship: 'Mother', version: 3,
    });
  }
});

test('live household drafts preserve historical parent references and manually reported information', () => {
  const original = { familySerialNumber: 'OLD', motherPatientId: '8', fatherPatientId: '9', motherName: '', fatherName: 'Reported father', guardianName: 'Guardian' };
  const staged = stageConnection(original, { households: [{ id: '7', serialNumber: 'NEW', address: {} }] },
    { kind: 'existing', householdId: '7', relationship: 'Nephew' }, { preserveParentLinks: true });
  assert.equal(staged.familySerialNumber, 'NEW');
  for (const field of ['motherPatientId', 'fatherPatientId', 'motherName', 'fatherName', 'guardianName']) assert.equal(staged[field], original[field], field);
  assert.equal(original.familySerialNumber, 'OLD');
});
test('household responses normalize numeric IDs and safe member demographics', () => {
  const item=normalizeHousehold({id:7,serial_number:'FSN-2026-0001',head_patient_id:9,version:2,address:{barangay:'Pitpitan'},members:[{id:9,first_name:'Ana',last_name:'Cruz',birthdate:'1980-01-01',household_id:7} ]});
  assert.equal(item.id,'7'); assert.equal(item.headPatientId,'9'); assert.equal(item.members[0].householdId,'7');
  assert.equal(item.members[0].firstName,'Ana'); assert.equal(item.members[0].birthDate,'1980-01-01');
  const registry=householdRegistry([item,item],{id:'9',firstName:'Updated'});
  assert.equal(registry.households.length,1); assert.equal(registry.patients.length,1); assert.equal(registry.patients[0].firstName,'Updated');
});
test('household query identity separates account, active facility, and BHC/RHU namespace', () => {
  const a={id:'1',role:'bhc',facilityId:4,working_facility_key:'home'};
  assert.notDeepEqual(householdKeys(a), householdKeys({...a,facilityId:5}));
  assert.notDeepEqual(householdKeys(a), householdKeys({...a,id:'2'}));
  assert.notDeepEqual(householdKeys(a, 'bhc'), householdKeys({...a, ruralHealthUnitId: 9}, 'rhu'));
});
test('backend field errors map to registration inputs without losing general errors', () => {
  assert.deepEqual(registrationErrors({errors:{first_name:['Required'],'household.serial_number':['Already used'],'household.relationship':['Choose relationship']}}),
    {firstName:'Required',familySerialNumber:'Already used',relationshipToHouseholdHead:'Choose relationship'});
  assert.equal(registrationErrors({status:409,message:'Reload and retry'}).familySerialNumber,'Reload and retry');
  assert.deepEqual(registrationErrors({errors:{'relationships.12':['Review the new household member']}}),{familySerialNumber:'Review the new household member'});
});
test('automatic registration validates a new household without a browser number; manual requires a value', () => {
  const connection={kind:'new',headPatientId:'self',household:{serialMode:'auto',serialNumber:'',address:{streetAddress:'Main street',purokArea:'Zone 1',barangay:'Pitpitan',municipality:'Bulakan'}}};
  const registry={households:[],patients:[]};
  const patient={birthDate:'1980-01-01'};
  assert.deepEqual(validateConnection(registry,connection,undefined,patient),{});
  assert.equal(validateConnection(registry,{...connection,household:{...connection.household,serialMode:'manual'}},undefined,patient).serialNumber,'Family Serial Number is required.');
});
test('education validation errors land on the education fields', () => {
  assert.deepEqual(registrationErrors({errors:{education_level:['The selected education level is invalid.'],education_completed:['Invalid.']}}),
    {educationLevel:'The selected education level is invalid.',educationCompleted:'Invalid.'});
});
test('a rejected registration link is reported on the relationship field', () => {
  assert.deepEqual(registrationErrors({errors:{'household.relationship_link':['Only Husband or Wife can be recorded as spouse']}}),{relationshipToHouseholdHead:'Only Husband or Wife can be recorded as spouse'});
});
