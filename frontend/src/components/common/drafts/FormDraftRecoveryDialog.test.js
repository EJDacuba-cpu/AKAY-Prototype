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

const cacheDir = join(tmpdir(), `akay-vite-ssr-draft-dialog-${process.pid}`);
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
const { default: Dialog, FormDraftRecoveryDialogView: View } = await server.ssrLoadModule(
  "/src/components/common/drafts/FormDraftRecoveryDialog.jsx",
);
const { draftRecoveryDialogReducer: transition } = await server.ssrLoadModule(
  "/src/components/common/drafts/draftRecoveryDialogState.js",
);
const noop = () => {};
const { default: ClinicalDialog } = await server.ssrLoadModule("/src/components/features/health-records/UnfinishedConsultationModal.jsx");
const { default: RhuDialog } = await server.ssrLoadModule("/src/components/features/rhu-queue/RhuConsultationRecoveryDialog.jsx");
const defaults = { open: true, onResume: noop, onDiscard: noop, onClose: noop };
const render = (props = {}) => renderToStaticMarkup(createElement(Dialog, { ...defaults, ...props }));
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
  .map((match) => ({ attributes: match[1], label: match[2].replace(/<[^>]*>/g, "") }));
const button = (html, label) => buttons(html).find((item) => item.label === label);

test("the existing consultation decision uses the same Resume, Discard and X pattern", () => {
  const html = renderToStaticMarkup(createElement(ClinicalDialog, { draft: { patient: { label: "Selected patient" } }, onCancel: noop, onContinue: noop, onDiscardAndStart: noop }));
  assert.ok(button(html, "Resume"));
  assert.ok(button(html, "Discard"));
  assert.equal(button(html, "Cancel"), undefined);
  assert.doesNotMatch(html, /Continue Draft|Discard &amp; Start New/);
});

test("recovery offers Resume and Discard with an accessible close, never a fresh-start action", () => {
  const html = render({
    title: "Unfinished Consultation",
    contextLabel: "Selected patient",
    classification: "General Consultation",
    draftStatus: "Saved draft",
    lastSavedAt: "2026-11-07T04:00:00Z",
    resumeLabel: "Resume Consultation",
  });
  assert.match(html, /role="dialog"/);
  assert.match(html, /Unfinished Consultation/);
  assert.match(html, /An unfinished consultation was found for this patient/);
  assert.match(html, /Consultation type/);
  assert.match(html, /General Consultation/);
  assert.match(html, /Draft status/);
  assert.ok(button(html, "Resume Consultation"));
  assert.ok(button(html, "Discard"));
  assert.match(html, /aria-label="Close modal"/);
  assert.match(html, /<time[^>]*dateTime="2026-11-07T04:00:00Z"/);
  assert.doesNotMatch(html, />Cancel<|>Continue<|>Start new</i);
  assert.equal(render({ open: false }), "");
});

test("busy recovery disables resume, discard, close and retry controls", () => {
  const html = render({ busy: true, error: "Recovery failed", onRetry: noop });
  for (const action of buttons(html)) assert.match(action.attributes, /disabled=""/, action.label);
  assert.match(html, /role="alert"[^>]*>Recovery failed/);
});

test("checking and failed lookup never pretend a recoverable draft was found", () => {
  const checking = render({ checking: true });
  assert.match(checking, /Checking for unfinished work/);
  assert.equal(button(checking, "Resume"), undefined);
  assert.equal(button(checking, "Discard"), undefined);
  const failed = render({ onResume: undefined, onDiscard: undefined, onRetry: noop, error: "Unable to check drafts" });
  assert.ok(button(failed, "Retry"));
  assert.match(failed, /role="alert"[^>]*>Unable to check drafts/);
  assert.equal(button(failed, "Resume"), undefined);
  assert.equal(button(failed, "Discard"), undefined);
  assert.doesNotMatch(failed, /No unfinished|No draft|Start new|You have unfinished/i);
});

test("discard requires confirmation in the same dialog and dismissal returns to the decision", () => {
  const phase = transition("decision", { type: "request-discard" });
  assert.equal(phase, "confirm-discard");
  const html = renderToStaticMarkup(createElement(View, {
    ...defaults,
    title: "Unfinished Consultation",
    contextLabel: "Selected patient",
    phase,
    error: "Discard could not be completed",
    onKeepDraft: noop,
  }));
  assert.equal((html.match(/role="dialog"/g) || []).length, 1);
  assert.match(html, /Discard unfinished work\?/);
  assert.ok(button(html, "Keep Draft"));
  assert.match(button(html, "Keep Draft").attributes, /data-modal-primary="true"/);
  assert.doesNotMatch(button(html, "Discard").attributes, /data-modal-primary|autofocus/i);
  assert.equal(button(html, "Resume"), undefined);
  assert.match(html, /Selected patient/);
  assert.match(html, /role="alert"[^>]*>Discard could not be completed/);
  assert.equal(transition(phase, { type: "keep-draft" }), "decision");
  assert.equal(transition(phase, { type: "close" }), "decision");
  assert.equal(transition(phase, { type: "unknown" }), phase);
});

test("busy transitions cannot dismiss a pending discard or enter a new confirmation", () => {
  assert.equal(transition("decision", { type: "request-discard", blocked: true }), "decision");
  for (const type of ["close", "keep-draft"]) {
    assert.equal(transition("confirm-discard", { type, blocked: true }), "confirm-discard");
  }
  const html = renderToStaticMarkup(createElement(View, { ...defaults, phase: "confirm-discard", busy: true }));
  for (const action of buttons(html)) assert.match(action.attributes, /disabled=""/, action.label);
});

test("context is escaped and can wrap, and invalid saved dates get a truthful fallback", () => {
  const contextLabel = "<script>unsafe()</script>" + "LongName".repeat(60);
  const html = render({ contextLabel, lastSavedAt: "not-a-date", deviceOnly: true });
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /Saved on this device/);
  assert.match(html, /Saved time unavailable/);
  assert.doesNotMatch(html, /Invalid Date|<script>|dateTime="not-a-date"/);
});

test("conflicting copies require an explicit source choice instead of a silent overwrite", () => {
  const html = render({ onResume: undefined, onResumeDevice: noop, onResumeServer: noop, error: "Draft changed in another session" });
  assert.ok(button(html, "Use Device Copy"));
  assert.ok(button(html, "Use Synced Draft"));
  assert.equal(button(html, "Resume"), undefined);
  assert.match(html, /replaces the other recovery copy/);
});

test("patient registration recovery stays Resume/Discard until an unresolved conflict", () => {
  const normal = render({
    title: "Unfinished Registration",
    description: "You have an unfinished registration. Would you like to continue?",
    resumeLabel: "Resume Registration",
  });
  assert.match(normal, /Unfinished Registration/);
  assert.match(normal, /You have an unfinished registration\. Would you like to continue\?/);
  assert.ok(button(normal, "Resume Registration"));
  assert.ok(button(normal, "Discard"));
  assert.equal(button(normal, "Use Device Copy"), undefined);
  assert.equal(button(normal, "Use Synced Draft"), undefined);
  assert.doesNotMatch(normal, /New patient registration|Device Copy|Synced Draft|server version/i);

  const conflict = render({
    title: "Unfinished Registration",
    description: "Choose which unfinished copy to continue. Both are kept until restoration succeeds.",
    onResume: undefined,
    onResumeDevice: noop,
    onResumeServer: noop,
  });
  assert.ok(button(conflict, "Use Device Copy"));
  assert.ok(button(conflict, "Use Synced Draft"));
  assert.equal(button(conflict, "Resume Registration"), undefined);
  assert.ok(button(conflict, "Discard"));
});

test("restoration keeps one unfinished decision and puts progress on its primary button", () => {
  const html = renderToStaticMarkup(createElement(RhuDialog, {
    recovery: { decision: { server: { id: "d1", classification: "General Consultation" } }, busy: true, operation: "resume", resume: noop, discard: noop, retry: noop },
    onClose: noop,
  }));
  assert.match(html, /Unfinished Consultation/);
  assert.doesNotMatch(html, /Restoring Consultation|Check Consultation/);
  assert.match(button(html, "Restoring...").attributes, /disabled=""/);
  assert.match(button(html, "Restoring...").attributes, /aria-busy="true"/);
  assert.equal(button(html, "Resume Consultation"), undefined);
  assert.ok(button(html, "Discard"));
  assert.doesNotMatch(html, /<input|<textarea/);
  for (const action of buttons(html)) assert.match(action.attributes, /disabled=""/);
});

test("entry lookup does not render a separate checking modal", () => {
  const html = renderToStaticMarkup(createElement(RhuDialog, {
    recovery: { checking: true, retry: noop }, onClose: noop,
  }));
  assert.doesNotMatch(html, /role="dialog"|Check Consultation|Unfinished Consultation/);
});

test("a failed restore retains the unfinished decision with Retry and Cancel", () => {
  const html = renderToStaticMarkup(createElement(RhuDialog, {
    recovery: { decision: { server: { id: "d1" } }, error: "Unable to restore", retry: noop, resume: noop }, onClose: noop,
  }));
  assert.match(html, /Unfinished Consultation/);
  assert.ok(button(html, "Retry"));
  assert.ok(button(html, "Cancel"));
  assert.match(html, /role="alert"/);
});

test("RHU failed recovery offers Retry and Cancel without fresh start or destructive actions", () => {
  const html = renderToStaticMarkup(createElement(RhuDialog, {
    recovery: { error: "Unable to load saved input", retry: noop }, onClose: noop,
  }));
  assert.ok(button(html, "Retry"));
  assert.ok(button(html, "Cancel"));
  assert.equal(button(html, "Resume Consultation"), undefined);
  assert.equal(button(html, "Discard"), undefined);
  assert.match(html, /role="alert"/);
});
