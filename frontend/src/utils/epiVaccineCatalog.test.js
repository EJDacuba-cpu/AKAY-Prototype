import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVaccineDoseCatalog,
  vaccineEntryConflicts,
} from "./epiVaccineCatalog.js";

test("BHC dose-labeled options group into Vaccine → Dose with preserved stored labels", () => {
  const catalog = buildVaccineDoseCatalog([
    "Newborn Screening",
    "CPAB",
    "BCG",
    "HEPA B",
    "OPV 1",
    "OPV 2",
    "PENTA 1",
  ]);
  assert.ok(!catalog.some((family) => family.key === "CPAB"));
  assert.ok(!catalog.some((family) => family.key.includes("NEWBORN")));
  const opv = catalog.find((family) => family.key === "OPV");
  assert.deepEqual(opv.doses.map((dose) => dose.storedLabel), ["OPV 1", "OPV 2"]);
  const bcg = catalog.find((family) => family.key === "BCG");
  assert.equal(bcg.doses[0].value, "birth");
  assert.equal(bcg.doses[0].storedLabel, "BCG");
});

test("RHU family-only options expand to numbered doses with canonical stored labels", () => {
  const catalog = buildVaccineDoseCatalog([
    "BCG",
    "Hepatitis B",
    "Pentavalent",
    "OPV",
    "MMR",
  ]);
  const penta = catalog.find((family) => family.key === "PENTAVALENT" || family.key === "PENTA");
  assert.ok(penta);
  assert.deepEqual(penta.doses.map((dose) => dose.storedLabel), ["PENTA 1", "PENTA 2", "PENTA 3"]);
  const mcv = catalog.find((family) => family.key === "MCV" || family.key === "MMR");
  assert.ok(mcv);
  assert.deepEqual(mcv.doses.map((dose) => dose.storedLabel), ["MCV 1", "MCV 2"]);
});

test("vaccine entry conflicts reject duplicates and missing dates", () => {
  assert.match(
    vaccineEntryConflicts({ storedLabel: "OPV 1", dateGiven: "", entries: [] }),
    /date/i,
  );
  assert.match(
    vaccineEntryConflicts({
      storedLabel: "OPV 1",
      dateGiven: "2026-01-02",
      entries: [{ vaccineName: "OPV 1" }],
    }),
    /already/i,
  );
  assert.equal(
    vaccineEntryConflicts({
      storedLabel: "OPV 2",
      dateGiven: "2026-01-02",
      entries: [{ vaccineName: "OPV 1" }],
    }),
    "",
  );
});
