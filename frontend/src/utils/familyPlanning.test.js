import assert from "node:assert/strict";
import test from "node:test";

import { formatFpMethodLabel, resolveHistoricalFpMethod } from "./familyPlanning.js";

test("formatFpMethodLabel keeps Other text", () => {
  assert.equal(formatFpMethodLabel(""), "");
  assert.equal(formatFpMethodLabel("CON — Condom"), "CON — Condom");
  assert.equal(formatFpMethodLabel("Other", "Calendar method"), "Calendar method");
});

test("resolveHistoricalFpMethod prefers Patient History over prenatal leftovers", () => {
  const resolved = resolveHistoricalFpMethod({
    background: { obstetric: { previousFpMethod: "Pills-COC — Combined Oral Contraceptives" } },
    maternalData: { previousFpMethodUsed: "CON — Condom" },
    records: [{ maternalData: { previousFpMethodUsed: "INJ — DMPA or CIC (Injectable)" } }],
  });
  assert.equal(resolved.method, "Pills-COC — Combined Oral Contraceptives");
  assert.equal(resolved.label, "Pills-COC — Combined Oral Contraceptives");
});

test("resolveHistoricalFpMethod falls back to the latest record without writing history", () => {
  const resolved = resolveHistoricalFpMethod({
    background: { obstetric: { menarcheAge: 13 } },
    maternalData: {},
    records: [
      { maternalData: { previousFpMethodUsed: "CON — Condom" } },
      { familyPlanningData: { previousMethod: "IMP — Single rod sub-dermal Implant" } },
    ],
  });
  assert.equal(resolved.method, "IMP — Single rod sub-dermal Implant");
});
