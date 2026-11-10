import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-tb-endorsement-ssr-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: SharedTbCaseView, SharedTbCaseDocument } = await server.ssrLoadModule("/src/components/features/health-records/SharedTbCaseView.jsx");
const { TbEndorsementReview } = await server.ssrLoadModule("/src/components/features/health-records/TbEndorsementReview.jsx");
const { default: TbCaseEndorsementPanel } = await server.ssrLoadModule("/src/components/features/health-records/TbCaseEndorsementPanel.jsx");
const { default: TbMonitoringPanel, TbMonitoringForm } = await server.ssrLoadModule("/src/components/features/health-records/TbMonitoringPanel.jsx");

const makeClient = (staleTime = 0) => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime } } });
function render(Component, props = {}, client = makeClient()) {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(Component, props))));
  client.clear();
  return html;
}

test("shared BHC clinical card renders disabled fields and no registration or dose-entry action", () => {
  const html = render(SharedTbCaseDocument, { tbCase: { id: 7, case_number: "TB-2026-0007", reporting_year: 2026,
    card_data: { classification: { drugResistance: "drug_susceptible" }, regimen: { description: "Physician prescription", weightKg: 55 } }, diagnosis_snapshot: {} } });
  assert.match(html, /TB-2026-0007/);
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /Physician prescription/);
  assert.doesNotMatch(html, /Authorize and register|Add regimen row|type="submit"/);
  assert.doesNotMatch(html, /Administration of Drugs — Dose Calendar/);
});

test("a denied recheck hides cached clinical card contents", () => {
  const client = makeClient();
  client.setQueryData(["tb-case", "7"], { id: 7, case_number: "PRIVATE-CACHED-CARD", card_data: {} });
  client.getQueryCache().find({ queryKey: ["tb-case", "7"] }).setState({ status: "error", error: Object.assign(new Error("Revoked"), { status: 404 }), fetchStatus: "idle" });
  const html = render(SharedTbCaseView, { caseId: 7 }, client);
  assert.doesNotMatch(html, /PRIVATE-CACHED-CARD/);
  assert.match(html, /Retry/);
});

test("RHU-only endorsement shows identity linking before any case-reading or acceptance controls", () => {
  const html = render(TbEndorsementReview, { endorsement: { id: 1, status: "linkage_needed", source_patient: { first_name: "Source", last_name: "Patient", birthdate: "1990-01-01", sex: "Male" }, can_link: true, can_read_case: false, can_accept: false }, onAction() {} });
  assert.match(html, /Source Patient/);
  assert.match(html, /Search BHC registrations/);
  assert.doesNotMatch(html, /Accept for DOTS|Download Form 4B/);
});

test("acceptance confirmation stays disabled until the shared clinical card loads", () => {
  const html = render(TbEndorsementReview, { endorsement: { id: 1, case_id: 7, status: "pending_review", source_patient: {}, can_accept: true, can_read_case: true }, onAction() {} });
  assert.match(html, /Checking Form 4B access/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled=""/);
});

test("the receiving patient link uses the local registration instead of the RHU source ID", () => {
  const html = render(TbEndorsementReview, { endorsement: { id: 1, status: "accepted", source_patient: { id: 100, full_name: "Source Patient" }, linked_patient: { id: 23, full_name: "Local Patient" }, can_link: false, can_accept: false, can_read_case: false }, onAction() {} });
  assert.match(html, /\/bhc\/patients\/23\?tab=programs/);
  assert.doesNotMatch(html, /\/bhc\/patients\/100/);
  assert.doesNotMatch(html, /Accept for DOTS/);
});

test("RHU read-only users see endorsement status without issuing or revoking controls", () => {
  const client = makeClient();
  client.setQueryData(["tb-case-endorsements", "7"], { case_version: 2, can_endorse: false, can_revoke: false, candidates: [], history: [], current: { id: 3, receiving_bhc: { name: "Assigned BHC" }, status: "accepted" } });
  const html = render(TbCaseEndorsementPanel, { caseId: 7 }, client);
  assert.match(html, /Assigned BHC/);
  assert.doesNotMatch(html, /Endorse to BHC|Revoke endorsement/);
});

const monitoringData = (canWrite = false) => ({ can_write: canWrite, start_date: "2026-11-01", today: "2026-11-10", endorsement: { id: 3, version: 2 },
  entries: { data: [{ id: 12, observed_on: "2026-11-09", dose_status: "taken", weight_kg: "55.25", version: 1, recorder_name: "BHC Recorder", facility_name: "Treatment BHC", can_correct: canWrite }], current_page: 1, last_page: 1 } });

test("RHU monitoring view shows attributed observations without write controls", () => {
  const client = makeClient(Infinity);
  client.setQueryData(["tb-monitoring", "7", 1], monitoringData());
  const html = render(TbMonitoringPanel, { caseId: 7 }, client);
  assert.match(html, /55.25/);
  assert.match(html, /BHC Recorder/);
  assert.match(html, /Treatment BHC/);
  assert.doesNotMatch(html, /Save observation|Correct entry/);
});

test("accepted BHC monitoring offers direct observations without diagnosis or prescription inputs", () => {
  const client = makeClient(Infinity);
  client.setQueryData(["tb-monitoring", "7", 1], monitoringData(true));
  const html = render(TbMonitoringPanel, { caseId: 7 }, client);
  assert.match(html, /Save observation/);
  assert.match(html, /Correct entry/);
  assert.doesNotMatch(html, /Drug Resistance|Prescribed Regimen/);
  assert.match(html, /min="2026-11-01"/);
  assert.match(html, /max="2026-11-10"/);
});

test("monitoring failure hides cached observations and write controls", () => {
  const client = makeClient();
  client.setQueryData(["tb-monitoring", "7", 1], { ...monitoringData(true), entries: { data: [{ notes: "PRIVATE-OLD-NOTE" }] } });
  client.getQueryCache().find({ queryKey: ["tb-monitoring", "7", 1] }).setState({ status: "error", error: new Error("Revoked"), fetchStatus: "idle" });
  const html = render(TbMonitoringPanel, { caseId: 7 }, client);
  assert.doesNotMatch(html, /PRIVATE-OLD-NOTE|Save observation/);
  assert.match(html, /Retry/);
});

test("correction form keeps its observation date fixed and requires a reason", () => {
  const html = render(TbMonitoringForm, { context: monitoringData(true), entry: { id: 12, observed_on: "2026-11-09", version: 2, dose_status: "missed" }, onSave() {}, onCancel() {} });
  assert.match(html, /2026-11-09/);
  assert.match(html, /Correction reason/);
  assert.match(html, /Void this observation/);
  assert.doesNotMatch(html, /type="date"/);
});
