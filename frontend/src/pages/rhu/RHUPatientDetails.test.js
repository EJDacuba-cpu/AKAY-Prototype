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
  assert.doesNotMatch(source, /PatientHistoryReference/);
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

test("RHU patient details has no specialized program tabs; Care & Programs owns tracking", () => {
  assert.match(source, /CareAndProgramsTab/);
  assert.match(source, /getCareTracking/);
  assert.match(source, /getSpecializedRecordPrograms/);
  assert.doesNotMatch(source, /SpecializedRecordsTab/);
  assert.doesNotMatch(source, /PROFILE_SPECIALIZED_TABS/);
  assert.doesNotMatch(source, /profileSpecializedTabs/);
  assert.doesNotMatch(source, /activeSpecializedProgram/);
  assert.doesNotMatch(source, /specialized:/);
  const tabs = tabBlock(source);
  assert.match(tabs, /key: "programs"/);
  assert.match(tabs, /key: "records"/);
  assert.match(tabs, /key: "referrals"/);
  assert.doesNotMatch(tabs, /specialized/);
});
