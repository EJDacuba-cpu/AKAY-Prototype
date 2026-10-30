import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-rhu-previous-vitals-tests", plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(() => server.close());
const { default: Reference } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuPreviousVitalsReference.jsx");

test("previous vitals show BHC provenance and blanks without editable inputs", () => {
  const html = renderToStaticMarkup(createElement(Reference, {
    vitals: [{ label: "BP", value: "120/80 mmHg" }, { label: "Temperature", value: "" }],
    sendingBhc: "Test BHC", recordedAt: "2026-10-30",
  }));
  for (const text of ["Previous BHC vital signs", "Test BHC", "2026", "120/80 mmHg", "Not recorded"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<input|<textarea/);
});

test("missing BHC record still names each previous measurement", () => {
  const html = renderToStaticMarkup(createElement(Reference));
  for (const text of ["BP", "Temperature", "Pulse", "Respiratory rate", "SpO2", "Weight", "Height"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/Not recorded/g) || []).length, 9);
});
