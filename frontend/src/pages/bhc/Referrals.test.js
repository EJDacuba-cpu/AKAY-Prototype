import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { VIEW_WAITING } from "../../utils/bhcReferralWorkspace.js";

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
  classification: "General Consultation",
  urgencyLevel: "Routine",
  createdAt: "2026-10-20",
};

const waitingHold = {
  id: "44",
  patientName: "Ana Cruz",
  consultationDate: "2026-10-30",
  ruralHealthUnitName: "Central RHU",
  reasonForReferral: "Persistent cough for two weeks",
  urgencyLevel: "Routine",
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

test("sent view uses a compact four-column table", () => {
  const html = render();
  assert.match(html, /Sent Referrals/);
  assert.match(html, /Referral No\./);
  assert.match(html, /REF-TEST-12/);
  assert.match(html, /Sent Patient/);
  assert.match(html, /Central RHU/);
  assert.match(html, /General Consultation/);
  assert.match(html, /Pending/);
  assert.match(html, /Routine priority/);
  assert.match(html, /<table/);
  assert.match(html, /Open actions/);
  assert.doesNotMatch(html, /Ana Cruz/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.doesNotMatch(html, />Classification</);
  assert.doesNotMatch(html, />Urgency</);
});

test("waiting view renders a table with actions", () => {
  const html = render(`/bhc/referrals?view=${VIEW_WAITING}`);
  assert.match(html, /Ana Cruz/);
  assert.match(html, /Persistent cough for two weeks/);
  assert.match(html, /Awaiting doctor availability/);
  assert.match(html, /View Details/);
  assert.match(html, /Check Availability &amp; Submit|Check Availability & Submit/);
  assert.match(html, /href="\/bhc\/referrals\/waiting\/44"/);
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /REF-TEST-12/);
});

test("legacy tab=waiting still opens the waiting list", () => {
  const html = render(`/bhc/referrals?tab=${VIEW_WAITING}`);
  assert.match(html, /Ana Cruz/);
  assert.match(html, /<table/);
});

test("waiting view keeps table headers with an in-body empty state", () => {
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
        { initialEntries: [`/bhc/referrals?view=${VIEW_WAITING}`] },
        createElement(Referrals),
      ),
    ),
  );
  client.clear();
  assert.match(html, /No referrals waiting to submit/);
  assert.match(html, /<thead/);
  assert.match(html, />Patient</);
  assert.match(html, /of 0 waiting/);
});

test("sent view keeps table headers with an in-body empty state", () => {
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
        { initialEntries: ["/bhc/referrals"] },
        createElement(Referrals),
      ),
    ),
  );
  client.clear();
  assert.match(html, /No referrals yet/);
  assert.match(html, /Referral No\./);
  assert.match(html, /of 0 referrals/);
});

test("sent toolbar keeps search clear in the field and count near the table", () => {
  const html = render();
  assert.doesNotMatch(html, /Search:/);
  assert.doesNotMatch(html, /Clear Filters/);
  assert.match(html, /of \d+ referrals/);
  assert.match(html, /Search referrals/);
});
