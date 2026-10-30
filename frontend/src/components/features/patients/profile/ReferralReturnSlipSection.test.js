import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-referral-return-slip-tests", plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(() => server.close());
const { default: Section } = await server.ssrLoadModule("/src/components/features/patients/profile/ReferralReturnSlipSection.jsx");

test("return slip has role-specific pending copy", () => {
  const pendingMessage = "Pending feedback. The return slip will appear here once submitted.";
  assert.match(renderToStaticMarkup(createElement(Section, { referral: {}, pendingMessage })), /Pending feedback/);
  assert.match(renderToStaticMarkup(createElement(Section, { referral: {} })), /Awaiting RHU feedback/);
});

test("saved return slip maps API fields without exposing editing controls", () => {
  const html = renderToStaticMarkup(createElement(Section, { referral: { feedback: {
    rhu_diagnosis: "Saved findings", action_taken: "Saved action", treatment_notes: "Saved treatment", remarks: "Saved remarks", receiving_practitioner: "Test clinician",
  } } }));
  for (const text of ["Saved findings", "Saved action", "Saved treatment", "Saved remarks", "Test clinician"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<input|<textarea|<form/);
});
