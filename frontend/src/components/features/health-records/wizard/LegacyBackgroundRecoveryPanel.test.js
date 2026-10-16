import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { legacyBackgroundRecovery } from "../../../../utils/legacyBackgroundRecovery.js";

const server = await createServer({
  configFile: false,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: Panel } = await server.ssrLoadModule("/src/components/features/health-records/wizard/LegacyBackgroundRecoveryPanel.jsx");
const { default: Conflict } = await server.ssrLoadModule("/src/components/features/health-records/wizard/BackgroundConflictPanel.jsx");
const update = {
  sections: {
    medical: { allergies: { items: [{ allergen: "", reaction: "Hives" }] } },
    social: { personalSocial: { education: { level: "College" }, pastOccupations: "Fisherman", smoking: { status: "current" } } },
  },
  baseRevisions: { medical: 2, social: 3 },
};
const recovery = legacyBackgroundRecovery(update, {});
const render = (props = {}) => renderToStaticMarkup(createElement(Panel, { recovery, update, ...props }));

test("incomplete staged history has correction fields while removed demographics remain copyable text", () => {
  const html = render({ onCorrect: () => {} });
  assert.match(html, /Correct staged Past Medical History/);
  assert.match(html, /<input[^>]*value="Hives"/);
  assert.match(html, /Fisherman/);
  assert.doesNotMatch(html, /<(?:input|textarea)[^>]*value="(?:Fisherman|College)"/);
});

test("a locked finalizer may acknowledge Keep without gaining correction or discard rights", () => {
  const html = render({ disabled: true, canKeep: true });
  const buttons = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)];
  assert.doesNotMatch(buttons.find((b) => b[2].includes("Keep for this consultation"))[1], / disabled=""/);
  assert.match(buttons.find((b) => b[2].includes("Discard changes"))[1], / disabled=""/);
  assert.doesNotMatch(html, /Correct staged|<input/);
});

test("BHC conflicts omit moved demographic rows while the shared default retains historical RHU rows", () => {
  const props = { conflicts: [{ section: "social", current: {}, revision: 4 }], update };
  const bhc = renderToStaticMarkup(createElement(Conflict, { ...props, hideMovedSocialFields: true }));
  assert.match(bhc, /Smoking/);
  assert.doesNotMatch(bhc, /Fisherman|College|Past Occupations|Education/);
  const rhu = renderToStaticMarkup(createElement(Conflict, props));
  assert.match(rhu, /Fisherman/);
});
