import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutHouseholdTree, layoutFamilyTree } from './familyTree.js';

const members = (count) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1) }));
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('an explicitly linked sibling pair sits side by side in one row', () => {
  const layout = layoutHouseholdTree(members(4), [{ from: '2', to: '4', type: 'sibling' }], '1');
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get('2').y, byId.get('4').y);
  assert.equal(Math.abs(byId.get('2').x - byId.get('4').x), 216 + 88);
});

test('members without any edge each appear exactly once', () => {
  const layout = layoutHouseholdTree(members(7), [], '3');
  assert.deepEqual(layout.nodes.map((node) => node.id).sort(), members(7).map((item) => item.id).sort());
});

test('a 40-member household has no overlapping cards', () => {
  const people = members(40);
  const edges = [];
  for (let id = 3; id <= 40; id++) edges.push({ from: String(id < 20 ? 1 : 2), to: String(id), type: 'parent' });
  edges.push({ from: '1', to: '2', type: 'spouse' }, { from: '5', to: '6', type: 'sibling' }, { from: '21', to: '22', type: 'sibling' });
  const { nodes } = layoutHouseholdTree(people, edges, '1');
  assert.equal(nodes.length, 40);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.equal(overlaps(nodes[i], nodes[j]), false, `${nodes[i].id} overlaps ${nodes[j].id}`);
});

test('cyclic parent data terminates and keeps every member', () => {
  const edges = [{ from: '1', to: '2', type: 'parent' }, { from: '2', to: '3', type: 'parent' }, { from: '3', to: '1', type: 'parent' }];
  assert.equal(layoutHouseholdTree(members(3), edges, '1').nodes.length, 3);
});

test('the prototype layout still ignores sibling edges (output unchanged)', () => {
  const proto = layoutFamilyTree(members(3), [{ from: '1', to: '2', type: 'sibling' }], '1');
  const plain = layoutFamilyTree(members(3), [], '1');
  assert.deepEqual(proto, plain);
});

test('many members without a saved connection wrap into a grid instead of one very wide row', () => {
  const people = members(26);
  const edges = [{ from: '1', to: '2', type: 'spouse' }, { from: '1', to: '3', type: 'parent' }, { from: '2', to: '3', type: 'parent' }];
  const { nodes, width } = layoutHouseholdTree(people, edges, '1');
  assert.equal(nodes.length, 26);
  assert.ok(width <= 6 * 216 + 5 * 88 + 64, `canvas too wide: ${width}`);
  const treeBottom = Math.max(...nodes.filter((node) => ['1', '2', '3'].includes(node.id)).map((node) => node.y + node.height));
  assert.ok(nodes.filter((node) => !['1', '2', '3'].includes(node.id)).every((node) => node.y > treeBottom));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.equal(overlaps(nodes[i], nodes[j]), false, `${nodes[i].id} overlaps ${nodes[j].id}`);
});

test('a household where nobody is connected still lays out as a grid starting at the top', () => {
  const { nodes } = layoutHouseholdTree(members(10), [], '1');
  assert.equal(nodes.length, 10);
  assert.ok(Math.min(...nodes.map((node) => node.y)) >= 0);
  assert.equal(new Set(nodes.map((node) => node.x)).size, 6);
});
