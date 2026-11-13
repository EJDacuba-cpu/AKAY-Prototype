import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-approved-draft-render-"));
const server = await createServer({ configFile: false, cacheDir, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => { await server.close(); rmSync(cacheDir, { recursive: true, force: true }); });
const { MemoryRouter, createMemoryRouter, RouterProvider } = await server.ssrLoadModule("react-router");
const { QueryClient, QueryClientProvider } = await server.ssrLoadModule("@tanstack/react-query");
const { default: Queue } = await server.ssrLoadModule("/src/components/features/rhu-queue/RhuQueueTable.jsx");
const { ConsultationButton } = await server.ssrLoadModule("/src/components/features/patients/profile/ConsultationActions.jsx");
const { default: FacilityForm } = await server.ssrLoadModule("/src/components/features/facilities/FacilityFormModal.jsx");
const { RegistrationForm } = await server.ssrLoadModule("/src/pages/bhc/AddPatient.jsx");
const { NotificationProvider } = await server.ssrLoadModule("/src/hooks/useNotificationsContext.jsx");
const { storeAuthSession } = await server.ssrLoadModule("/src/services/apiClient.js");
const noop = () => {};

test("queue lookup feedback stays on the clicked row action without an overlay", () => {
  const row = { id: 19, patientId: 7, number: 1, name: "Test patient", statusKey: "in_consultation", status: { label: "In Consultation", tone: "info" }, source: "walk_in", sourceLabel: "Walk-in" };
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Queue, { rows: [row], canEncode: true, entryBusy: true, checkingVisitId: 19 })));
  assert.match(html, /Checking\.\.\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-busy="true"/);
  assert.doesNotMatch(html, /role="dialog"|Check Consultation|Patient Interview/);
});

test("BHC profile lookup uses its disabled primary button and errors remain retryable", () => {
  const checking = renderToStaticMarkup(createElement(ConsultationButton, { consultation: { isPending: true, primaryLabel: "Start Consultation" }, onStart: noop }));
  assert.match(checking, /Checking\.\.\./);
  assert.match(checking, /disabled=""/);
  assert.doesNotMatch(checking, /role="dialog"/);
  const failed = renderToStaticMarkup(createElement(ConsultationButton, { consultation: { isError: true, primaryLabel: "Start Consultation" }, onStart: noop }));
  assert.doesNotMatch(failed, /disabled=""/);
  const start = renderToStaticMarkup(createElement(ConsultationButton, { consultation: { primaryLabel: "Start Consultation" }, onStart: noop }));
  assert.match(start, /Start Consultation/);
  const cont = renderToStaticMarkup(createElement(ConsultationButton, { consultation: { primaryLabel: "Continue Consultation" }, onStart: noop }));
  assert.match(cont, /Continue Consultation/);
  assert.doesNotMatch(cont, /Open Consultation/);
});

test("ordinary Add/Edit BHC and RHU facilities render without draft infrastructure", () => {
  for (const type of ["bhc", "rhu"]) for (const facility of [null, { id: 1, name: "Existing facility", status: "active", address: "Main street" }]) {
    const html = renderToStaticMarkup(createElement(FacilityForm, { type, facility, rhus: [], onSaved: noop, onClose: noop }));
    assert.match(html, /Save Facility/);
    assert.match(html, /Address/);
    assert.doesNotMatch(html, /Unfinished|Resume|Draft saved|Saving draft/);
    if (type === "rhu") assert.doesNotMatch(html, />Barangay</);
    else assert.match(html, />Barangay</);
  }
});

test("both registration roles start locked for recovery checking without a loading modal", () => {
  for (const role of ["bhc", "rhu"]) {
    storeAuthSession({ user: { id: 1, role, permissions: ["patients.register", "families.view", "families.manage"], barangay_health_center_id: role === "bhc" ? 1 : null, rural_health_unit_id: role === "rhu" ? 1 : null } });
    const client = new QueryClient();
    const router = createMemoryRouter([{ path: "*", element: createElement(NotificationProvider, null, createElement(RegistrationForm, { role, basePath: `/${role}`, live: true, registry: { patients: [], households: [] }, savePatient: noop })) }], { initialEntries: [`/${role}/patients/add`] });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
    // Shared registration skeleton holds the layout until draft readiness; no blank editable form.
    assert.match(html, /data-slot="registration-skeleton-columns"|Loading registration/);
    assert.doesNotMatch(html, /name="firstName"/);
    assert.doesNotMatch(html, /role="dialog"|Unfinished Registration/);
    router.dispose(); client.clear();
  }
});
