import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveEpiUsagesFromVaccineEntries,
  legacyServiceOnlyPrescriptions,
  normalizeServiceUsages,
  serviceUsagesForSave,
  serviceUsageErrors,
} from "./serviceUsages.js";

test("deriveEpiUsagesFromVaccineEntries uses date-given vaccines only", () => {
  const rows = deriveEpiUsagesFromVaccineEntries([
    { vaccineName: "PENTA", dose: "2", dateGiven: "2026-11-14" },
    { vaccineName: "BCG", dose: "Birth dose", dateGiven: "" },
    { vaccineName: "Newborn Screening", dose: "Done", dateGiven: "2026-11-14" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemDescription, "PENTA 2");
  assert.equal(rows[0].unit, "dose");
  assert.equal(rows[0].derived, true);
});

test("serviceUsagesForSave keeps only complete manual rows", () => {
  const saved = serviceUsagesForSave([
    { id: "a", serviceProgram: "Maternal", itemDescription: "Iron", quantity: 2, unit: "tablets" },
    { id: "b", serviceProgram: "Nutrition", itemDescription: "", quantity: 1, unit: "sachet" },
    { id: "c", serviceProgram: "EPI", itemDescription: "PENTA", quantity: 1, unit: "dose" },
  ]);
  assert.deepEqual(saved, [
    { id: "a", serviceProgram: "Maternal", itemDescription: "Iron", quantity: 2, unit: "tablets" },
  ]);
});

test("serviceUsageErrors flags incomplete rows and unselected programs", () => {
  const errors = serviceUsageErrors(
    [{ id: "x", serviceProgram: "Nutrition", itemDescription: "", quantity: 0, unit: "" }],
    ["Maternal"],
  );
  assert.match(errors["serviceUsages.x.serviceProgram"], /not selected/);
  assert.match(errors["serviceUsages.x.itemDescription"], /item/);
  assert.match(errors["serviceUsages.x.quantity"], /Quantity/);
  assert.match(errors["serviceUsages.x.unit"], /unit/);
});

test("legacyServiceOnlyPrescriptions finds serviceKeys-only orders", () => {
  const legacy = legacyServiceOnlyPrescriptions([
    { id: "1", diagnosisIds: ["dx"], serviceKeys: ["Maternal"], medicineName: "A" },
    { id: "2", diagnosisIds: [], serviceKeys: ["EPI"], medicineName: "B" },
    { id: "3", diagnosisIds: [], serviceKeys: [], medicineName: "C" },
  ]);
  assert.deepEqual(legacy.map((rx) => rx.id), ["2"]);
});

test("normalizeServiceUsages drops EPI fabricated rows", () => {
  assert.deepEqual(
    normalizeServiceUsages([{ id: "e", serviceProgram: "EPI", itemDescription: "PENTA", quantity: 1, unit: "dose" }]),
    [],
  );
});
