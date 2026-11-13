import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-laboratory-ui-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Unexpected test cache path");
  rmSync(cacheDir, { recursive: true, force: true });
});
const components = await server.ssrLoadModule("/src/components/features/health-records/LaboratoryEvidence.jsx");
const { default: Prenatal, } = await server.ssrLoadModule("/src/components/features/health-records/PrenatalAssessmentForm.jsx");
const { default: TbForm, EMPTY_TB_DATA } = await server.ssrLoadModule("/src/components/features/health-records/TbTreatmentCardForm.jsx");
const { EMPTY_MATERNAL_DATA } = await server.ssrLoadModule("/src/utils/prenatalForm.js");

function render(Component, props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Component, props)));
  client.clear(); return html;
}
const entry = { id: "550e8400-e29b-41d4-a716-446655440000", testName: "Any diagnostic test", collectionDate: "", examinationDate: "", resultStatus: "Result Available", result: "Preserved laboratory result" };

test("universal editor renders accessible test fields and validation without attachment controls", () => {
  const html = render(components.LaboratoryTestsEditor, { tests: [entry], onChange() {}, errors: { "laboratoryTests.0.result": "Enter a result" } });
  for (const text of ["Test Name", "Collection Date", "Examination Date", "Result Status", "Laboratory Result", "Requested", "Awaiting Result", "Result Available", "Enter a result", "Add Test", "Remove Test"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Upload File"));
  assert.ok(!html.includes("Take Photo"));
  assert.ok(!html.includes('capture="environment"'));
  assert.ok(!html.includes("getUserMedia"));
  assert.ok(!html.includes("Supporting Attachments"));
});

test("BHC evidence is read-only and shows only the supplied shared version", () => {
  const html = render(components.LaboratoryEvidenceList, { entries: [{ ...entry, handoffId: 4, sharedAt: "2026-11-01T00:00:00Z" }] });
  assert.ok(html.includes("Preserved laboratory result"));
  assert.ok(html.includes("Later addenda require a sharing update"));
  assert.ok(!html.includes("<input")); assert.ok(!html.includes("<textarea")); assert.ok(!html.includes("Upload File"));
});

test("RHU maternal references universal evidence and retains prior prenatal laboratory history", () => {
  const props = { maternalData: EMPTY_MATERNAL_DATA, laboratoryContext: "rhu", laboratoryTests: [entry],
    prenatalHistory: { labs: [{ recordId: 1, key: "cbc", label: "CBC", result: "Historical prenatal result" }], immunizations: [], ultrasounds: [], risks: [] } };
  const html = render(Prenatal, props);
  assert.ok(html.includes("Historical prenatal result")); assert.ok(html.includes("Preserved laboratory result"));
  assert.ok(!html.includes("Add Lab Result")); assert.ok(html.includes("Ultrasound"));
  const bhc = render(Prenatal, { maternalData: EMPTY_MATERNAL_DATA });
  assert.ok(!bhc.includes("Add Lab Result"));
  assert.ok(!bhc.includes("Laboratory Results"));
  assert.ok(bhc.includes("Ultrasound"));
});

test("RHU TB references universal and historical labs; BHC DOTS excludes registration controls", () => {
  const value = { ...EMPTY_TB_DATA, laboratory: { ...EMPTY_TB_DATA.laboratory, xpert: { result: "Legacy TB result" } } };
  const rhu = render(TbForm, { value, mode: "encode", laboratoryContext: "rhu", laboratoryTests: [entry] });
  assert.ok(rhu.includes("Legacy TB result")); assert.ok(rhu.includes("Preserved laboratory result"));
  assert.ok(!rhu.includes("Other Test"));
  const bhc = render(TbForm, { value, mode: "dots" });
  assert.ok(!bhc.includes("TB Case Number")); assert.ok(!bhc.includes("Other Test"));
  assert.ok(bhc.includes("Treatment") || bhc.includes("Dose"));
});
