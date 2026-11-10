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
const cacheDir = mkdtempSync(join(tmpdir(), "akay-dr-referral-dom-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: TbDrReferralPanel } = await server.ssrLoadModule("/src/components/features/health-records/TbDrReferralPanel.jsx");
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  await server.close(); await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

const preview = { eligible: true, can_authorize: true, source_revision: "a".repeat(64), today: "2026-11-10", current: null, history: [],
  patient_snapshot: { full_name: "PRIVATE-DR-PATIENT", birthdate: "1990-01-01", sex: "Male" },
  source_snapshot: { rhu_name: "Authorizing RHU", physician_name: "Assessing physician", resistance_label: "Bacteriologically-confirmed RR-TB",
    laboratory_tests: [{ testName: "GeneXpert", resultStatus: "Result Available", result: "Pinned evidence" }] } };
const referral = { id: 5, reference: "DRR-2026-000005", status: "issued", status_label: "Issued by RHU", version: 1,
  destination_name: "External PMDT facility", reason: "Clinical referral", authorized_name: "Physician", authorized_at: "2026-11-10T04:00:00Z",
  patient_snapshot: preview.patient_snapshot, source_snapshot: preview.source_snapshot, can_update: true, earliest_event_on: "2026-11-10", today: "2026-11-10",
  allowed_statuses: [{ value: "sent", label: "Dispatch recorded by RHU" }, { value: "cancelled", label: "Cancelled" }],
  events: [{ id: 1, version: 1, status: "issued", note: "Clinical referral", event_on: "2026-11-10", recorder_name: "Physician" }] };
const json = (data, status = 200) => new Response(JSON.stringify({ data, ...(status >= 400 ? { message: "Access denied" } : {}) }), { status, headers: { "Content-Type": "application/json" } });
async function settle(predicate) {
  for (let index = 0; index < 100; index++) { await act(async () => { await new Promise(next => setTimeout(next, 10)); }); if (predicate()) return; }
  assert.fail("Expected referral UI state did not arrive");
}
async function mount(fetcher, ready = node => node.querySelector('form[aria-label="Authorize outbound DR-TB referral"]')) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnWindowFocus: false } } });
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(TbDrReferralPanel, { recordId: 7 }))));
  await settle(() => ready(container));
  return { container, client, async close() { await act(async () => root.unmount()); client.clear(); container.remove(); } };
}
const button = (container, text) => [...container.querySelectorAll("button")].find(node => node.textContent === text);
async function input(container, name, value) {
  await act(async () => {
    const field = container.querySelector(`[name="${name}"]`);
    if (field.type === "checkbox") { if (field.checked !== value) field.click(); return; }
    if (field.tagName === "SELECT") { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); return; }
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fillIssue(container) {
  await input(container, "destinationName", "Chosen PMDT facility");
  await input(container, "reason", "Specialized DR evaluation");
  await input(container, "confirmed", true);
}
async function submit(container) { await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

test("RHU readers see the frozen outbound referral and slip without authorization or status controls", async () => {
  const readOnly = { ...referral, can_update: false };
  const app = await mount(async () => json({ ...preview, eligible: false, can_authorize: false, current: readOnly, history: [readOnly] }), node => node.textContent.includes("DRR-2026-000005"));
  try {
    assert.match(app.container.textContent, /PRIVATE-DR-PATIENT|External PMDT facility|Pinned evidence/);
    assert.equal(app.container.querySelector("form"), null);
    assert.ok(button(app.container, "Download referral slip"));
  } finally { await app.close(); }
});

test("uncertain authorization retains its destination, confirmation and UUID through reconnect", async () => {
  const writes = []; let reads = 0; let release; let current = null;
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST") {
      writes.push({ key: new Headers(options.headers).get("Idempotency-Key"), body: JSON.parse(options.body) });
      if (writes.length === 1) throw new TypeError("Lost response");
      current = referral; return json(referral);
    }
    if (++reads === 2) await new Promise(resolveRead => { release = resolveRead; });
    return json({ ...preview, current, eligible: !current, history: current ? [current] : [] });
  });
  try {
    await fillIssue(app.container); await submit(app.container);
    await settle(() => app.container.textContent.includes("could not be confirmed"));
    await act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
    await settle(() => release); await act(async () => release());
    await settle(() => app.container.querySelector("form"));
    assert.equal(app.container.querySelector('[name="destinationName"]').value, "Chosen PMDT facility");
    assert.equal(app.container.querySelector('[name="confirmed"]').checked, true);
    await submit(app.container); await settle(() => writes.length === 2);
    assert.equal(writes[1].key, writes[0].key); assert.deepEqual(writes[1].body, writes[0].body);
  } finally { release?.(); await app.close(); }
});

test("changed source evidence requires explicit review and fresh confirmation before authorization", async () => {
  let revision = preview.source_revision;
  const app = await mount(async () => json({ ...preview, source_revision: revision }));
  try {
    await fillIssue(app.container);
    revision = "b".repeat(64);
    await act(async () => { await app.client.refetchQueries({ queryKey: ["tb-dr-referral", "7"] }); });
    await settle(() => button(app.container, "Review latest source"));
    assert.equal(button(app.container, "Authorize outbound referral").disabled, true);
    await act(async () => button(app.container, "Review latest source").click());
    assert.equal(app.container.querySelector('[name="confirmed"]').checked, false);
    assert.equal(app.container.querySelector('[name="destinationName"]').value, "Chosen PMDT facility");
  } finally { await app.close(); }
});

test("physician records reported dispatch with the displayed version and retains event history", async () => {
  let current = referral; let saved;
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST") {
      saved = JSON.parse(options.body);
      current = { ...referral, status: "sent", status_label: "Dispatch recorded by RHU", version: 2, allowed_statuses: [{ value: "attendance_reported", label: "Attendance reported to RHU" }],
        events: [...referral.events, { id: 2, version: 2, status: "sent", note: saved.note, event_on: saved.event_on, recorder_name: "Physician" }] };
      return json(current);
    }
    return json({ ...preview, eligible: false, current, history: [current] });
  }, node => node.querySelector('form[aria-label="Record DR-TB referral disposition"]'));
  try {
    await input(app.container, "status", "sent"); await input(app.container, "note", "Slip delivered to patient; contact noted by RHU");
    await submit(app.container); await settle(() => app.container.textContent.includes("Slip delivered to patient; contact noted by RHU"));
    assert.deepEqual(saved, { version: 1, status: "sent", event_on: "2026-11-10", note: "Slip delivered to patient; contact noted by RHU" });
    assert.match(app.container.textContent, /Clinical referral/);
  } finally { await app.close(); }
});

test("a denied slip request rechecks access and hides the cached referral", async () => {
  let denied = false;
  const app = await mount(async url => {
    if (new URL(url, "http://localhost").pathname.endsWith("/pdf")) { denied = true; return json(null, 404); }
    return denied ? json(null, 403) : json({ ...preview, eligible: false, current: referral, history: [referral] });
  }, node => node.textContent.includes("DRR-2026-000005"));
  try {
    await act(async () => button(app.container, "Download referral slip").click());
    await settle(() => app.container.textContent.includes("Unable to load outbound DR-TB referral"));
    assert.doesNotMatch(app.container.textContent, /PRIVATE-DR-PATIENT|External PMDT facility/);
    assert.equal(app.container.querySelector("form"), null);
  } finally { await app.close(); }
});

test("confirmed denial hides cached data while revalidation is paused offline and recovers only after a successful check", async () => {
  let denied = false; let restored = false;
  const app = await mount(async url => {
    if (new URL(url, "http://localhost").pathname.endsWith("/pdf")) {
      denied = true; onlineManager.setOnline(false); return json(null, 404);
    }
    return denied && !restored ? json(null, 403) : json({ ...preview, eligible: false, current: referral, history: [referral] });
  }, node => node.textContent.includes("DRR-2026-000005"));
  try {
    await input(app.container, "note", "Keep this unsubmitted report");
    await act(async () => button(app.container, "Download referral slip").click());
    await settle(() => app.client.getQueryState(["tb-dr-referral", "7"])?.fetchStatus === "paused");
    assert.doesNotMatch(app.container.textContent, /PRIVATE-DR-PATIENT|External PMDT facility|Pinned evidence/);
    assert.equal(app.container.querySelector("form"), null);
    assert.equal(button(app.container, "Refresh referral").disabled, false);
    restored = true;
    await act(async () => onlineManager.setOnline(true));
    await settle(() => app.container.querySelector("form"));
    assert.match(app.container.textContent, /PRIVATE-DR-PATIENT/);
    assert.equal(app.container.querySelector('[name="note"]').value, "Keep this unsubmitted report");
  } finally {
    restored = true; await act(async () => onlineManager.setOnline(true)); await app.close();
  }
});
