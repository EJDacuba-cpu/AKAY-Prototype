import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

let permissions = ["clinical.history"];
globalThis.__rhuSlipTestUser = () => ({ permissions });
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-rhu-referral-slip-tests", plugins: [{ name: "slip-test-boundaries", enforce: "pre", load(id) {
  const path = id.replaceAll("\\", "/");
  if (path.endsWith("/components/layout/DashboardLayout.jsx")) return "export default function DashboardLayout({ children }) { return children; }";
  if (path.endsWith("/utils/auth.js")) return "export function getCurrentUser() { return globalThis.__rhuSlipTestUser(); }";
} }, react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => { await server.close(); delete globalThis.__rhuSlipTestUser; });
const { default: Page } = await server.ssrLoadModule("/src/pages/rhu/RhuReferralSlip.jsx");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");
const { default: useSlip } = await server.ssrLoadModule("/src/hooks/useRhuReferralSlipData.js");
const referral = { id: 9, patientId: 7, healthRecordId: 31, referringHci: "Test BHC", chiefComplaint: "Original BHC complaint", status: "Received" };

function clientFor(overrides = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(queryKeys.patientDetails("rhu", "7"), { id: 7, firstName: "Test", lastName: "Patient" });
  client.setQueryData([...queryKeys.referrals("rhu"), "patient", "7"], [{ ...referral, ...overrides }]);
  client.setQueryData(queryKeys.referralDetails("rhu", "9"), { ...referral, ...overrides });
  client.setQueryData(queryKeys.healthRecordData("rhu", "31"), { id: 31, history_of_present_illness: "BHC history", systolic_bp: 120, diastolic_bp: 80 });
  return client;
}

function render(overrides = {}) {
  const client = clientFor(overrides);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ["/rhu/patients/7/referrals/9"] }, createElement(Routes, null, createElement(Route, { path: "/rhu/patients/:patientId/referrals/:referralId", element: createElement(Page) })))));
  client.clear();
  return html;
}

test("RHU details stacks BHC slip and pending Return Slip with profile back link", () => {
  const html = render();
  for (const text of ["Referral Details", "Original BHC complaint", "RHU Return Slip", "Pending feedback", '/rhu/patients/7?tab=referrals']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /role="tablist"|<textarea/);
});

test("completed RHU referral details render submitted feedback read-only", () => {
  const html = render({ status: "Completed", feedback: { rhu_diagnosis: "RHU findings", recommendation: "Saved recommendation" } });
  assert.match(html, /RHU findings/);
  assert.match(html, /Saved recommendation/);
  assert.doesNotMatch(html, /Pending feedback|<form/);
});

test("a mismatched referral patient never renders cached clinical content", () => {
  const html = render({ patientId: 8 });
  assert.doesNotMatch(html, /Original BHC complaint|BHC history/);
  assert.match(html, /could not be loaded for this patient/);
});

test("disabled slip queries and revoked history permission do not expose cached records", () => {
  const client = clientFor();
  let result;
  function Probe({ enabled }) { result = useSlip({ patientId: "7", referralId: "9", enabled }); return null; }
  const probe = (enabled) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe, { enabled })));
  probe(false);
  assert.equal(result.referral, null);
  assert.equal(result.record, null);
  permissions = [];
  try {
    probe(true);
    assert.equal(result.unauthorized, true);
    assert.equal(result.referral, null);
    assert.equal(result.record, null);
    assert.doesNotMatch(render(), /Original BHC complaint|BHC history/);
  } finally { permissions = ["clinical.history"]; client.clear(); }
});

test("missing linked records keep the referral readable while network failures can be retried", () => {
  for (const status of [404, 500, 403]) {
    const client = clientFor();
    const error = Object.assign(new Error("Record unavailable"), { status });
    client.getQueryCache().find({ queryKey: queryKeys.healthRecordData("rhu", "31") })
      .setState({ data: undefined, error, status: "error", fetchStatus: "idle" });
    let result;
    function Probe() { result = useSlip({ patientId: "7", referralId: "9" }); return null; }
    renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
    if (status === 404) { assert.equal(Boolean(result.loadError), false); assert.equal(result.referral.id, 9); assert.equal(result.record, null); }
    if (status === 500) assert.equal(result.loadError, error);
    if (status === 403) { assert.equal(result.unauthorized, true); assert.equal(result.referral, null); assert.equal(result.record, null); }
    client.clear();
  }
});

test("slip raw-record cache does not collide with the Health Record details wrapper", () => {
  const client = clientFor({ healthRecordId: "31" });
  const record = { id: "31", history_of_present_illness: "Source BHC history" };
  client.setQueryData(queryKeys.healthRecordDetails("rhu", "31"), { record, patient: { id: 7 }, linkedReferral: null });
  client.setQueryData(queryKeys.healthRecordData("rhu", "31"), record);
  let result;
  function Probe() { result = useSlip({ patientId: "7", referralId: "9" }); return null; }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
  assert.equal(result.record.id, "31");
  assert.equal(result.record.history_of_present_illness, "Source BHC history");
  client.clear();
});

test("source-record 404 never falls back to stale cached clinical measurements", () => {
  const client = clientFor();
  client.getQueryCache().find({ queryKey: queryKeys.healthRecordData("rhu", "31") })
    .setState({ error: Object.assign(new Error("Missing source"), { status: 404 }), status: "error", fetchStatus: "idle" });
  let result;
  function Probe() { result = useSlip({ patientId: "7", referralId: "9" }); return null; }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
  assert.equal(result.record, null);
  client.clear();
});
