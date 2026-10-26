import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutHouseholdRegistry } from './familyTree.js';

test('every household member appears without biological or saved relationship links', () => {
  const members = [{ id: '1', relationshipToHouseholdHead: 'Household head' }, { id: '2', relationshipToHouseholdHead: 'Nephew' }, { id: '3', relationshipToHouseholdHead: 'Non-relative' }];
  const layout = layoutHouseholdRegistry(members, '1');
  assert.deepEqual(layout.nodes.map(node => node.id).sort(), ['1', '2', '3']);
  assert.equal(layout.nodes.find(node => node.id === '2').relationshipToHouseholdHead, 'Nephew');
  assert.ok(layout.width > 0 && layout.height > 0);
});

test('historical genealogy fields never affect household layout or labels', () => {
  const plain = [{ id: '1' }, { id: '2', relationshipToHouseholdHead: 'Brother' }];
  const geometry = layout => ({ width: layout.width, height: layout.height,
    nodes: layout.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height, relationship: node.relationshipToHouseholdHead })),
  });
  assert.deepEqual(geometry(layoutHouseholdRegistry(plain, '1')), geometry(layoutHouseholdRegistry([
    { ...plain[0], fatherPatientId: '2' }, { ...plain[1], motherPatientId: '1' },
  ], '1')));
});

test('missing head and empty households retain all available members without inventing a head', () => {
  assert.equal(layoutHouseholdRegistry([{ id: '2' }, { id: '3' }], 'missing').nodes.length, 2);
  assert.equal(layoutHouseholdRegistry([], null).nodes.length, 0);
});
