import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-rhu-referral-reference-tests", plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(() => server.close());
const { default: Reference } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuBhcReferralReference.jsx");
const { createRhuHealthRecord } = await server.ssrLoadModule("/src/services/healthRecordService.js");
const { additionalConcernPayload } = await server.ssrLoadModule("/src/utils/rhuVisitReferral.js");

test("BHC referral reference renders saved clinical context read-only", () => {
  const html = renderToStaticMarkup(createElement(Reference, {
    slip: { referringHci: "Test BHC", chiefComplaint: "Original complaint", historyOfPresentIllness: "", services: "Assessment requested", reason: "BHC reason" },
    onViewFullSlip() {},
  }));
  for (const text of ["BHC Referral", "Test BHC", "Original complaint", "Not recorded", "Assessment requested", "BHC reason", "View Full Referral Slip"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<input|<textarea|type="radio"/);
});

test("RHU save serializes a separate concern without losing follow-up schedules", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_input, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { id: 3, ...body } }), { status: 201 });
  };
  const schedules = [{ purposeKey: "visit", purpose: "Review", date: "2026-11-10" }];
  try {
    for (const show of [true, false]) {
      const concern = additionalConcernPayload({ show, chiefComplaint: " Second concern ", historyOfPresentIllness: "Since dawn" });
      await createRhuHealthRecord({ patientId: 7, consultationWorkflow: "rhu_itr_v1", chiefComplaint: "Today's complaint", summaryOfPresentIllness: "Today's history", monitoringData: { additionalConcern: concern }, followUpSchedules: schedules });
      assert.equal(body.chief_complaint, "Today's complaint");
      assert.equal(body.history_of_present_illness, "Today's history");
      assert.deepEqual(body.monitoring_data.followUpSchedules, schedules);
      if (show) assert.deepEqual(body.monitoring_data.additionalConcern, { chiefComplaint: "Second concern", historyOfPresentIllness: "Since dawn" });
      else assert.equal(Object.hasOwn(body.monitoring_data, "additionalConcern"), false);
    }
  } finally { globalThis.fetch = originalFetch; }
});
