import test from 'node:test';
import assert from 'node:assert/strict';
import { RELATIONSHIP_LABELS, linkTypeForLabel, labelOptions, isAcceptedLabel } from './relationshipLabels.js';
import { validateConnection, validateHeadReplacement, RELATIONSHIPS } from '../services/familyRegistry.js';
import { relationshipLinkOffer } from './relationshipLink.js';

test('only Husband/Wife and Brother/Sister map to a link type', () => {
  for (const [label, type] of [['Husband', 'spouse'], ['Wife', 'spouse'], ['Brother', 'sibling'], ['Sister', 'sibling']]) assert.equal(linkTypeForLabel(label), type);
  for (const label of ['Partner', 'Son', 'Father', 'Mother', 'Grandmother', 'Spouse / Partner', 'Sibling', '', undefined]) assert.equal(linkTypeForLabel(label), null, String(label));
});

test('legacy labels are offered as a disabled saved entry and the new list has no combined labels', () => {
  assert.ok(RELATIONSHIP_LABELS.every((label) => !label.includes(' / ')));
  const legacy = labelOptions('Son / Daughter');
  assert.equal(legacy.length, RELATIONSHIP_LABELS.length + 1);
  assert.deepEqual(legacy.at(-1), { value: 'Son / Daughter', label: 'Saved: Son / Daughter (choose a specific relationship)', legacy: true });
  assert.equal(labelOptions('Son').length, RELATIONSHIP_LABELS.length);
  assert.equal(labelOptions('').length, RELATIONSHIP_LABELS.length);
  assert.equal(labelOptions('Household head').length, RELATIONSHIP_LABELS.length);
});

test('a legacy label is accepted only when unchanged', () => {
  assert.equal(isAcceptedLabel('Son / Daughter', 'Son / Daughter'), true);
  assert.equal(isAcceptedLabel('Parent', 'Son / Daughter'), false);
  assert.equal(isAcceptedLabel('Son / Daughter', ''), false);
  assert.equal(isAcceptedLabel('Child', 'Child'), false);
  assert.equal(isAcceptedLabel('Wife', ''), true);
});

test('the registration offer appears only for linkable labels and names the head', () => {
  assert.deepEqual(relationshipLinkOffer('Wife', 'Ana Cruz'), { type: 'spouse', text: 'Record as spouse of Ana Cruz' });
  assert.deepEqual(relationshipLinkOffer('Brother', 'Ana Cruz'), { type: 'sibling', text: 'Record as sibling of Ana Cruz' });
  for (const label of ['Partner', 'Son', 'Father', 'Spouse / Partner', '']) assert.equal(relationshipLinkOffer(label, 'Ana Cruz'), null);
  assert.equal(relationshipLinkOffer('Husband', '').text, 'Record as spouse of the household head');
});

const registry = {
  households: [{ id: '7', serialNumber: 'FSN-1', headPatientId: '1', address: {} }],
  patients: [
    { id: '1', householdId: '7', relationshipToHouseholdHead: 'Household head' },
    { id: '2', householdId: '7', relationshipToHouseholdHead: 'Son / Daughter' },
  ],
};
const existing = (relationship) => ({ kind: 'existing', householdId: '7', relationship });

test('live validation uses the specific list, keeps an unchanged legacy label, and rejects a changed one', () => {
  assert.deepEqual(validateConnection(registry, existing('Wife'), '3', undefined, isAcceptedLabel), {});
  assert.ok(validateConnection(registry, existing('Son / Daughter'), '3', undefined, isAcceptedLabel).relationship);
  assert.deepEqual(validateConnection(registry, existing('Son / Daughter'), '2', undefined, isAcceptedLabel), {});
  assert.ok(validateConnection(registry, existing('Parent'), '2', undefined, isAcceptedLabel).relationship);
  assert.ok(validateConnection(registry, existing(''), '3', undefined, isAcceptedLabel).relationship);
});

test('the mock prototype keeps validating against its own combined list by default', () => {
  assert.deepEqual(validateConnection(registry, existing('Son / Daughter'), '3'), {});
  assert.ok(validateConnection(registry, existing('Wife'), '3').relationship);
  assert.ok(RELATIONSHIPS.includes('Son / Daughter'));
});

test('head replacement relationships follow the supplied rule', () => {
  const leaving = { kind: 'existing', householdId: '9', relationship: 'Wife' };
  const base = (saved) => ({
    households: [{ id: '7', serialNumber: 'FSN-1', headPatientId: '1', address: {} }],
    patients: [
      { id: '1', householdId: '7', relationshipToHouseholdHead: 'Household head' },
      { id: '2', householdId: '7', relationshipToHouseholdHead: 'Wife' },
      { id: '3', householdId: '7', relationshipToHouseholdHead: saved },
    ],
  });
  const replace = (relationships) => ({ householdId: '7', headPatientId: '2', relationships });
  assert.deepEqual(validateHeadReplacement(base('Son'), '1', leaving, replace({ 3: 'Son' }), isAcceptedLabel), {});
  assert.deepEqual(validateHeadReplacement(base('Son / Daughter'), '1', leaving, replace({ 3: 'Son / Daughter' }), isAcceptedLabel), {});
  assert.ok(validateHeadReplacement(base('Son'), '1', leaving, replace({ 3: 'Son / Daughter' }), isAcceptedLabel)['3']);
  assert.ok(validateHeadReplacement(base('Son'), '1', leaving, replace({}), isAcceptedLabel)['3']);
});
