import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const cacheDir = join(tmpdir(), `akay-access-loading-${process.pid}`);
const server = await createServer({
  configFile: false, cacheDir, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { accessRowsReducer, INITIAL_ACCESS_ROWS } = await server.ssrLoadModule('/src/components/features/password-access/useAccessRows.js');
const { default: AccessRequestTable } = await server.ssrLoadModule('/src/components/features/password-access/AccessRequestTable.jsx');

const renderList = (props = {}) => renderToStaticMarkup(createElement(AccessRequestTable, {
  rows: [], columns: [{ key: 'account', label: 'Account', render: row => row.email }],
  statusOf: () => ({ label: 'Pending', tone: 'warning' }), menuFor: () => [],
  emptyMessage: 'No invites yet', emptyHint: 'New invites appear here.',
  filters: { search: '', status: 'all' }, onFiltersChange: () => {},
  panelLabelledBy: 'access-tab-invites', ...props,
}));

test('first load replaces the complete access toolbar and table with one loading region', () => {
  const html = renderList({ loading: true });
  assert.equal([...html.matchAll(/role="status"/g)].length, 1);
  assert.match(html, /Loading access requests/);
  assert.doesNotMatch(html, /<input\b|<button\b|No invites yet|role="tabpanel"/);
});

test('an empty refresh keeps its toolbar, empty frame and updating feedback', () => {
  const html = renderList({ refreshing: true });
  assert.match(html, /<input\b/);
  assert.match(html, /No invites yet/);
  assert.match(html, /Updating requests/);
  assert.match(html, /role="tabpanel"/);
  assert.doesNotMatch(html, /Loading access requests/);
});

test('a populated refresh keeps its records visible', () => {
  const html = renderList({ rows: [{ id: 42, email: 'staff@example.test' }], refreshing: true });
  assert.match(html, /staff@example.test/);
  assert.match(html, /Updating requests/);
  assert.doesNotMatch(html, /No invites yet|Loading access requests/);
});

test('first pending and failed requests remain distinct from a successful empty list', () => {
  assert.equal(INITIAL_ACCESS_ROWS.loading, true);
  const offline = Object.assign(new Error('Offline'), { code: 'OFFLINE' });
  const failed = accessRowsReducer(INITIAL_ACCESS_ROWS, { type: 'failure', error: offline });
  assert.equal(failed.loading, false);
  assert.equal(failed.error, offline);
  assert.equal(failed.hasLoaded, false);
  assert.equal(accessRowsReducer(failed, { type: 'start' }).loading, true);
  const empty = accessRowsReducer(INITIAL_ACCESS_ROWS, { type: 'success', rows: [] });
  assert.equal(empty.hasLoaded, true);
  assert.equal(empty.loading, false);
  assert.equal(empty.error, null);
});

for (const rows of [[], [{ id: 42, email: 'staff@example.test' }]]) {
  test(`refresh retains the successful ${rows.length ? 'populated' : 'empty'} frame, including on failure`, () => {
    const ready = accessRowsReducer(INITIAL_ACCESS_ROWS, { type: 'success', rows });
    const refreshing = accessRowsReducer(ready, { type: 'start' });
    assert.equal(refreshing.loading, false);
    assert.equal(refreshing.refreshing, true);
    assert.equal(refreshing.rows, rows);
    const offline = Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const failed = accessRowsReducer(refreshing, { type: 'failure', error: offline });
    assert.equal(failed.rows, rows);
    assert.equal(failed.hasLoaded, true);
    assert.equal(failed.loading, false);
    assert.equal(failed.refreshing, false);
    assert.equal(failed.error, offline);
  });
}

test('a successful refresh replaces the prior rows and clears updating state', () => {
  const ready = accessRowsReducer(INITIAL_ACCESS_ROWS, { type: 'success', rows: [{ id: 1 }] });
  const nextRows = [{ id: 2 }];
  const next = accessRowsReducer(accessRowsReducer(ready, { type: 'start' }), { type: 'success', rows: nextRows });
  assert.equal(next.rows, nextRows);
  assert.equal(next.refreshing, false);
  assert.equal(next.error, null);
});

test('expired or forbidden access removes retained account rows', () => {
  for (const status of [401, 403]) {
    const ready = accessRowsReducer(INITIAL_ACCESS_ROWS, { type: 'success', rows: [{ id: 1, email: 'private@example.test' }] });
    const deniedError = Object.assign(new Error('Access denied'), { status });
    const denied = accessRowsReducer(ready, { type: 'failure', status, error: deniedError });
    assert.deepEqual(denied.rows, []);
    assert.equal(denied.hasLoaded, false);
    assert.equal(denied.error, deniedError);
  }
});
