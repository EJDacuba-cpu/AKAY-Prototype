import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const cacheDir = mkdtempSync(join(tmpdir(), 'akay-dispensing-loading-'));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unexpected test cache path');
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: RhuToDispenseTab } = await server.ssrLoadModule('/src/components/features/medicine/RhuToDispenseTab.jsx');
const { queryKeys } = await server.ssrLoadModule('/src/utils/queryKeys.js');
const key = queryKeys.toDispense('rhu');
const clients = [];
after(() => clients.forEach(client => client.clear()));
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } });
  clients.push(value);
  return value;
}
const render = value => renderToStaticMarkup(createElement(QueryClientProvider, { client: value }, createElement(RhuToDispenseTab)));

test('initial dispensing request renders loading rather than a false empty queue', () => {
  const html = render(client());
  assert.match(html, /Loading prescriptions to dispense/);
  assert.doesNotMatch(html, /No prescriptions to dispense|Search patients to dispense|Review prescription/);
});

test('offline initial request stays pending instead of reporting an empty dispensing queue', () => {
  onlineManager.setOnline(false);
  try {
    const html = render(client());
    assert.match(html, /Loading prescriptions to dispense/);
    assert.doesNotMatch(html, /No prescriptions to dispense/);
  } finally {
    onlineManager.setOnline(true);
  }
});

test('failed initial request exposes retry instead of the empty queue', async () => {
  const value = client();
  await value.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('Offline')) }).catch(() => {});
  const html = render(value);
  assert.match(html, /Try again|Retry/i);
  assert.doesNotMatch(html, /No prescriptions to dispense|Search patients to dispense/);
});

test('successful empty queue renders immediately', () => {
  const value = client();
  value.setQueryData(key, []);
  const html = render(value);
  assert.match(html, /No prescriptions to dispense/);
  assert.doesNotMatch(html, /Loading prescriptions to dispense/);
});

test('cached queue remains usable while refreshing and after a refresh failure', async () => {
  const value = client();
  value.setQueryData(key, [{ id: 1, patientName: 'Test patient', visitDate: '2026-11-07', status: 'pending' }]);
  const query = value.getQueryCache().find({ queryKey: key });
  query.setState({ fetchStatus: 'fetching' });
  let html = render(value);
  assert.match(html, /Test patient/);
  assert.match(html, /Updating prescriptions/);
  assert.doesNotMatch(html, /Loading prescriptions to dispense/);
  query.setState({ fetchStatus: 'idle', status: 'error', error: new Error('Offline') });
  html = render(value);
  assert.match(html, /Test patient/);
  assert.match(html, /Couldn&#x27;t refresh prescriptions/);
  assert.match(html, /Retry/);
});
