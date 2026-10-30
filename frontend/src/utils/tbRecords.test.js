import test from "node:test";
import assert from "node:assert/strict";
import { isTbRecord } from "./tbRecords.js";

test("TB records are detected by data, with the legacy category and program kept", () => {
  assert.equal(isTbRecord({ category: "General Consultation", tb_data: { diagnosis: { tbCaseNumber: "TB-1" } } }), true);
  assert.equal(isTbRecord({ category: "TB DOTS / TB Monitoring" }), true);
  assert.equal(isTbRecord({ monitoringData: { selectedPrograms: ["TB"] } }), true);
  assert.equal(isTbRecord({ category: "General Consultation", tbData: {} }), false);
  assert.equal(isTbRecord({ category: "Maternal" }), false);
});
