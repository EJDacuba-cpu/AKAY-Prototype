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
    {
      name: "test-page-shell",
      enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/").endsWith("/components/layout/DashboardLayout.jsx")) {
          return "export default function DashboardLayout({ children }) { return children; }";
        }
      },
    },
    react(),
  ],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());

const { default: WaitingReferralDetails } = await server.ssrLoadModule(
  "/src/pages/bhc/WaitingReferralDetails.jsx",
);
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

const hold = {
  id: "44",
  patientName: "Ana Cruz",
  consultationDate: "2026-10-30",
  ruralHealthUnitName: "Central RHU",
  ruralHealthUnitId: "9",
  reasonForReferral: "Persistent cough for two weeks",
  chiefComplaint: "Cough for 14 days",
  initialDiagnosis: "Suspected pneumonia",
  initialActionTaken: "Advised rest and fluids",
  healthRecordId: "31",
  urgencyLevel: "Routine",
};

function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(queryKeys.referralHold("44"), hold);
  client.setQueryData(["approved-referral-destinations", undefined, undefined], {
    destinations: [
      {
        id: "9",
        name: "Central RHU",
        availability: { can_submit_referral: true, available_count: 1 },
      },
    ],
  });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: ["/bhc/referrals/waiting/44"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/bhc/referrals/waiting/:holdId",
            element: createElement(WaitingReferralDetails),
          }),
        ),
      ),
    ),
  );
  client.clear();
  return html;
}

test("waiting details show saved findings without a tracking ID or QR", () => {
  const html = render();
  for (const text of [
    "Ana Cruz",
    "Persistent cough for two weeks",
    "Cough for 14 days",
    "Suspected pneumonia",
    "Advised rest and fluids",
    "Awaiting doctor availability",
    "not an accepted RHU appointment",
    "Check Availability &amp; Submit",
    "Discard unsent referral",
  ]) {
    assert.ok(html.includes(text), text);
  }
  assert.match(html, /href="\/bhc\/health-records\/31"/);
  assert.doesNotMatch(html, /REF-|qr_code|Regenerate QR|Print Referral Slip/);
});
