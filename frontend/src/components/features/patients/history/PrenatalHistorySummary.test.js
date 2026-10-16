import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import {
  buildBackgroundUpdate,
  normalizeBackground,
  restoreBackgroundUpdate,
  toDraftBackgroundUpdate,
} from "../../../../utils/backgroundUpdate.js";

// Own cache dir: sharing node_modules/.vite with a dev server made the optimizer rename fail with EPERM on Windows.
const cacheDir = join(tmpdir(), `akay-vite-ssr-prenatal-${process.pid}`);
const server = await createServer({
  configFile: false,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: Summary } = await server.ssrLoadModule("/src/components/features/patients/history/PrenatalHistorySummary.jsx");

const background = normalizeBackground({
  obstetric: {
    menarcheAge: 12,
    pregnancies: [{ year: 2019, outcome: "liveBirth", delivery: "cesarean", note: "Recorded history note" }],
  },
  revisions: { obstetric: 2 },
});
const render = (props = {}) => renderToStaticMarkup(createElement(Summary, { background, ...props }));

test("prenatal reads the saved history without a second pregnancy editor or a computed current score", () => {
  const html = render();
  assert.match(html, /2019 live birth \(cesarean\)/);
  assert.match(html, /Recorded history note/);
  assert.doesNotMatch(html, /<input|<select|<textarea|G1 P1/);
});

test("prenatal immediately reads staged history, including after restoring a draft", () => {
  const edited = structuredClone(background);
  edited.obstetric.pregnancies[0].note = "Corrected during this visit";
  const staged = buildBackgroundUpdate(background, edited);
  for (const update of [staged, restoreBackgroundUpdate(toDraftBackgroundUpdate(staged))]) {
    const html = render({ update });
    assert.match(html, /Corrected during this visit/);
    assert.doesNotMatch(html, /Recorded history note/);
    assert.match(html, /They save when the consultation is finalized/);
  }
  assert.equal(background.obstetric.pregnancies[0].note, "Recorded history note");
});

test("clearing the shared history does not fall back to obsolete saved pregnancies", () => {
  const update = buildBackgroundUpdate(background, normalizeBackground({}));
  const html = render({ update });
  assert.match(html, /No obstetric or menstrual history recorded yet/);
  assert.doesNotMatch(html, /2019|cesarean|Recorded history note/);
});

test("restricted staff see a placeholder with no saved or staged clinical information", () => {
  const html = render({ locked: true, update: { sections: { obstetric: { obstetric: { symptomNotes: "Private staged note" } } } } });
  assert.match(html, /not permitted/);
  assert.doesNotMatch(html, /2019|cesarean|Recorded history note|Private staged note|Review \/ Update History/);
});

test("an unavailable OB section directs staff to patient information instead of offering a broken shortcut", () => {
  const html = render({ canReview: false, editLink: "/bhc/patients/7" });
  assert.match(html, /<button\b[^>]*\bdisabled=""/);
  assert.match(html, /href="\/bhc\/patients\/7"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /patient sex/);
});

/* ── BHC: Obstetric history is edited in Patient Background (opt-in) ──── */

test("BHC prenatal offers Edit in Patient Background instead of the removed History step", () => {
  const html = render({ backgroundEditing: true, onEditBackground: () => {} });
  assert.match(html, /Edit in Patient Background/);
  assert.doesNotMatch(html, /Review \/ Update History/);
  assert.match(html, /From Patient Background/);
  assert.doesNotMatch(html, /target="_blank"/);
});

test("BHC prenatal without the editing duty is view-only (no edit button)", () => {
  const html = render({ backgroundEditing: true });
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /Review \/ Update History|Edit in Patient Background/);
  assert.match(html, /2019 live birth/);
});

test("BHC prenatal keeps the sex-verification guard and its Patient Information link", () => {
  const html = render({ backgroundEditing: true, onEditBackground: () => {}, canReview: false, editLink: "/bhc/patients/7" });
  assert.match(html, /<button\b[^>]*\bdisabled=""[^>]*>[^<]*Edit in Patient Background/);
  assert.match(html, /patient sex/);
  assert.match(html, /href="\/bhc\/patients\/7"/);
});

test("BHC prenatal edit button is disabled while the draft is being saved", () => {
  const html = render({ backgroundEditing: true, onEditBackground: () => {}, editBusy: true });
  assert.match(html, /<button\b[^>]*\bdisabled=""/);
  assert.match(html, /Saving/);
});

test("without the opt-in the prenatal summary is unchanged for other callers", () => {
  const html = render({ onReview: () => {} });
  assert.match(html, /Review \/ Update History/);
  assert.doesNotMatch(html, /Edit in Patient Background/);
  assert.match(html, /From Patient History/);
});
