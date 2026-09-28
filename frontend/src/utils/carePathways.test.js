import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PATHWAYS,
  findOrphanedPathway,
  findStructuredDiagnosis,
  getPathwayDiagnoses,
  getStructuredDiagnosisNames,
  getSuggestedCarePathways,
} from "./carePathways.js";
import { DIAGNOSIS_SUGGESTIONS } from "./diagnoses.js";
import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

const dx = (name, id = name) => ({ id, name });

test("the combobox suggestions are the registry's structured diagnoses", () => {
  assert.deepEqual(getStructuredDiagnosisNames(), ["Hypertension", "Diabetes Mellitus"]);
  assert.deepEqual([...DIAGNOSIS_SUGGESTIONS], getStructuredDiagnosisNames());
});

test("every pathway selects a real consultation program", () => {
  for (const pathway of Object.values(CARE_PATHWAYS)) {
    assert.ok(Object.hasOwn(PROGRAM_CLASSIFICATIONS, pathway.programKey), pathway.key);
  }
});

test("structured matching is exact, ignoring only case and extra spaces", () => {
  assert.equal(findStructuredDiagnosis("  hypertension ")?.name, "Hypertension");
  assert.equal(findStructuredDiagnosis("DIABETES   MELLITUS")?.name, "Diabetes Mellitus");
  assert.equal(findStructuredDiagnosis("Hypertansion"), null);
  assert.equal(findStructuredDiagnosis("Essential hypertension"), null);
  assert.equal(findStructuredDiagnosis("Diabetes"), null);
  assert.equal(findStructuredDiagnosis(""), null);
});

test("one diagnosis makes NCD Monitoring available with just that condition", () => {
  assert.deepEqual(getSuggestedCarePathways([dx("hypertension"), dx("Asthma")]), [
    { pathwayKey: "NCD", label: "NCD Monitoring", programKey: "NCD", matchedDiagnoses: ["Hypertension"] },
  ]);
});

test("both NCD diagnoses give ONE pathway listing both, in registry order", () => {
  const suggestions = getSuggestedCarePathways([dx("Diabetes Mellitus"), dx("Hypertension")]);
  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0].matchedDiagnoses, ["Hypertension", "Diabetes Mellitus"]);
});

test("manual diagnoses make no pathway available", () => {
  assert.deepEqual(getSuggestedCarePathways([dx("Asthma"), dx("UTI")]), []);
  assert.deepEqual(getSuggestedCarePathways([]), []);
  assert.deepEqual(getPathwayDiagnoses("NCD", [dx("Pneumonia")]), []);
});

test("a started pathway losing its last diagnosis is reported, never otherwise", () => {
  const current = [dx("Hypertension"), dx("Asthma")];
  const withoutHtn = [dx("Asthma")];
  assert.equal(findOrphanedPathway(current, withoutHtn, ["NCD"])?.key, "NCD");
  // Not started: nothing to warn about.
  assert.equal(findOrphanedPathway(current, withoutHtn, []), null);
  // Another NCD diagnosis still backs it.
  assert.equal(
    findOrphanedPathway([...current, dx("Diabetes Mellitus")], [dx("Asthma"), dx("Diabetes Mellitus")], ["NCD"]),
    null,
  );
  // Renaming to a non-structured name orphans it too.
  assert.equal(findOrphanedPathway(current, [dx("Essential hypertension"), dx("Asthma")], ["NCD"])?.key, "NCD");
});
