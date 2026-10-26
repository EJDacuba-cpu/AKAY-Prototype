import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { patientRecordRows } from "../../../utils/patientRecordHistory.js";

const cacheDir = join(tmpdir(), `akay-vite-ssr-record-table-${process.pid}`);
const server = await createServer({
  configFile: false, cacheDir, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: Table } = await server.ssrLoadModule("/src/components/features/records/HealthRecordsTable.jsx");
const { default: Tab } = await server.ssrLoadModule("/src/components/features/patients/profile/PatientRecordsTab.jsx");
const render = (node) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

test("desktop and mobile label both next actions and keep record navigation/classification", () => {
  const records = patientRecordRows([{ id: 10, chiefComplaint: "Saved complaint", visitType: "initial_consultation" }],
    [{ healthRecordId: 10, status: "Pending" }], [{ healthRecordId: 10, state: "pending" }]);
  const html = render(createElement(Table, { records }));
  assert.match(html, /<th[^>]*>Next Action<\/th>/);
  assert.match(html, /<dt[^>]*>Next Action<\/dt>/);
  assert.equal((html.match(/Follow-up Scheduled, RHU Referral \(Pending\)/g) || []).length, 2);
  assert.doesNotMatch(html, />Outcome<|BHC Follow-up/);
  assert.match(html, /Initial Consultation/);
  assert.match(html, /href="\/bhc\/health-records\/10"/);
});

test("matching filter uses Next Action labeling and preserves empty-table behavior", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const html = render(createElement(QueryClientProvider, { client }, createElement(Tab, { patientId: 1, records: [], referrals: [], followUps: [] })));
  client.clear();
  assert.match(html, /aria-label="Next Action"/);
  assert.match(html, /All next actions/);
  assert.match(html, /No health records yet/);
  assert.doesNotMatch(html, /All outcomes|>Outcome</);
});
