import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement, act, useState } from 'react';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'CustomEvent', 'Node']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createMemoryRouter, RouterProvider } = await import('react-router');
const server = await createServer({ configFile: false, plugins: [{ name: 'test-shell', enforce: 'pre', load(id) {
  if (id.endsWith('/components/layout/DashboardLayout.jsx')) return 'export default function Layout({children}) { return children; }';
  if (id.endsWith('/config/environment.js')) return 'export const API_BASE_URL = "https://example.test/api";';
} }, react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { RegistrationForm } = await server.ssrLoadModule('/src/pages/bhc/AddPatient.jsx');
const { default: Field } = await server.ssrLoadModule('/src/components/features/patients/FamilyRegistryField.jsx');
const { householdPayload } = await server.ssrLoadModule('/src/utils/householdData.js');
const { createPatient } = await server.ssrLoadModule('/src/services/patientService.js');
const { getHouseholds } = await server.ssrLoadModule('/src/services/householdService.js');
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await server.close(); await dom.happyDOM.close(); });
const address = { streetAddress: 'Test Street', barangay: 'Balubad', municipality: 'Bulakan' };
const patient = { id: '1', firstName: 'Synthetic', lastName: 'Patient', birthDate: '1990-01-01', sex: 'Female', civilStatus: 'Married', spouseName: 'Historical spouse', spouseOccupation: 'Historical occupation', ...address };
const registry = { households: [{ id: '8', serialNumber: 'FSN-2026-0008', headPatientId: '1', address, version: 3 }], patients: [patient], connections: [] };
async function mount(element) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, async close() { await act(async () => root.unmount()); container.remove(); } };
}
const click = async node => { assert.ok(node, 'button exists'); await act(async () => node.click()); };
const button = (c, text) => [...c.querySelectorAll('button')].find(n => n.textContent === text);

test('registration omits Husband Information and preserves historical spouse values on save', async () => {
  let saved;
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/', element: createElement(RegistrationForm, { patientId: '1', registry, householdEnabled: false, savePatient: async data => { saved = data; return patient; } }) }]);
  const app = await mount(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  try {
    assert.doesNotMatch(app.container.textContent, /Husband Information|Husband Name|Husband Occupation/);
    assert.equal(app.container.querySelector('[name="spouseName"]'), null);
    assert.equal(app.container.querySelector('[name="spouseOccupation"]'), null);
    await act(async () => app.container.querySelector('form').dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })));
    assert.match(document.body.textContent, /Save Patient\?/);
    await click([...document.body.querySelectorAll('button')].filter(n => n.textContent === 'Save Patient').at(-1));
    assert.equal(saved.spouseName, patient.spouseName);
    assert.equal(saved.spouseOccupation, patient.spouseOccupation);
  } finally { await app.close(); router.dispose(); client.clear(); }
});

test('automatic FSN is a preview and serial_mode auto reaches registration save', async () => {
  let connection;
  function Harness() {
    const [value, setValue] = useState(null);
    return createElement(Field, { registry, patient: { ...patient, id: '' }, live: true, allowDirectCreate: true, connection: value, onPendingChange() {}, onChange(next) { connection = next; setValue(next); } });
  }
  const app = await mount(createElement(Harness));
  try {
    await click(button(app.container, 'Create New Household'));
    assert.equal(app.container.querySelector('[aria-label="FSN format preview"]').readOnly, true);
    const household = householdPayload(connection, registry);
    assert.equal(household.serial_mode, 'auto');
    assert.equal(Object.hasOwn(household, 'serial_number'), false);
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ data: { id: 22, first_name: 'Synthetic', family_serial_number: 'FSN-2026-0012' } }), { status: 201 }); };
    const result = await createPatient({ ...patient, household });
    assert.equal(result.familySerialNumber, 'FSN-2026-0012');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(JSON.parse(calls[0].options.body).household.serial_mode, 'auto');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
  } finally { globalThis.fetch = originalFetch; await app.close(); }
});

test('existing household lookup and confirmed spouse label reach registration save', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: options.method === 'POST' ? { id: 22, household_id: 8, family_serial_number: 'FSN-2026-0008' } : [{ id: 8, serial_number: 'FSN-2026-0008', head_patient_id: 1, address, version: 3, members: [patient] }] }), { status: options.method === 'POST' ? 201 : 200 });
  };
  const page = await getHouseholds({ lookup: true, search: 'FSN-2026-0008' });
  let connection;
  function Harness() {
    const [value, setValue] = useState(null);
    return createElement(Field, { registry, patient: { ...patient, id: '' }, live: true, connection: value, searchResults: page.items, onSearch() {}, onPendingChange() {}, onChange(next) { connection = next; setValue(next); } });
  }
  const app = await mount(createElement(Harness));
  try {
    const input = app.container.querySelector('input[type="search"]');
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value').set; setter.call(input, 'FSN-2026-0008'); input.dispatchEvent(new dom.Event('input', { bubbles: true })); });
    await click(button(app.container, 'Search'));
    await click([...app.container.querySelectorAll('button')].find(n => n.textContent.includes('FSN-2026-0008')));
    const select = app.container.querySelector('select');
    assert.ok([...select.options].some(o => o.value === 'Wife'));
    await act(async () => { select.value = 'Wife'; select.dispatchEvent(new dom.Event('change', { bubbles: true })); });
    await click(button(app.container, 'Confirm Household'));
    const household = householdPayload(connection, registry);
    assert.deepEqual(household, { kind: 'existing', household_id: '8', relationship: 'Wife', version: 3 });
    await createPatient({ ...patient, household });
    assert.match(calls[0].url, /\/bhc\/households\/lookup\?/);
    assert.equal(JSON.parse(calls.at(-1).options.body).household.household_id, '8');
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  } finally { globalThis.fetch = originalFetch; await app.close(); }
});
