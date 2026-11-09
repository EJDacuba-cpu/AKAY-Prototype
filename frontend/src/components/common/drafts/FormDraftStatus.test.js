import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = join(tmpdir(), `akay-vite-ssr-draft-status-${process.pid}`);
const server = await createServer({
  configFile: false,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: Status } = await server.ssrLoadModule("/src/components/common/drafts/FormDraftStatus.jsx");
const render = (props = {}) => renderToStaticMarkup(createElement(Status, props));

test("status labels distinguish pending, saved, device, offline and unavailable outcomes", () => {
  assert.equal(render({ status: "idle" }), "");
  for (const [status, label] of [
    ["checking", "Checking for unfinished work…"],
    ["pending", "Unsaved changes"],
    ["saving", "Saving draft…"],
    ["saved", "Draft saved"],
    ["device-only", "Saved on this device"],
    ["offline", "Connection lost"],
    ["unavailable", "Unable to save"],
    ["error", "Unable to save"],
    ["conflict", "Draft needs review"],
    ["unknown", "Unable to save"],
  ]) {
    const html = render({ status });
    assert.ok(html.includes(label), status);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  }
});

test("a newer device checkpoint does not claim current input is server saved", () => {
  const html = render({ status: "saved", lastSavedAt: "2026-11-07T04:00:00Z", deviceSavedAt: "2026-11-07T04:01:00Z" });
  assert.match(html, /Saved on this device/);
  assert.doesNotMatch(html, /Draft saved/);
  assert.match(html, /Server saved/);
  assert.match(html, /Device saved/);
  assert.match(html, /dateTime="2026-11-07T04:00:00Z"/);
  assert.match(html, /dateTime="2026-11-07T04:01:00Z"/);
  const liveRegion = html.match(/<span role="status"[^>]*>(.*?)<\/span>/s)[1];
  assert.doesNotMatch(liveRegion, /<time/);
});

test("server acknowledgement at the same or newer time removes device-only wording", () => {
  for (const deviceSavedAt of ["2026-11-07T03:59:00Z", "2026-11-07T04:00:00Z"]) {
    const html = render({ status: "saved", lastSavedAt: "2026-11-07T04:00:00Z", deviceSavedAt });
    assert.match(html, /Draft saved/);
    assert.doesNotMatch(html, /Saved on this device|Device saved/);
  }
});

test("offline feedback preserves separately labeled device and server checkpoints", () => {
  const html = render({ status: "offline", lastSavedAt: "2026-11-07T04:00:00Z", deviceSavedAt: "2026-11-07T04:01:00Z", onRetry: () => {} });
  assert.match(html, /Connection lost/);
  assert.match(html, /Saved on this device/);
  assert.match(html, /Server saved/);
  assert.match(html, />Retry<\/button>/);
  assert.doesNotMatch(html, /will sync|automatically sync|all changes are safe/i);
});

test("errors stay inline and retry appears only when a real retry handler exists", () => {
  const props = { status: "error", error: "<Failed> to save draft", className: "mt-2" };
  const html = render({ ...props, onRetry: () => {} });
  assert.match(html, /role="alert"[^>]*>&lt;Failed&gt; to save draft/);
  assert.match(html, />Retry<\/button>/);
  assert.match(html, /mt-2/);
  assert.doesNotMatch(render(props), /<button/);
  assert.doesNotMatch(render({ status: "saving", onRetry: () => {} }), /<button/);
});

test("invalid metadata never emits a broken time or fabricated save timestamp", () => {
  const html = render({ status: "unavailable", lastSavedAt: "bad-date", deviceSavedAt: "also-bad" });
  assert.match(html, /Unable to save/);
  assert.doesNotMatch(html, /Invalid Date|<time|Server saved|Device saved/);
});

test("pending edits never display as saved and saving shows a spinner cue", () => {
  const pending = render({ status: "pending", lastSavedAt: "2026-11-07T04:00:00Z" });
  assert.match(pending, /Unsaved changes/);
  assert.doesNotMatch(pending, /Draft saved|Server saved/);
  assert.match(render({ status: "saving" }), /animate-spin|Saving draft/);
  assert.match(render({ status: "saved", lastSavedAt: "2026-11-07T04:00:00Z" }), /Draft saved/);
});
