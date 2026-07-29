import assert from "node:assert/strict";
import test from "node:test";

import {
  getSpecializedRecordPrograms,
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
    { id: 3, category: "Hypertension / Diabetic Monitoring" },
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
    [2, 1, 1, 1, 1],
  );
});
