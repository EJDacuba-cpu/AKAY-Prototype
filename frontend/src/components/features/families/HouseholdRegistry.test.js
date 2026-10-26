import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: Canvas } = await server.ssrLoadModule('/src/components/features/families/FamilyTreeCanvas.jsx');
const { default: List } = await server.ssrLoadModule('/src/components/features/families/FamilyMembersList.jsx');
const members = [
  { id: '1', firstName: 'Head', lastName: 'Patient' },
  { id: '2', firstName: 'Nephew', lastName: 'Patient', relationshipToHouseholdHead: 'Nephew' },
  { id: '3', firstName: 'Unrelated', lastName: 'Patient', relationshipToHouseholdHead: 'Non-relative' },
];

test('household visualization renders all members without saved connections or genealogy claims', () => {
  const html = renderToStaticMarkup(createElement(Canvas, { members, headId: '1' }));
  for (const name of ['Head Patient', 'Nephew Patient', 'Unrelated Patient']) assert.ok(html.includes(name), name);
  assert.match(html, /Household Relationships/);
  assert.match(html, /Household head/);
  assert.match(html, /Non-relative/);
  assert.match(html, /shared household membership, not biological parentage/);
  assert.doesNotMatch(html, /Add connections|Saved family connections|No saved family connection|Parent and child/);
});

test('missing head keeps members visible and explains the absent assignment', () => {
  const html = renderToStaticMarkup(createElement(Canvas, { members: members.slice(1), headId: 'missing' }));
  assert.match(html, /Nephew Patient/);
  assert.match(html, /Unrelated Patient/);
  assert.match(html, /No household head assigned/);
});

test('member list retains household labels and patient access without connection editing controls', () => {
  const html = renderToStaticMarkup(createElement(List, { members, headId: '1', canManage: true, canTransfer: true }));
  assert.match(html, /Household members/);
  assert.match(html, /Non-relative/);
  assert.doesNotMatch(html, /Edit Connections/);
});
