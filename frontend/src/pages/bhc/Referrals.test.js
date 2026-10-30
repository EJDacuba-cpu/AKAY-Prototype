import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { TAB_WAITING } from "../../utils/bhcReferralWorkspace.js";

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

const { default: Referrals } = await server.ssrLoadModule("/src/pages/bhc/Referrals.jsx");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

const sentReferral = {
  id: "12",
  trackingId: "REF-TEST-12",
  patientName: "Sent Patient",
  status: "Pending",
  receivingFacility: "Central RHU",
  createdAt: "2026-10-20",
};

const waitingHold = {
  id: "44",
  patientName: "Ana Cruz",
  consultationDate: "2026-10-30",
  ruralHealthUnitName: "Central RHU",
  reasonForReferral: "Persistent cough for two weeks",
};

function render(path = "/bhc/referrals") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(queryKeys.referrals("bhc"), [sentReferral]);
  client.setQueryData(queryKeys.referralHolds(), [waitingHold]);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(Referrals)),
    ),
  );
  client.clear();
  return html;
}

test("sent tab keeps the compact table and view action", () => {
  const html = render();
  assert.match(html, /Sent Referrals/);
  assert.match(html, /Waiting to Submit/);
  assert.match(html, /REF-TEST-12/);
  assert.match(html, /Sent Patient/);
  assert.match(html, /<table/);
  assert.match(html, /Open actions/);
  assert.doesNotMatch(html, /Ana Cruz/);
});

test("waiting tab renders compact action cards instead of a table", () => {
  const html = render(`/bhc/referrals?tab=${TAB_WAITING}`);
  assert.match(html, /Ana Cruz/);
  assert.match(html, /Persistent cough for two weeks/);
  assert.match(html, /Awaiting doctor availability/);
  assert.match(html, /View Details/);
  assert.match(html, /Check Availability &amp; Submit|Check Availability & Submit/);
  assert.match(html, /href="\/bhc\/referrals\/waiting\/44"/);
  assert.doesNotMatch(html, /REF-TEST-12/);
  assert.doesNotMatch(html, /<table/);
});

test("waiting tab has a clean empty state", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(queryKeys.referrals("bhc"), []);
  client.setQueryData(queryKeys.referralHolds(), []);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [`/bhc/referrals?tab=${TAB_WAITING}`] },
        createElement(Referrals),
      ),
    ),
  );
  client.clear();
  assert.match(html, /No referrals waiting to submit/);
});
