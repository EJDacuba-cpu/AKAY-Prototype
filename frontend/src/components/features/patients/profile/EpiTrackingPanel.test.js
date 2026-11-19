import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-epi-tracking-panel-"));
const server = await createServer({
  cacheDir,
  configFile: false,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Unexpected cache path");
  rmSync(cacheDir, { recursive: true, force: true });
});

const { default: EpiTrackingPanel } = await server.ssrLoadModule(
  "/src/components/features/patients/profile/EpiTrackingPanel.jsx",
);
const { EPI_INFANT_SCHEDULE } = await server.ssrLoadModule("/src/utils/careTrackingConfig.js");

function render(entry) {
  return renderToStaticMarkup(createElement(EpiTrackingPanel, { entry }));
}

test("EPI panel shows given vs pending doses and scheduled next visit", () => {
  const entry = {
    key: "epi",
    label: "EPI / Immunization",
    status: "In progress",
    facts: [{ label: "Doses", value: `2 of ${EPI_INFANT_SCHEDULE.length} applicable doses recorded`, type: "text" }],
    lastVisit: "2026-01-01",
    nextVisit: "2026-02-14",
    flags: [{ label: "Newborn Screening", tone: "neutral" }],
    records: [{ id: 11, dateOfVisit: "2026-01-01" }],
    doseProgress: EPI_INFANT_SCHEDULE.map((name, index) => ({
      name,
      given: index < 2,
      dateGiven: index < 2 ? "2026-01-01" : "",
    })),
  };
  const html = render(entry);
  assert.match(html, /EPI \/ Immunization Tracking/);
  assert.match(html, /Given 2 of 15/);
  assert.match(html, /13 pending/);
  assert.match(html, /BCG/);
  assert.match(html, /Pending/);
  assert.match(html, /Next visit/);
  assert.match(html, /Newborn Screening/);
  assert.doesNotMatch(html, /<input\b/i);
  assert.doesNotMatch(html, /dose calendar|adherence/i);
});

test("EPI panel shows Not scheduled when next visit is empty", () => {
  const html = render({
    key: "epi",
    status: "Not started",
    facts: [],
    lastVisit: "",
    nextVisit: "",
    records: [],
    doseProgress: EPI_INFANT_SCHEDULE.map((name) => ({ name, given: false, dateGiven: "" })),
  });
  assert.match(html, /Not scheduled/);
  assert.match(html, /Given 0 of 15/);
});
