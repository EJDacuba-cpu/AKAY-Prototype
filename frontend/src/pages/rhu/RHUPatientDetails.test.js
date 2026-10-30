import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "RHUPatientDetails.jsx"),
  "utf8",
);

function tabBlock(text) {
  const match = text.match(/const tabs = \[[\s\S]*?\];/);
  assert.ok(match, "expected a tabs array");
  return match[0];
}

test("RHU patient details Overview uses the BHC anatomy workspace", () => {
  assert.match(source, /patient-overview\.css/);
  assert.match(source, /anatomyWorkspace/);
  assert.match(source, /PatientHistoryReference/);
  assert.match(source, /vitals=\{<VitalsTiles/);
  assert.doesNotMatch(source, /left=\{<VitalsTiles/);
  assert.match(source, /ProfileQueueAction/);
  assert.match(source, /patient-profile-content/);
  assert.match(source, /patient-profile-panels/);
});

test("RHU patient details adds a read-only Patient Background tab after Patient Information", () => {
  assert.match(source, /PatientBackgroundTab/);
  assert.match(source, /canEdit=\{false\}/);
  assert.match(source, /basePath=\{BASE_PATH\}/);
  const tabs = tabBlock(source);
  const info = tabs.indexOf('key: "patient-info"');
  const background = tabs.indexOf('key: "background"');
  const programs = tabs.indexOf('key: "programs"');
  assert.ok(info !== -1 && background !== -1 && programs !== -1);
  assert.ok(info < background && background < programs);
});
