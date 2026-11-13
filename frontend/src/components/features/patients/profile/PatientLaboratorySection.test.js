import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test("Care & Programs mounts laboratory section between Care Tracking and Medicines Dispensed", () => {
  const source = readFileSync(new URL("./CareAndProgramsTab.jsx", import.meta.url), "utf8");
  assert.match(source, /PatientLaboratorySection/);
  const care = source.indexOf("Care Tracking");
  const lab = source.indexOf("<PatientLaboratorySection");
  const meds = source.indexOf("<DispensedMedicinesSection");
  assert.ok(care > -1 && lab > care && meds > lab);
});

test("BHC Care & Programs keeps RHU shared clinical and omits Form 4B treatment cards", () => {
  const source = readFileSync(
    resolve("src/pages/bhc/PatientDetails.jsx"),
    "utf8",
  );
  assert.match(source, /RhuSharedClinicalSection/);
  assert.match(source, /CareAndProgramsTab/);
  assert.doesNotMatch(source, /PatientTbCasesPanel/);
  assert.doesNotMatch(source, /Shared TB treatment cards/);
});

test("RHU Health Record Details no longer mounts LaboratoryRecordPanel", () => {
  const source = readFileSync(
    resolve("src/pages/rhu/RHURecordDetails.jsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /LaboratoryRecordPanel/);
  assert.match(source, /getLaboratoryTests/);
  assert.match(source, /laboratoryEntries/);
});

const cacheDir = mkdtempSync(join(tmpdir(), "akay-patient-lab-"));
after(() => {
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});
