import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFpClientType,
  formatFpClientTypeLabel,
  formatFpMethodLabel,
  getPreviousMethodOptions,
  getInitialVisitFpMethod,
  isFpNewAcceptor,
  normalizeFpClientTypeCode,
  resolveHistoricalFpMethod,
} from "./familyPlanning.js";

test("formatFpMethodLabel keeps Other text", () => {
  assert.equal(formatFpMethodLabel(""), "");
  assert.equal(formatFpMethodLabel("CON — Condom"), "CON — Condom");
  assert.equal(formatFpMethodLabel("Other", "Calendar method"), "Calendar method");
});

test("normalizeFpClientTypeCode matches labels and codes without free-text guessing", () => {
  assert.equal(normalizeFpClientTypeCode("NA — New Acceptors"), "NA");
  assert.equal(normalizeFpClientTypeCode("CU-CM — Changing Method"), "CU-CM");
  assert.equal(normalizeFpClientTypeCode("cu-rs"), "CU-RS");
  assert.equal(normalizeFpClientTypeCode("brand new acceptor client"), "");
  assert.equal(isFpNewAcceptor("NA — New Acceptors"), true);
  assert.equal(isFpNewAcceptor("CU — Current Users"), false);
  assert.equal(classifyFpClientType("OA — Other Acceptors"), "other_acceptors");
  assert.equal(classifyFpClientType("mystery"), "unknown");
  assert.equal(
    formatFpClientTypeLabel("CU-CC"),
    "CU-CC — Changing Clinic",
  );
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

test("Previous Method offers only applicable codes and the two shared choices", () => {
  const shared = ["None — No previous contraceptive method", "Not recorded — Previous method unknown"];
  for (const [sex, codes] of [
    [" M ", ["MSTR/NSV", "CON"]],
    ["Male", ["MSTR/NSV", "CON"]],
    ["Female", ["FSTR/BTL", "Pills-POP", "Pills-COC", "INJ", "IMP", "IUD-I",
      "IUD-PP", "NFP-LAM", "NFP-BBT", "NFP-CMM", "NFP-STM", "NFP-SDM"]],
    ["Unspecified", []],
    [undefined, []],
  ]) {
    const options = getPreviousMethodOptions({ sex });
    assert.deepEqual(options.slice(0, -2).map((label) => label.split(" ")[0]), codes);
    assert.deepEqual(options.slice(-2), shared);
  }
  assert.deepEqual(getPreviousMethodOptions({ sex: "F" }), getPreviousMethodOptions({ sex: "Female" }));
});

test("follow-up Previous Method comes from the linked initial visit", () => {
  const records = [
    { id: "10", family_planning_data: { method_used: "CON", previous_method: "None" } },
    { id: "20", parentHealthRecordId: "10", familyPlanningData: { methodUsed: "NSV" } },
    { id: "30", familyPlanningData: { methodUsed: "Unrelated method" } },
    { id: "40", parentHealthRecordId: "40" },
  ];

  assert.equal(getInitialVisitFpMethod(records, 10), "CON");
  assert.equal(getInitialVisitFpMethod(records, 20), "CON");
  assert.equal(getInitialVisitFpMethod(records), "");
  assert.equal(getInitialVisitFpMethod(records, 99), "");
  assert.equal(getInitialVisitFpMethod(records, 40), "");
});
