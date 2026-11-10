import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Window } from "happy-dom";
import { createElement, act } from "react";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const dom = new Window({ url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "CustomEvent", "Node"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider, onlineManager } = await import("@tanstack/react-query");
const cacheDir = mkdtempSync(join(tmpdir(), "akay-tb-monitoring-dom-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: SharedTbCaseView } = await server.ssrLoadModule("/src/components/features/health-records/SharedTbCaseView.jsx");
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  await server.close();
  await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

const card = { id: 7, case_number: "PRIVATE-SHARED-CARD", reporting_year: 2026, card_data: {}, diagnosis_snapshot: {} };
const monitoring = { can_write: true, start_date: "2026-11-01", today: "2026-11-10", endorsement: { id: 3, version: 2 },
  entries: { data: [{ id: 12, observed_on: "2026-11-09", dose_status: "taken", notes: "PRIVATE-LOG-NOTE", version: 1, can_correct: true }], current_page: 1, last_page: 1 } };
const json = (data, status = 200) => new Response(JSON.stringify({ data, ...(status >= 400 ? { message: "Access revoked" } : {}) }), { status, headers: { "Content-Type": "application/json" } });
async function settle(predicate) {
  for (let index = 0; index < 100; index++) {
    await act(async () => { await new Promise(resolveTick => setTimeout(resolveTick, 10)); });
    if (predicate()) return;
  }
  assert.fail("Expected UI state did not arrive");
}
async function mount(fetcher) {
  globalThis.fetch = (url, options) => new URL(url, "http://localhost").pathname.endsWith("/follow-up")
    ? Promise.resolve(json({ case: { ...card, status: "active" }, case_version: 1, labs: [], events: [], can_record_labs: false, can_close: false, can_reopen: false })) : fetcher(url, options);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnWindowFocus: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(SharedTbCaseView, { caseId: 7 }))));
  await settle(() => container.querySelector('form[aria-label="Record DOTS observation"]'));
  return { container, client, async close() { await act(async () => root.unmount()); client.clear(); container.remove(); } };
}
const button = (container, text) => [...container.querySelectorAll("button")].find(node => node.textContent === text);
function visibleText(container) {
  const copy = container.cloneNode(true);
  for (const node of copy.querySelectorAll("[hidden]")) node.remove();
  return copy.textContent;
}

test("an uncertain save retains its draft and original UUID through reconnect and monitoring rechecks", async () => {
  const writes = [];
  let caseReads = 0;
  let releaseCase;
  let releaseMonitoring;
  let holdMonitoring = false;
  const app = await mount(async (url, options = {}) => {
    const path = new URL(url, "http://localhost").pathname;
    if (options.method === "POST") {
      writes.push({ key: new Headers(options.headers).get("Idempotency-Key"), payload: JSON.parse(options.body) });
      if (writes.length === 1) throw new TypeError("Lost response");
      return json({ id: 13, version: 1 });
    }
    if (path.endsWith("/monitoring")) {
      if (holdMonitoring) { await new Promise(resolveRead => { releaseMonitoring = resolveRead; }); holdMonitoring = false; }
      return json(monitoring);
    }
    if (path.endsWith("/tb-cases/7")) {
      if (++caseReads === 2) await new Promise(resolveRead => { releaseCase = resolveRead; });
      return json(card);
    }
    throw new Error(`Unexpected test request: ${path}`);
  });
  try {
    const form = app.container.querySelector('form[aria-label="Record DOTS observation"]');
    await act(async () => {
      const select = form.querySelector("select"); select.value = "taken"; select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const notes = form.querySelector("textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(notes, "Retain this draft");
      notes.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(() => app.container.textContent.includes("save could not be confirmed"));
    assert.equal(writes[0].payload.notes, "Retain this draft");
    await act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
    await settle(() => releaseCase);
    await act(async () => releaseCase());
    await settle(() => app.container.querySelector('form[aria-label="Record DOTS observation"]'));
    assert.equal(app.container.querySelector('form[aria-label="Record DOTS observation"] textarea').value, "Retain this draft");
    holdMonitoring = true;
    let refresh;
    await act(async () => { refresh = app.client.refetchQueries({ queryKey: ["tb-monitoring", "7"] }); });
    await settle(() => releaseMonitoring);
    await act(async () => { releaseMonitoring(); await refresh; });
    await settle(() => app.container.querySelector('form[aria-label="Record DOTS observation"]'));
    assert.equal(app.container.querySelector('form[aria-label="Record DOTS observation"] textarea').value, "Retain this draft");
    await act(async () => app.container.querySelector('form[aria-label="Record DOTS observation"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(() => writes.length === 2);
    assert.equal(writes[1].key, writes[0].key);
    assert.deepEqual(writes[1].payload, writes[0].payload);
  } finally { releaseCase?.(); releaseMonitoring?.(); await app.close(); }
});

for (const discovery of ["History", "Save observation"]) {
  test(`revocation discovered through ${discovery} hides both cached clinical and monitoring data`, async () => {
    let revoked = false;
    let caseReads = 0;
    const app = await mount(async (url, options = {}) => {
      const path = new URL(url, "http://localhost").pathname;
      if (path.endsWith("/tb-cases/7")) { caseReads++; return revoked ? json(null, 404) : json(card); }
      if (revoked || options.method === "POST") return json(null, 404);
      if (path.endsWith("/monitoring")) return json(monitoring);
      throw new Error(`Unexpected test request: ${path}`);
    });
    try {
      revoked = true;
      await act(async () => {
        if (discovery === "History") button(app.container, "History").click();
        else {
          const form = app.container.querySelector('form[aria-label="Record DOTS observation"]');
          const select = form.querySelector("select"); select.value = "taken"; select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      if (discovery !== "History") await act(async () => app.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      await settle(() => app.container.textContent.includes(discovery === "History" ? "Unable to load observation history" : "monitoring is unavailable") || app.container.textContent.includes("Form 4B is unavailable"));
      await settle(() => caseReads > 1);
      assert.doesNotMatch(visibleText(app.container), /PRIVATE-SHARED-CARD|PRIVATE-LOG-NOTE|Save observation|Correct entry/);
    } finally { await app.close(); }
  });
}

test("a denied shared-card PDF hides the entire cached case during offline revalidation", async () => {
  let denied = false; let restored = false;
  const app = await mount(async url => {
    const path = new URL(url, "http://localhost").pathname;
    if (path.endsWith("/pdf")) { denied = true; onlineManager.setOnline(false); return json(null, 404); }
    if (denied && !restored) return json(null, 404);
    return path.endsWith("/monitoring") ? json(monitoring) : json(card);
  });
  try {
    await act(async () => button(app.container, "Download Form 4B").click());
    await settle(() => app.client.getQueryState(["tb-case", "7"])?.fetchStatus === "paused");
    assert.doesNotMatch(visibleText(app.container), /PRIVATE-SHARED-CARD|PRIVATE-LOG-NOTE|Save observation/);
    restored = true; await act(async () => onlineManager.setOnline(true));
    await settle(() => app.container.textContent.includes("PRIVATE-SHARED-CARD"));
  } finally { restored = true; await act(async () => onlineManager.setOnline(true)); await app.close(); }
});
