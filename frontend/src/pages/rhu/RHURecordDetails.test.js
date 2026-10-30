import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "RHURecordDetails.jsx"),
  "utf8",
);

test("RHU health record details mounts the BHC ledger workspace and print sheet", () => {
  assert.match(source, /BhcHealthRecordWorkspace/);
  assert.match(source, /BhcHealthRecordPrintDocument/);
  assert.match(source, /BHC_HEALTH_RECORD_PRINT_PAGE_STYLES/);
  assert.match(source, /role="rhu"/);
  assert.match(source, /queryKeys\.healthRecordDetails\("rhu"/);
  assert.match(source, /getPatientRecordReturn\(/);
  assert.match(source, /"\/rhu"/);
  assert.match(source, /bodyFindingsHistory/);
});

test("RHU health record details loads the record and patient by id, not the facility patient list", () => {
  assert.match(source, /getHealthRecordById/);
  assert.match(source, /getPatientById/);
  assert.doesNotMatch(source, /getPatientDetailsListByRole/);
  assert.doesNotMatch(source, /getPatientsByRole/);
  assert.doesNotMatch(source, /RecordHeaderCard/);
  assert.doesNotMatch(source, /Accordion/);
  assert.doesNotMatch(source, /SideCard/);
  assert.doesNotMatch(source, /anim-fade-up/);
  assert.doesNotMatch(source, /Record Follow-up Visit/);
  assert.doesNotMatch(source, /View Referral/);
});
