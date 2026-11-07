import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const cacheDir = mkdtempSync(join(tmpdir(), 'akay-records-loading-'));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unexpected test cache path');
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: PatientRecordsTab } = await server.ssrLoadModule('/src/components/features/patients/profile/PatientRecordsTab.jsx');
const { default: PatientReferralsTab } = await server.ssrLoadModule('/src/components/features/patients/profile/PatientReferralsTab.jsx');
const { ReferralsSection } = await server.ssrLoadModule('/src/components/features/patients/profile/FollowUpsAndReferrals.jsx');
function render(props = {}, Component = PatientRecordsTab) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(Component, { patientId: 7, ...props }))));
  client.clear();
  return html;
}
test('initial record panel replaces its controls along with the records', () => {
  const html = render({ isLoading: true });
  assert.match(html, /Loading health records/);
  assert.doesNotMatch(html, /<input|<button|No health records yet/);
});
test('record refresh error retains already loaded clinical history', () => {
  const html = render({ isError: true, records: [{ id: 71, recordType: 'General Consultation', chiefComplaint: 'Cached complaint', consultationDate: '2026-11-07' }] });
  assert.match(html, /Cached complaint/);
  assert.doesNotMatch(html, /Unable to load health records/);
});
test('settled empty record panel renders its empty state and filters immediately', () => {
  const html = render();
  assert.match(html, /No health records yet/);
  assert.match(html, /Search health records/);
  assert.doesNotMatch(html, /Loading health records/);
});

for (const [Component, empty] of [[PatientRecordsTab, /No health records yet/], [PatientReferralsTab, /No referral history found/], [ReferralsSection, /No referral history found/]]) {
  test(`${Component.name} preserves a successful empty cache on refresh failure`, () => {
    const html = render({ hasData: true, isError: true, error: new Error('Offline') }, Component);
    assert.match(html, empty);
    assert.match(html, /Unable to refresh/);
    assert.doesNotMatch(html, /Unable to load/);
  });

  test(`${Component.name} gates cached clinical content on forbidden responses`, () => {
    const html = render({ hasData: true, isError: true, error: Object.assign(new Error('Forbidden'), { status: 403 }), records: [{ id: 71, chiefComplaint: 'Protected complaint' }], referrals: [{ id: 'REF-7', receivingFacility: 'Protected facility' }] }, Component);
    assert.doesNotMatch(html, /Protected complaint|Protected facility/);
    assert.match(html, /Unable to load/);
  });
}
