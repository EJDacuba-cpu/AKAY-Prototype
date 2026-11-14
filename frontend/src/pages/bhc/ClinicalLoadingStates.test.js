import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const cacheDir = mkdtempSync(join(tmpdir(), 'akay-clinical-loading-'));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unexpected test cache path');
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: ReferralDetails } = await server.ssrLoadModule('/src/pages/bhc/ReferralDetails.jsx');
const { default: MonitoringHandoffReview } = await server.ssrLoadModule('/src/pages/bhc/MonitoringHandoffReview.jsx');
const { default: PatientsModule } = await server.ssrLoadModule('/src/pages/bhc/PatientsModule.jsx');
const { NotificationProvider } = await server.ssrLoadModule('/src/hooks/useNotificationsContext.jsx');
const { queryKeys } = await server.ssrLoadModule('/src/utils/queryKeys.js');

async function renderError(Component, route, path, key) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } });
  await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('Offline')) }).catch(() => {});
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(NotificationProvider, null, createElement(Routes, null, createElement(Route, { path: route, element: createElement(Component) }))))));
  client.clear();
  return html;
}

function renderDirectory(client, path) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(NotificationProvider, null, createElement(PatientsModule)))));
}

test('initial referral connection error provides recovery instead of a false not-found diagnosis', async () => {
  const html = await renderError(ReferralDetails, '/bhc/referrals/:trackingId', '/bhc/referrals/REF-7', queryKeys.referralDetails('bhc', 'REF-7'));
  assert.match(html, /Try again|Retry/i);
  assert.doesNotMatch(html, /The referral record you are looking for does not exist/);
});

test('initial monitoring request connection error provides recovery instead of not-found', async () => {
  const html = await renderError(MonitoringHandoffReview, '/bhc/patients/monitoring-requests/:requestId', '/bhc/patients/monitoring-requests/7', queryKeys.monitoringHandoff('7'));
  assert.match(html, /Try again|Retry/i);
  assert.doesNotMatch(html, /This request does not exist or belongs to another facility/);
});

const emptyDirectoryFilters = {
  search: '',
  sex: 'All',
  barangay: 'All Barangays',
  ageGroup: 'All Age Groups',
  civilStatus: 'All Civil Status',
  dateRegistered: '',
};

const emptyDirectoryKey = [...queryKeys.patients('bhc'), 'directory', emptyDirectoryFilters];

const emptyDirectoryPage = {
  pages: [{ items: [], meta: { current_page: 1, last_page: 1, per_page: 50, total: 0 }, filterOptions: { barangays: [], civilStatuses: [] } }],
  pageParams: [1],
};

test('monitoring directory uses its own pending request rather than the unrelated patient cache', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } });
  client.setQueryData(emptyDirectoryKey, emptyDirectoryPage);
  const html = renderDirectory(client, '/bhc/patients?view=monitoring-requests');
  client.clear();
  assert.match(html, /Loading monitoring requests/);
  assert.doesNotMatch(html, /No monitoring requests\./);
});

test('successful empty patient directory is preserved on a background refresh failure', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } });
  client.setQueryData(emptyDirectoryKey, emptyDirectoryPage);
  client.getQueryCache().find({ queryKey: emptyDirectoryKey }).setState({ status: 'error', error: new Error('Offline'), fetchStatus: 'idle' });
  const html = renderDirectory(client, '/bhc/patients');
  client.clear();
  assert.match(html, /No patients yet\./);
  assert.match(html, /Showing the last list that loaded/);
  assert.doesNotMatch(html, /Loading patients/);
});
