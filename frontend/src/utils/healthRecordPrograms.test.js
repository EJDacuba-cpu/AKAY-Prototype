import assert from "node:assert/strict";
import test from "node:test";

import * as programModule from "./healthRecordPrograms.js";
import {
  getServiceTypeLabel,
  getSpecializedRecordPrograms,
  getSpecializedRecordType,
  isTbRecord,
  matchesClassificationFilter,
  matchesServiceTypeFilter,
  SPECIALIZED_RECORD_PROGRAMS,
} from "./healthRecordPrograms.js";

test("returns no specialized programs when the patient has no matching records", () => {
  assert.deepEqual(
    getSpecializedRecordPrograms([
      { id: 1, category: "General Consultation" },
    ]),
    [],
  );
});

test("adds one prenatal tab and counts every maternal visit", () => {
  const programs = getSpecializedRecordPrograms([
    { id: 1, category: "Maternal" },
    { id: 2, category: "Maternal / Prenatal", visit_type: "follow_up_visit" },
    { id: 3, category: "General Consultation" },
  ]);

  assert.equal(programs.length, 1);
  assert.equal(programs[0].key, "maternal");
  assert.equal(programs[0].label, "Prenatal / Maternal");
  assert.equal(programs[0].count, 2);
  assert.deepEqual(
    programs[0].records.map((record) => record.id),
    [1, 2],
  );
});

test("returns all applicable programs once and in the configured order", () => {
  const records = [
    { id: 1, category: "TB DOTS / TB Monitoring" },
    { id: 2, category: "Family Planning" },
    { id: 4, category: "Immunization" },
    { id: 5, category: "Maternal" },
    { id: 6, category: "Immunization" },
  ];

  const programs = getSpecializedRecordPrograms(records);

  assert.deepEqual(
    programs.map(({ key }) => key),
    SPECIALIZED_RECORD_PROGRAMS.map(({ key }) => key),
  );
  assert.deepEqual(
    programs.map(({ count }) => count),
    [2, 1, 1, 1],
  );
});

test("the Hypertension / Diabetic program is gone from specialized records", () => {
  assert.deepEqual(SPECIALIZED_RECORD_PROGRAMS.map(({ key }) => key), ["epi", "maternal", "familyPlanning", "tb"]);
  for (const name of [
    "isNcdRecord",
    "getHypertensionDiabeticData",
    "normalizeHypertensionDiabeticCondition",
    "formatHypertensionDiabeticCondition",
    "normalizeHypertensionDiabeticClientStatus",
    "formatHypertensionDiabeticClientStatus",
  ]) {
    assert.equal(programModule[name], undefined, name);
  }
  assert.deepEqual(getSpecializedRecordPrograms([{ id: 9, monitoring_data: { selectedPrograms: ["Hypertension"] } }]), []);
});

test("RHU Senior Citizen records keep their pre-existing label untouched", () => {
  assert.equal(getServiceTypeLabel({ category: "Senior Citizen" }), "Hypertension / Diabetic Monitoring");
});

test("isTbRecord detects TB by data even when the record lists other (or no) programs", () => {
  const tbCard = { diagnosis: { tbCaseNumber: "TB-1" } };
  assert.equal(isTbRecord({ category: "General Consultation", monitoring_data: { selectedPrograms: [] }, tb_data: tbCard }), true);
  assert.equal(isTbRecord({ category: "Maternal / Prenatal", monitoringData: { selectedPrograms: ["Maternal"] }, tbData: tbCard }), true);
  assert.equal(isTbRecord({ category: "TB DOTS / TB Monitoring", monitoring_data: { selectedPrograms: [] } }), true);
  assert.equal(isTbRecord({ category: "General Consultation", monitoring_data: { selectedPrograms: [] }, tb_data: {} }), false);
});

test("isTbRecord keeps the legacy TB program and category, and never matches record text", () => {
  assert.equal(isTbRecord({ monitoring_data: { selectedPrograms: ["TB"] } }), true);
  assert.equal(isTbRecord({ monitoring_data: { selectedPrograms: ["Maternal", "TB"] } }), true);
  assert.equal(isTbRecord({ category: "TB DOTS / TB Monitoring" }), true);
  assert.equal(isTbRecord({ category: "General Consultation", tbData: { diagnosis: { tbCaseNumber: "TB-1" } } }), true);
  assert.equal(isTbRecord({ category: "Tuberculosis follow-up" }), false);
  assert.equal(isTbRecord({ category: "General Consultation", diagnosis: "red dots on skin" }), false);
  assert.equal(isTbRecord({ category: "General Consultation", monitoring_data: { selectedPrograms: ["EPI"] } }), false);
  assert.equal(isTbRecord({ category: "General Consultation" }), false);
});

test("isTbRecord is the tbRecords detector, so text never puts a record in the TB tab", () => {
  const record = { id: 3, category: "Maternal", chiefComplaint: "Fever after football game" };
  assert.equal(isTbRecord(record), false);
  assert.deepEqual(getSpecializedRecordPrograms([record]).map(({ key }) => key), ["maternal"]);
});

test("a General Consultation record with only TB data lands in the TB specialized tab", () => {
  const record = { id: 9, category: "General Consultation", monitoring_data: { selectedPrograms: [] }, tb_data: { diagnosis: { tbCaseNumber: "TB-9" } } };
  const programs = getSpecializedRecordPrograms([record]);
  assert.deepEqual(programs.map(({ key, count }) => [key, count]), [["tb", 1]]);
  assert.equal(getSpecializedRecordType(record), "tb");
});

test("the TB service-type filter matches TB records by data, other types by label", () => {
  const tbByData = { category: "General Consultation", monitoring_data: { selectedPrograms: [] }, tb_data: { diagnosis: { tbCaseNumber: "TB-1" } } };
  assert.equal(matchesServiceTypeFilter("TB DOTS / TB Monitoring", tbByData, "General Consultation"), true);
  assert.equal(matchesServiceTypeFilter("TB DOTS / TB Monitoring", { category: "General Consultation" }, "General Consultation"), false);
  // With a linked record, TB is decided by isTbRecord alone - not by a TB-looking label.
  assert.equal(matchesServiceTypeFilter("TB DOTS / TB Monitoring", { category: "General Consultation", chiefComplaint: "dots" }, "TB DOTS / TB Monitoring"), false);
  assert.equal(matchesServiceTypeFilter("TB DOTS / TB Monitoring", undefined, "TB DOTS / TB Monitoring"), true);
  assert.equal(matchesServiceTypeFilter("TB DOTS / TB Monitoring", undefined, "Unclassified"), false);
  assert.equal(matchesServiceTypeFilter("General Consultation", tbByData, "General Consultation"), true);
  assert.equal(matchesServiceTypeFilter("family planning", {}, "Family Planning"), true);
  assert.equal(matchesServiceTypeFilter("Family Planning", {}, "Maternal / Prenatal"), false);
  assert.equal(matchesServiceTypeFilter("", {}, "anything"), true);
});

test("the Health Records service-type filter matches TB by isTbRecord, other types by service or classification", () => {
  const tbByData = { classification: "General Consultation", category: "General Consultation", monitoring_data: { selectedPrograms: [] }, tb_data: { diagnosis: { tbCaseNumber: "TB-1" } } };
  const textOnly = { classification: "General Consultation", category: "General Consultation", chiefComplaint: "red dots", concern: "red dots" };
  const maternal = { classification: "Maternal", category: "Maternal", monitoring_data: { selectedPrograms: ["Maternal"] } };
  const legacyTb = { classification: "TB DOTS / TB Monitoring", category: "TB DOTS / TB Monitoring" };

  assert.equal(matchesClassificationFilter("TB DOTS / TB Monitoring", tbByData), true);
  assert.equal(matchesClassificationFilter("TB DOTS / TB Monitoring", legacyTb), true);
  assert.equal(matchesClassificationFilter("TB DOTS / TB Monitoring", textOnly), false);
  assert.equal(matchesClassificationFilter("TB DOTS / TB Monitoring", maternal), false);
  assert.equal(matchesClassificationFilter("General Consultation", tbByData), true);
  assert.equal(matchesClassificationFilter("Maternal / Prenatal", maternal), true);
  assert.equal(matchesClassificationFilter("Family Planning", maternal), false);
  assert.equal(matchesClassificationFilter("", maternal), true);
});
