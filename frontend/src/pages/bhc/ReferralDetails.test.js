import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({
  configFile: false,
  plugins: [
    { name: "test-page-shell", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/components/layout/DashboardLayout.jsx")) {
        return "export default function DashboardLayout({ children }) { return children; }";
      }
    } },
    react(),
  ],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: ReferralDetails } = await server.ssrLoadModule("/src/pages/bhc/ReferralDetails.jsx");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

const referral = {
  id: "51", trackingId: "REF-TEST-51", patientId: "7", patientName: "Test Patient",
  status: "Pending", urgencyLevel: "Priority", healthRecordId: "31",
  referringHci: "Test BHC", receivingFacility: "Test RHU",
  referralDateTime: "2026-10-28T09:00:00+08:00",
  reasonForReferral: "Assessment requested", chiefComplaint: "Saved complaint",
  initialDiagnosis: "Suspected hypertension; previously confirmed diabetes",
  initialActionsTaken: "Saved initial action",
};

function render(overrides = {}, state = null, healthRecord = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(queryKeys.referralDetails("bhc", referral.trackingId), {
    referral: { ...referral, ...overrides }, patient: null, healthRecord,
  });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [{ pathname: `/bhc/referrals/${referral.trackingId}`, state }] },
      createElement(Routes, null, createElement(Route, { path: "/bhc/referrals/:trackingId", element: createElement(ReferralDetails) })))));
  client.clear();
  return html;
}

test("clinical section contains only saved referral information and preserves assessment wording", () => {
  const html = render({}, null, { summary: "LIVE SUMMARY", diagnosis: "LIVE DIAGNOSIS", vitalSigns: { temperature: "LIVE TEMP" } });
  for (const label of ["Clinical Information Sent", "Reason for Referral", "Chief Complaint", "Initial Assessment", "Initial Action Taken", "View Source Health Record"]) assert.ok(html.includes(label), label);
  for (const text of [referral.reasonForReferral, referral.chiefComplaint, referral.initialDiagnosis, referral.initialActionsTaken]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/bhc\/health-records\/31"/);
  assert.doesNotMatch(html, /LIVE SUMMARY|LIVE DIAGNOSIS|LIVE TEMP|Relevant Clinical Findings|Vital Signs|Physical Examination|Body Findings/);
  assert.match(html, /Confirmation status was not saved separately/);
});

test("missing saved clinical fields never fall back to the linked Health Record", () => {
  const html = render({ chiefComplaint: "", initialDiagnosis: null, initialActionsTaken: " " }, null, {
    chiefComplaint: "LIVE COMPLAINT", diagnosis: "LIVE DIAGNOSIS", initialActionsTaken: "LIVE ACTION",
  });
  assert.doesNotMatch(html, /LIVE COMPLAINT|LIVE DIAGNOSIS|LIVE ACTION/);
  assert.ok((html.match(/Not recorded with this referral\./g) || []).length >= 3);
});

test("legacy snake_case referral fields remain readable without a source record", () => {
  const html = render({ reasonForReferral: undefined, chiefComplaint: undefined, initialDiagnosis: undefined, initialActionsTaken: undefined,
    reason_for_referral: "Legacy reason", chief_complaint: "Legacy complaint", initial_diagnosis: "Legacy assessment", initial_action_taken: "Legacy action", healthRecordId: "" });
  for (const text of ["Legacy reason", "Legacy complaint", "Legacy assessment", "Legacy action"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /href="\/bhc\/health-records\//);
  assert.match(html, /No source Health Record linked/);
});

for (const status of ["Pending", "Completed"]) {
  test(`${status} referral without feedback keeps its official status and shows an inline empty state`, () => {
    const html = render({ status, feedback: null });
    assert.ok(html.includes(status));
    assert.match(html, /RHU Return Slip/);
    assert.match(html, /Awaiting RHU feedback/);
    assert.doesNotMatch(html, /role="tablist"|role="tab"/);
  });
}

test("saved API feedback is visible and read-only alongside referral information", () => {
  const html = render({ status: "Completed", feedback: {
    rhu_diagnosis: "RHU finding", action_taken: "RHU action", treatment_notes: "RHU treatment",
    recommendation: "Care recommendation", remarks: "Follow-up instructions",
    receiving_practitioner: "Receiving clinician", received_at: "2026-10-28T10:00:00+08:00", created_at: "2026-10-28T11:00:00+08:00",
  } });
  for (const text of ["RHU finding", "RHU action", "RHU treatment", "Care recommendation", "Follow-up instructions", "Receiving clinician", "Saved complaint"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Awaiting RHU feedback|<textarea|<input/);
});

test("legacy return slip preserves its saved instructions and personnel", () => {
  const html = render({ feedback: null, returnSlip: { rhuDiagnosis: "Legacy finding", actionsTaken: "Legacy action", assessmentOutcome: "Legacy outcome", followUpDate: "2026-11-05", recommendation: "Legacy recommendation", remarks: "Legacy remarks", receivingPersonnel: "Legacy clinician", submittedBy: "Legacy submitter" } });
  for (const text of ["Legacy finding", "Legacy action", "Legacy outcome", "Legacy recommendation", "Legacy remarks", "Legacy clinician", "Legacy submitter", "Nov 5, 2026"]) assert.ok(html.includes(text), text);
});

test("verification workspace keeps print and regenerate actions and the existing 80mm print document", () => {
  const html = render();
  for (const text of ["Print Referral Slip", "Regenerate QR", "Referral Verification Slip", "referral-print-area", "width: 80mm", "Do not encode or share clinical details through QR."]) assert.ok(html.includes(text), text);
  const printDocument = html.slice(html.indexOf('<section class="referral-print-area'));
  assert.ok(printDocument.includes(referral.trackingId));
  assert.doesNotMatch(printDocument, /Saved complaint|Saved initial action|Suspected hypertension/);
});

test("direct entry returns to the facility referral list", () => {
  const html = render();
  assert.match(html, /href="\/bhc\/referrals"/);
  assert.match(html, /Back to Referrals/);
});

test("patient entry returns to the same patient and tab", () => {
  const html = render({}, { patientProfile: { path: "/bhc/patients/7?tab=referrals", state: null } });
  assert.match(html, /href="\/bhc\/patients\/7\?tab=referrals"/);
  assert.match(html, /Back to Patient/);
});
