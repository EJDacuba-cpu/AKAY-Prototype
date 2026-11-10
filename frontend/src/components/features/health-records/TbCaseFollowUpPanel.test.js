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
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "CustomEvent", "Node"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider, onlineManager } = await import("@tanstack/react-query");
const cacheDir = mkdtempSync(join(tmpdir(), "akay-tb-followup-dom-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: TbCaseFollowUpPanel } = await server.ssrLoadModule("/src/components/features/health-records/TbCaseFollowUpPanel.jsx");
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch; await server.close(); await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

const baseline = { case: { id: 7, status: "active", version: 3, outcome_status: null, card_data: {} }, case_version: 3,
  start_date: "2026-01-01", today: "2026-11-10", can_record_labs: true, can_close: true, can_reopen: false, events: [],
  labs: [{ id: 9, version: 1, milestone: "month_6", test_name: "DSSM", due_on: "2026-11-08", status: "result_available", examination_on: "2026-11-09", result: "PRIVATE-LAB-RESULT", recorder_name: "RHU recorder" }] };
const json = (data, status = 200) => new Response(JSON.stringify({ data, ...(status >= 400 ? { message: "Scope denied" } : {}) }), { status, headers: { "Content-Type": "application/json" } });
async function settle(predicate) {
  for (let index = 0; index < 100; index++) { await act(async () => { await new Promise(next => setTimeout(next, 10)); }); if (predicate()) return; }
  assert.fail("Expected follow-up UI state did not arrive");
}
async function mount(fetcher) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity, refetchOnWindowFocus: false } } });
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(TbCaseFollowUpPanel, { caseId: 7 }))));
  await settle(() => container.textContent.includes("PRIVATE-LAB-RESULT"));
  return { container, client, async close() { await act(async () => root.unmount()); client.clear(); container.remove(); } };
}
const button = (container, text) => [...container.querySelectorAll("button")].find(node => node.textContent === text);
const closure = container => container.querySelector('form[aria-label="Close TB case"]');
async function input(container, name, value) {
  await act(async () => {
    const field = container.querySelector(`[name="${name}"]`);
    if (field.type === "checkbox") { if (field.checked !== value) field.click(); return; }
    if (field.tagName === "SELECT") { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); return; }
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fillClosure(container) {
  await input(container, "outcomeStatus", "cured"); await input(container, "note", "Physician reviewed the final clinical evidence");
  await input(container, "evidence_9", true); await input(container, "confirmed", true);
}
async function submitClosure(container) { await act(async () => closure(container).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

test("BHC sees follow-up results and current closure without laboratory or physician write controls", async () => {
  const app = await mount(async () => json({ ...baseline, case: { ...baseline.case, status: "closed", outcome_status: "cured", outcome_on: "2026-11-10" }, can_record_labs: false, can_close: false }));
  try { assert.match(app.container.textContent, /Cured|Month 6/); assert.equal(app.container.querySelector("form"), null); }
  finally { await app.close(); }
});

test("RHU laboratory staff record evidence without physician closure controls", async () => {
  const app = await mount(async () => json({ ...baseline, can_close: false }));
  try { assert.ok(app.container.querySelector('form[aria-label="Record RHU follow-up laboratory"]')); assert.equal(closure(app.container), null); }
  finally { await app.close(); }
});

test("RHU records an explicit follow-up request and later adds its result with a revision reason", async () => {
  let data = { ...baseline, can_close: false }; const writes = [];
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST" || options.method === "PATCH") {
      const body = JSON.parse(options.body); writes.push({ method: options.method, body });
      const lab = { ...body, id: 10, version: options.method === "POST" ? 1 : 2, recorder_name: "RHU recorder" };
      data = { ...data, labs: [...baseline.labs, lab] };
      return json({ case: baseline.case, lab });
    }
    return json(data);
  });
  try {
    await input(app.container, "milestone", "month_2"); await input(app.container, "testName", "DSSM request"); await input(app.container, "dueOn", "2027-01-01");
    await act(async () => app.container.querySelector('form[aria-label="Record RHU follow-up laboratory"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(() => writes.length === 1);
    assert.equal(writes[0].body.due_on, "2027-01-01"); assert.equal(writes[0].body.result, null);
    await settle(() => [...app.container.querySelectorAll("button")].some(node => node.textContent === "Revise lab" && node.closest("tr")?.textContent.includes("DSSM request")));
    await act(async () => [...app.container.querySelectorAll("button")].find(node => node.textContent === "Revise lab" && node.closest("tr")?.textContent.includes("DSSM request")).click());
    await input(app.container, "labStatus", "result_available"); await input(app.container, "examinationOn", "2026-11-10"); await input(app.container, "result", "Recorded sputum result"); await input(app.container, "correctionReason", "Result received from RHU lab");
    await act(async () => app.container.querySelector('form[aria-label="Revise RHU follow-up laboratory"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(() => writes.length === 2);
    assert.equal(writes[1].method, "PATCH"); assert.equal(writes[1].body.version, 1); assert.equal(writes[1].body.result, "Recorded sputum result");
  } finally { await app.close(); }
});

test("physician closure submits reviewed version and evidence and then offers reopening", async () => {
  let data = baseline; let saved;
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST") {
      saved = JSON.parse(options.body);
      data = { ...baseline, case: { ...baseline.case, status: "closed", outcome_status: "cured", outcome_on: "2026-11-10" }, case_version: 4, can_record_labs: false, can_close: false, can_reopen: true };
      return json({ case: data.case });
    }
    return json(data);
  });
  try {
    await fillClosure(app.container); await submitClosure(app.container);
    await settle(() => app.container.querySelector('form[aria-label="Reopen TB case"]'));
    assert.deepEqual(saved, { case_version: 3, outcome_status: "cured", outcome_on: "2026-11-10", note: "Physician reviewed the final clinical evidence", confirmed: true, evidence_lab_ids: [9] });
    assert.equal(closure(app.container), null);
  } finally { await app.close(); }
});

test("a changed case or lab revision requires renewed review and clears previous physician confirmation", async () => {
  let data = baseline;
  const app = await mount(async () => json(data));
  try {
    await fillClosure(app.container);
    data = { ...baseline, case_version: 4, labs: [{ ...baseline.labs[0], version: 2, result: "Updated evidence" }] };
    await act(async () => { await app.client.refetchQueries({ queryKey: ["tb-follow-up", "7"] }); });
    await settle(() => button(app.container, "Review latest case"));
    assert.equal(button(app.container, "Close case with outcome").disabled, true);
    await act(async () => button(app.container, "Review latest case").click());
    assert.equal(app.container.querySelector('[name="confirmed"]').checked, false);
    assert.equal(app.container.querySelector('[name="evidence_9"]').checked, false);
    assert.equal(app.container.querySelector('[name="note"]').value, "Physician reviewed the final clinical evidence");
  } finally { await app.close(); }
});

test("an uncertain closure retains its review and UUID through reconnect", async () => {
  const writes = []; let reads = 0; let release;
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST") {
      writes.push({ key: new Headers(options.headers).get("Idempotency-Key"), body: JSON.parse(options.body) });
      if (writes.length === 1) throw new TypeError("Lost response");
      return json({ case: baseline.case });
    }
    if (++reads === 2) await new Promise(resolveRead => { release = resolveRead; });
    return json(baseline);
  });
  try {
    await fillClosure(app.container); await submitClosure(app.container);
    await settle(() => app.container.textContent.includes("could not be confirmed"));
    await act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
    await settle(() => release); await act(async () => release()); await settle(() => closure(app.container));
    assert.equal(app.container.querySelector('[name="confirmed"]').checked, true);
    await submitClosure(app.container); await settle(() => writes.length === 2);
    assert.equal(writes[1].key, writes[0].key); assert.deepEqual(writes[1].body, writes[0].body);
  } finally { release?.(); await app.close(); }
});

test("denied clinical write hides cached evidence during an offline-paused access check", async () => {
  let denied = false; let restored = false;
  const app = await mount(async (url, options = {}) => {
    if (options.method === "POST") { denied = true; onlineManager.setOnline(false); return json(null, 403); }
    return denied && !restored ? json(null, 403) : json(baseline);
  });
  try {
    await fillClosure(app.container); await submitClosure(app.container);
    await settle(() => app.client.getQueryState(["tb-follow-up", "7"])?.fetchStatus === "paused");
    assert.doesNotMatch(app.container.textContent, /PRIVATE-LAB-RESULT/); assert.equal(app.container.querySelector("form"), null);
    restored = true; await act(async () => onlineManager.setOnline(true)); await settle(() => closure(app.container));
    assert.equal(app.container.querySelector('[name="note"]').value, "Physician reviewed the final clinical evidence");
  } finally { restored = true; await act(async () => onlineManager.setOnline(true)); await app.close(); }
});
