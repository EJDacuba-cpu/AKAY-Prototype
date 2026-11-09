import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const cacheDir = join(tmpdir(), `akay-account-form-loading-${process.pid}`);
const server = await createServer({
  configFile: false, cacheDir, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { AccountFormLoadState } = await server.ssrLoadModule('/src/pages/admin/AddUser.jsx');

test('pending account data replaces the complete form with one loading announcement', () => {
  const html = renderToStaticMarkup(createElement(AccountFormLoadState));
  assert.match(html, /Loading account/);
  assert.equal([...html.matchAll(/role="status"/g)].length, 1);
  assert.doesNotMatch(html, /<input\b|<button\b/);
});

test('failed account load replaces the skeleton with a recoverable error', () => {
  const html = renderToStaticMarkup(createElement(AccountFormLoadState, { error: new Error('Offline'), onRetry() {} }));
  assert.doesNotMatch(html, /Loading account|skeleton-block/);
  assert.match(html, /<button\b[^>]*>.*?Retry<\/button>/s);
});
