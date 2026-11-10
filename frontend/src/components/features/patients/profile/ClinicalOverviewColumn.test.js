import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-active-care-overview-"));
const server = await createServer({
  cacheDir, configFile: false, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Unexpected cache path");
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: ClinicalOverviewColumn } = await server.ssrLoadModule("/src/components/features/patients/profile/ClinicalOverviewColumn.jsx");
const { getCareTracking } = await server.ssrLoadModule("/src/utils/careTracking.js");
const { getBhcPatientProfileQueries, getRhuPatientProfileQueries } = await server.ssrLoadModule("/src/services/patientProfileQueries.js");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

const patient = { sex: "Female", birthdate: "1995-01-01" };
const today = new Date("2026-11-11T12:00:00");
function render(records = [], options = {}) {
  return renderToStaticMarkup(createElement(ClinicalOverviewColumn, {
    careTracking: getCareTracking(patient, records, today, options),
  }));
}

test("Overview omits Care programs when the patient is only eligible, with no enrollment", () => {
  const html = render();
  assert.doesNotMatch(html, /Care programs|Nutrition Care|Not Enrolled|Not started|No record yet/);
  assert.match(html, /Recent visits/);
});

test("Overview counts active programs only, retaining ongoing maternal care", () => {
  const html = render([
    { id: 1, dateOfVisit: "2026-11-01", selectedPrograms: ["Maternal"], maternalData: { gravida: "1" } },
    { id: 2, dateOfVisit: "2026-11-02", selectedPrograms: ["Nutrition"], weight: "60", height: "160" },
  ]);
  assert.match(html, /Maternal Care/);
  assert.match(html, /View all \(2\)/);
  assert.doesNotMatch(html, /Not started|Not Enrolled/);
});

test("closed Nutrition summary overrides old enrollment records in the Overview", () => {
  const html = render([
    { id: 2, dateOfVisit: "2026-11-02", selectedPrograms: ["Nutrition"] },
  ], { nutritionCare: { status: "Closed", enrolled: false } });
  assert.doesNotMatch(html, /Care programs|Nutrition Care|View all/);
});

test("active Nutrition summary appears even without a local enrollment record", () => {
  const html = render([], { nutritionCare: { status: "Active", enrolled: true, enrolledOn: "2026-11-01" } });
  assert.match(html, /Nutrition Care/);
  assert.match(html, /View all \(1\)/);
  assert.doesNotMatch(html, /Maternal Care/);
});

test("completed maternal episodes stay out of the active program summary", () => {
  const html = render([
    { id: 1, dateOfVisit: "2026-09-01", selectedPrograms: ["Maternal"], maternalData: { deliveryDate: "2026-09-01" } },
  ]);
  assert.doesNotMatch(html, /Care programs|Maternal Care|Completed/);
});

test("diagnosis alone does not count as active monitoring; stopped monitoring stays hidden", () => {
  for (const monitoring of [null, { id: 1, status: "stopped" }]) {
    const html = render([], { conditions: [{
      conditionIdentity: "hypertension", conditionName: "Hypertension", status: "active", monitoring,
    }] });
    assert.doesNotMatch(html, /Care programs|Hypertension/);
  }
});

test("ongoing condition monitoring appears while resolved history stays hidden", () => {
  const html = render([], { conditions: [
    { conditionIdentity: "hypertension", status: "controlled", monitoring: { id: 1, status: "active" } },
    { conditionIdentity: "diabetes_mellitus", status: "resolved", monitoring: { id: 2, status: "stopped" } },
  ] });
  assert.match(html, /Hypertension/);
  assert.match(html, /View all \(1\)/);
  assert.doesNotMatch(html, /Diabetes Mellitus/);
});

for (const [role, getQueries] of [["BHC", getBhcPatientProfileQueries], ["RHU", getRhuPatientProfileQueries]]) {
  test(`${role} profile reads authoritative Nutrition enrollment through the shared care-overview cache`, async (t) => {
    const query = getQueries("9", { canViewHistory: true }).careOverview;
    assert.ok(query, "Profile must load care-overview instead of relying on old health records alone");
    assert.deepEqual(query.queryKey, queryKeys.careOverview("9"));
    assert.equal(query.enabled, true);
    assert.equal(getQueries("9").careOverview.enabled, false);
    assert.equal(getQueries("", { canViewHistory: true }).careOverview.enabled, false);
    t.mock.method(globalThis, "fetch", async (url) => {
      assert.match(String(url), /\/patients\/9\/care-overview$/);
      return Response.json({ data: { nutrition_care: { status: "Closed", enrolled: false } } });
    });
    const overview = await query.queryFn();
    assert.equal(overview.nutritionCare.status, "Closed");
  });
}
