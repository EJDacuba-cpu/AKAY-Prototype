import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = join(tmpdir(), `tb-visit-snapshot-${process.pid}`);
mkdirSync(cacheDir, { recursive: true });
const server = await createServer({
  configFile: false,
  root: "/workspace/frontend",
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

const { default: TbVisitSnapshot } = await server.ssrLoadModule(
  "/src/components/features/health-records/TbVisitSnapshot.jsx",
);
const { default: BhcHealthRecordWorkspace } = await server.ssrLoadModule(
  "/src/components/features/health-records/BhcHealthRecordWorkspace.jsx",
);
const { default: TbDoseCalendar, recomputeCalendar, createEmptyMonth } =
  await server.ssrLoadModule("/src/components/features/health-records/TbDoseCalendar.jsx");

test("TbVisitSnapshot shows recorded case facts without form controls", () => {
  const html = renderToStaticMarkup(
    createElement(TbVisitSnapshot, {
      record: {
        tb_data: {
          diagnosis: { tbCaseNumber: "TB-TABS-001", attendingPhysician: "Dr. Reyes" },
          classification: { registrationGroup: "new", anatomicalSite: "pulmonary" },
          phases: { intensiveStart: "2026-11-01" },
        },
      },
    }),
  );
  assert.match(html, /TB-TABS-001/);
  assert.match(html, /New/);
  assert.match(html, /Pulmonary/);
  assert.match(html, /Intensive Phase/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /Administration of Drugs/);
  assert.doesNotMatch(html, /Serious adverse/);
});

test("Health Record Details workspace uses TbVisitSnapshot instead of Form 4B", () => {
  const html = renderToStaticMarkup(
    createElement(BhcHealthRecordWorkspace, {
      record: {
        id: 13,
        category: "General Consultation",
        monitoring_data: { selectedPrograms: ["TB"] },
        tb_data: {
          diagnosis: { tbCaseNumber: "TB-TABS-001" },
          classification: { registrationGroup: "new", anatomicalSite: "pulmonary" },
        },
        dispensedMedicines: [
          { medicineName: "RHZE", quantity: 28, unit: "tablet" },
        ],
      },
      patient: { sex: "Male", age: 36 },
      title: "TB record",
      recordId: "13",
      patientName: "Tabs Rico TabsDemo",
      serviceType: "General Consultation",
      displayDate: "November 18, 2026",
      practitioner: "RHU Staff",
      laboratoryEntries: [],
    }),
  );
  assert.match(html, /TB DOTS \/ TB monitoring/);
  assert.match(html, /TB-TABS-001/);
  assert.match(html, /Treatment &amp; dispensed medicines|Treatment & dispensed medicines/);
  assert.match(html, /RHZE/);
  assert.doesNotMatch(html, /Administration of Drugs/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /Mark each supervised dose/);
});

test("TbDoseCalendar readOnly mode renders view marks without inputs", () => {
  const month = createEmptyMonth(0);
  month.label = "NOV-26";
  month.days[0] = "X";
  month.days[1] = "ABC";
  month.weightKg = "54";
  const calendar = recomputeCalendar([month]);
  const html = renderToStaticMarkup(
    createElement(TbDoseCalendar, {
      value: calendar,
      onChange: () => {},
      readOnly: true,
    }),
  );
  assert.match(html, /NOV-26/);
  assert.match(html, />X</);
  assert.match(html, /ABC/);
  assert.match(html, /54/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /Add Treatment Month/);
});

test("TbDoseCalendar edit mode still uses inputs", () => {
  const html = renderToStaticMarkup(
    createElement(TbDoseCalendar, {
      value: recomputeCalendar([createEmptyMonth(0)]),
      onChange: () => {},
      readOnly: false,
    }),
  );
  assert.match(html, /<input/);
  assert.match(html, /Add Treatment Month/);
});

await server.close();
rmSync(cacheDir, { recursive: true, force: true });
