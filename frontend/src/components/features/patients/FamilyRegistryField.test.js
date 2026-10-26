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
const { default: Field } = await server.ssrLoadModule('/src/components/features/patients/FamilyRegistryField.jsx');
const { PatientRegistrationSuccess } = await server.ssrLoadModule('/src/pages/bhc/AddPatient.jsx');
const registry = { patients: [], households: [] };
const render = (props = {}) => renderToStaticMarkup(createElement(Field, {
  registry, patient: { firstName: 'Adult', birthDate: '1990-01-01' },
  live: true, allowDirectCreate: true, connection: null, onChange: () => {}, onPendingChange: () => {}, ...props,
}));

test('new registration offers accessible search and create tabs immediately', () => {
  const html = render();
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, />Create New Household<\/button>/);
  assert.match(html, />Search Existing Household<\/button>/);
  assert.doesNotMatch(html, /No household found/);
});

test('incomplete and minor patients can select create while eligibility guidance stays inline', () => {
  for (const patient of [{}, { birthDate: '2020-01-01' }]) {
    const html = render({ patient, connection: { kind: 'new', headPatientId: 'self', household: { serialMode: 'auto', serialNumber: '', address: {} } } });
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>[^<]*Create New Household<\/button>/);
    assert.match(html, /date of birth first|under 18/);
    assert.match(html, /role="status"/);
  }
});

test('new-household draft keeps search available and never presents a guessed FSN', () => {
  const html = render({ connection: {
    kind: 'new', headPatientId: 'self', relationship: 'Household head',
    household: { serialMode: 'auto', serialNumber: '', address: {} },
  } });
  assert.match(html, />Search Existing Household<\/button>/);
  assert.doesNotMatch(html, /FSN-\d{4}-\d{4}/);
  assert.match(html, new RegExp(`FSN-${new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date())}-XXXX`));
  assert.match(html, /Format preview only/);
  assert.doesNotMatch(html, /Assigned automatically on save/);
  assert.match(html, /<input(?=[^>]*value="auto")(?=[^>]*checked="")[^>]*>/);
  const switchedBack = render({ connection: { kind: 'new', headPatientId: 'self', household: { serialMode: 'auto', serialNumber: 'CUSTOM-0042', address: {} } } });
  assert.doesNotMatch(switchedBack, /value="CUSTOM-0042"/);
});

test('manual mode exposes an editable FSN and retains both assignment options', () => {
  const html = render({ connection: { kind: 'new', headPatientId: 'self', household: { serialMode: 'manual', serialNumber: 'CUSTOM-0042', address: {} } } });
  assert.match(html, /Auto-generated/);
  assert.match(html, /Enter manually/);
  assert.match(html, /<input(?=[^>]*value="manual")(?=[^>]*checked="")[^>]*>/);
  assert.match(html, /<input[^>]*value="CUSTOM-0042"/);
  assert.doesNotMatch(html, /<input[^>]*readOnly[^>]*value="CUSTOM-0042"/);
});

test('a selected existing draft can still switch to create without affecting saved-patient flows', () => {
  const household = { id: '7', serialNumber: 'FSN-2026-0007', headPatientId: '8', address: {} };
  const props = { registry: { households: [household], patients: [{ id: '8', firstName: 'Head' }] }, connection: { kind: 'existing', householdId: '7', relationship: 'Sister' } };
  assert.match(render(props), />Create New Household<\/button>/);
  assert.doesNotMatch(render({ ...props, allowDirectCreate: false }), />Create New Household<\/button>/);
});

test('success feedback displays the committed FSN and omits a serial when none was returned', () => {
  assert.equal(typeof PatientRegistrationSuccess, 'function', 'Saved feedback should show the actual committed FSN');
  const success = (serialNumber) => renderToStaticMarkup(createElement(PatientRegistrationSuccess, { householdEnabled: true, live: true, serialNumber }));
  assert.match(success('FSN-2026-0042'), /Family Serial Number[\s\S]*FSN-2026-0042/);
  assert.doesNotMatch(success(''), /Family Serial Number|FSN-\d{4}-\d{4}/);
});
