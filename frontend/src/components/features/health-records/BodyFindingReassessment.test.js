import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-body-reassessment-tests", plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(() => server.close());
const { ReassessmentChoices, PreviousBodyFindings, BodyFindingRecordHistory } = await server.ssrLoadModule("/src/components/features/health-records/BodyFindingReassessment.jsx");
const { default: BodyPreviewPanel } = await server.ssrLoadModule("/src/components/features/health-records/wizard/BodyPreviewPanel.jsx");
const { getHealthRecordsByPatient, createHealthRecord, getHealthRecordById } = await server.ssrLoadModule("/src/services/healthRecordService.js");
const { summarizeBodyFindings } = await server.ssrLoadModule("/src/utils/bodyFindingsSummary.js");
const originals = { id: "1", patientId: "7", dateRecorded: "2026-10-01", bodyFindings: [
  { region: "chest", finding: "Tenderness" }, { region: "chest", finding: "Redness" },
] };
const findings = summarizeBodyFindings([originals], "ongoing").findings;
const decision = { sourceRecordId: 1, sourceFindingIndex: 0, expectedRevision: 0, status: "no_longer_present" };
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test("each previous finding starts unreviewed, including one last recorded Still Present", () => {
  const html = render(ReassessmentChoices, { findings: [{ ...findings[0], status: "still_present" }, findings[1]], decisions: [], onChange() {} });
  assert.equal((html.match(/value="not_yet_reassessed" selected=""/g) || []).length, 2);
  assert.equal((html.match(/<select/g) || []).length, 2);
  assert.match(html, /Last documented status: Still Present/);
});

test("same-area prior and new findings share one marker, even while pending No Longer Present", () => {
  const html = render(BodyPreviewPanel, { previousFindings: findings, reassessments: [decision], findings: [{ id: "new", region: "chest", finding: "New observation" }], sex: "Female", birthDate: "2000-01-01", onReassess() {}, onDialogChange() {} });
  assert.equal((html.match(/data-region="chest"/g) || []).length, 1);
  assert.match(html, /Chest, 3 findings/);
});

test("source and conflict errors are inline, stale choices can be explicitly cleared", () => {
  const html = render(PreviousBodyFindings, { findings: [], decisions: [decision], errors: { "monitoring_data.bodyFindingReassessments.0": ["Refresh previous findings."] }, onChange() {}, onRefresh() {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /Refresh previous findings\./);
  assert.match(html, /Clear reassessment choices/);
});

test("record details retain original findings and resolved history with links to each visit", () => {
  const client = new QueryClient();
  client.setQueryData(["body-finding-history", "7"], [originals, { id: "44", patientId: "7", bodyFindingReassessments: [{ ...decision, finding: { finding: "Tenderness" } }] }]);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ["/rhu/health-records/1"] }, createElement(BodyFindingRecordHistory, { record: originals }))));
  assert.match(html, /Tenderness/);
  assert.match(html, /No Longer Present/);
  assert.match(html, /href="\/rhu\/health-records\/44"/);
  client.clear();
});

test("empty history response cannot erase the currently authorized original record", () => {
  const client = new QueryClient();
  client.setQueryData(["body-finding-history", "7"], []);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(BodyFindingRecordHistory, { record: originals }))));
  assert.match(html, /Tenderness/);
  client.clear();
});

test("patient history fetches every page, preserves immutable source positions, and sends decisions with finalization", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input, "http://fixture.test");
    requests.push({ url, options });
    if (options.method === "POST") return new Response(JSON.stringify({ data: { id: 3, ...JSON.parse(options.body) } }), { status: 201 });
    if (url.pathname.endsWith("/44")) return new Response(JSON.stringify({ data: { id: 44, patient_id: 7 } }));
    const second = url.searchParams.get("page") === "2";
    return new Response(JSON.stringify({ data: { last_page: 2, data: second ? [{ id: 2, patient_id: 7, monitoring_data: { bodyFindingReassessments: [decision] } }] : [{ id: 1, patient_id: 7, body_findings: [null, { region: "chest", finding: "Tenderness" }] }] } }));
  };
  try {
    const records = await getHealthRecordsByPatient(7);
    assert.equal(records.length, 2);
    assert.equal(records[0].bodyFindings[0].sourceFindingIndex, 1);
    assert.deepEqual(records[1].bodyFindingReassessments, [decision]);
    await createHealthRecord({ patientId: 7, category: "General Consultation", bodyFindingReassessments: [decision], bodyFindings: [{ id: "new", region: "chest", finding: "New observation" }] }, "bhc", { idempotencyKey: "test-key", consultationUuid: "test-consultation", draftId: "draft", draftVersion: 2 });
    const request = requests.find((item) => item.options.method === "POST");
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.monitoring_data.bodyFindingReassessments, [decision]);
    assert.equal(body.body_findings.length, 1);
    assert.equal(body.body_findings[0].finding, "New observation");
    assert.equal(body.consultation_uuid, "test-consultation");
    const direct = await getHealthRecordById(44);
    assert.equal(direct.id, "44");
    assert.match(requests.at(-1).url.pathname, /health-records\/44$/);
  } finally { globalThis.fetch = originalFetch; }
});
