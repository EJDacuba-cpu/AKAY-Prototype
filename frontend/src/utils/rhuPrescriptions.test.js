import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrescriptionId,
  emptyPrescription,
  normalizePrescriptions,
  prescriptionsForSave,
  prescriptionErrors,
  prescriptionReviewGroups,
  reconcilePrescriptionsForDiagnosisRemoval,
  formatPrescriptionLine,
  prescriptionsForDiagnosis,
  prescriptionsForServices,
  restorePrescriptions,
  visitPrescriptionStatus,
} from "./rhuPrescriptions.js";

const d1 = "diag-1";
const d2 = "diag-2";

const diagnoses = [
  { id: d1, name: "Hypertension" },
  { id: d2, name: "Diabetes mellitus" },
];

function complete(overrides = {}) {
  return {
    diagnosisIds: [d1],
    medicineName: "Losartan",
    strength: "50mg",
    dose: "1 tablet",
    route: "PO",
    frequency: "Once daily",
    duration: "30 days",
    ...overrides,
  };
}

test("createPrescriptionId returns a stable UUID and emptyPrescription keeps it", () => {
  const id = createPrescriptionId();
  assert.match(id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(createPrescriptionId(), id);
  const rx = emptyPrescription({
    id,
    diagnosisIds: [d1, d2],
    medicineName: "Losartan",
    strength: "50mg",
    dose: "1 tablet",
    route: "PO",
    frequency: "Once daily",
    duration: "30 days",
    authorizedQuantity: 30,
    authorizedUnit: "tablet",
  });
  const saved = normalizePrescriptions([rx]);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].diagnosisIds, [d1, d2]);
  assert.equal(saved[0].id, id);
  assert.equal(normalizePrescriptions([rx])[0].id, id);
});

test("one medication for two diagnoses stays a single order", () => {
  const id = createPrescriptionId();
  const rx = emptyPrescription({
    id,
    diagnosisIds: [d1, d1, d2, "  ", d2],
    medicineName: "  Losartan  ",
    strength: "50mg",
    dose: "1 tablet",
    route: "PO",
    frequency: "Once daily",
    duration: "30 days",
  });
  const [saved] = normalizePrescriptions([rx, rx]);
  assert.equal(normalizePrescriptions([rx]).length, 1);
  assert.deepEqual(saved.diagnosisIds, [d1, d2]);
  assert.equal(saved.medicineName, "Losartan");
  assert.equal(saved.source, "itr");
  const linked = prescriptionsForDiagnosis([rx], d1);
  const other = prescriptionsForDiagnosis([rx], d2);
  const none = prescriptionsForDiagnosis([rx], "diag-missing");
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, id);
  assert.equal(other.length, 1);
  assert.equal(other[0].id, id);
  assert.deepEqual(none, []);
});

test("emptyPrescription defaults source to itr and does not invent a quantity", () => {
  const blank = emptyPrescription();
  assert.match(blank.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(blank.diagnosisIds, []);
  assert.equal(blank.source, "itr");
  assert.equal(blank.tbCaseId, "");
  assert.equal(blank.authorizedQuantity, null);
  assert.equal(blank.authorizedUnit, "");
  assert.equal(blank.instructions, "");

  const rx = emptyPrescription(complete({
    id: "rx-text",
    instructions: "Dispense 21 capsules",
    dose: "1 capsule",
    frequency: "TID",
    duration: "7 days",
  }));
  assert.equal(rx.authorizedQuantity, null);
  assert.equal(rx.authorizedUnit, "");
  assert.equal(rx.source, "itr");
  const saved = prescriptionsForSave([rx]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "rx-text");
  assert.equal(Object.hasOwn(saved[0], "authorizedQuantity"), false);
  assert.equal(Object.hasOwn(saved[0], "authorizedUnit"), false);
  assert.equal(Object.hasOwn(saved[0], "authorization"), false);
  assert.equal(saved[0].source, "itr");
});

test("prescriptionErrors reports required fields by prescription id", () => {
  const id = "rx-blank";
  const errors = prescriptionErrors(
    [emptyPrescription({ id, diagnosisIds: [] })],
    diagnoses,
  );
  for (const field of ["diagnosisIds", "medicineName", "strength", "dose", "route", "frequency", "duration"]) {
    assert.equal(typeof errors[`prescriptions.${id}.${field}`], "string", field);
  }
  assert.equal(Object.hasOwn(errors, `prescriptions.${id}.instructions`), false);
  assert.equal(Object.hasOwn(errors, `prescriptions.${id}.authorizedQuantity`), false);
  const ready = prescriptionErrors(
    [emptyPrescription(complete({ id: "rx-ready" }))],
    diagnoses,
  );
  assert.deepEqual(ready, {});
});

test("serviceKeys link satisfies the diagnosis-or-service rule and drafts keep them", () => {
  const id = "rx-service";
  const serviceOnly = emptyPrescription(complete({
    id,
    diagnosisIds: [],
    serviceKeys: ["Maternal", "EPI", "Family Planning"],
  }));
  assert.deepEqual(serviceOnly.serviceKeys, ["Maternal", "EPI", "Family Planning"]);
  assert.deepEqual(prescriptionErrors([serviceOnly], diagnoses), {});
  const saved = prescriptionsForSave([serviceOnly]);
  assert.deepEqual(saved[0].diagnosisIds, []);
  assert.deepEqual(saved[0].serviceKeys, ["Maternal", "EPI", "Family Planning"]);
  assert.equal(prescriptionsForServices([serviceOnly]).length, 1);
  assert.equal(prescriptionsForDiagnosis([serviceOnly], d1).length, 0);

  const invalid = prescriptionErrors(
    [emptyPrescription(complete({ id: "rx-bad-service", diagnosisIds: [], serviceKeys: ["Unknown"] }))],
    diagnoses,
  );
  assert.equal(typeof invalid["prescriptions.rx-bad-service.diagnosisIds"], "string");
  assert.equal(typeof invalid["prescriptions.rx-bad-service.serviceKeys"], "string");

  const groups = prescriptionReviewGroups([serviceOnly], diagnoses);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Selected Health Services — Prescription");
  assert.equal(groups[0].orders[0].id, id);
});

test("authorized quantity and unit are a pair and are never parsed from instructions", () => {
  const id = "rx-qty";
  const missingUnit = prescriptionErrors(
    [emptyPrescription(complete({ id, authorizedQuantity: 30 }))],
    diagnoses,
  );
  assert.equal(typeof missingUnit[`prescriptions.${id}.authorizedUnit`], "string");
  assert.equal(Object.hasOwn(missingUnit, `prescriptions.${id}.authorizedQuantity`), false);

  const missingQty = prescriptionErrors(
    [emptyPrescription(complete({ id, authorizedUnit: "tablet" }))],
    diagnoses,
  );
  assert.equal(typeof missingQty[`prescriptions.${id}.authorizedQuantity`], "string");

  const zero = prescriptionErrors(
    [emptyPrescription(complete({ id, authorizedQuantity: 0, authorizedUnit: "tablet" }))],
    diagnoses,
  );
  assert.equal(typeof zero[`prescriptions.${id}.authorizedQuantity`], "string");

  const prose = {
    ...complete({ id, instructions: "Take 30 tablets once daily for 30 days" }),
    authorizedQuantity: "30 tablets",
    authorizedUnit: "",
  };
  const proseErrors = prescriptionErrors([prose], diagnoses);
  assert.equal(typeof proseErrors[`prescriptions.${id}.authorizedQuantity`], "string");
  const saved = prescriptionsForSave([prose]);
  assert.equal(Object.hasOwn(saved[0], "authorizedQuantity"), false);
  assert.equal(saved[0].instructions, "Take 30 tablets once daily for 30 days");

  const paired = prescriptionsForSave([
    emptyPrescription(complete({ id, authorizedQuantity: "30", authorizedUnit: " tablet " })),
  ]);
  assert.equal(paired[0].authorizedQuantity, 30);
  assert.equal(paired[0].authorizedUnit, "tablet");
  assert.deepEqual(
    prescriptionErrors([
      emptyPrescription(complete({ id, authorizedQuantity: 30, authorizedUnit: "tablet" })),
    ], diagnoses),
    {},
  );
});

test("diagnosis removal blocks a sole link and does not drop the order", () => {
  const rx = emptyPrescription(complete({
    id: "rx-metformin",
    medicineName: "Metformin",
    strength: "500mg",
    dose: "1 tablet",
    frequency: "BID",
  }));
  const result = reconcilePrescriptionsForDiagnosisRemoval([rx], d1);
  assert.equal(result.blocked, true);
  assert.ok(result.error);
  assert.equal(result.prescriptions.length, 1);
  assert.equal(result.prescriptions[0].id, "rx-metformin");
  assert.deepEqual(result.prescriptions[0].diagnosisIds, [d1]);
  assert.equal(result.prescriptions[0].medicineName, "Metformin");
});

test("diagnosis removal relinks a multi-diagnosis order and keeps every order", () => {
  const shared = emptyPrescription(complete({
    id: "rx-shared",
    diagnosisIds: [d1, d2],
  }));
  const other = emptyPrescription(complete({
    id: "rx-other",
    diagnosisIds: [d2],
    medicineName: "Aspirin",
    strength: "80mg",
  }));
  const result = reconcilePrescriptionsForDiagnosisRemoval([shared, other], d1);
  assert.equal(result.blocked, false);
  assert.equal(result.error, null);
  assert.equal(result.prescriptions.length, 2);
  assert.equal(result.prescriptions[0].id, "rx-shared");
  assert.deepEqual(result.prescriptions[0].diagnosisIds, [d2]);
  assert.equal(result.prescriptions[0].medicineName, "Losartan");
  assert.deepEqual(result.prescriptions[1].diagnosisIds, [d2]);
  assert.equal(result.prescriptions[1].id, "rx-other");
});

test("a blocked removal does not relink other orders", () => {
  const sole = emptyPrescription(complete({ id: "rx-sole", diagnosisIds: [d1], medicineName: "Metformin" }));
  const shared = emptyPrescription(complete({ id: "rx-shared", diagnosisIds: [d1, d2] }));
  const result = reconcilePrescriptionsForDiagnosisRemoval([sole, shared], d1);
  assert.equal(result.blocked, true);
  assert.equal(result.prescriptions.length, 2);
  assert.deepEqual(result.prescriptions[0].diagnosisIds, [d1]);
  assert.deepEqual(result.prescriptions[1].diagnosisIds, [d1, d2]);
});

test("normalize keeps every order, including past the 50-order maximum", () => {
  const list = Array.from({ length: 51 }, (_, index) => (
    emptyPrescription(complete({ id: `rx-${index}`, diagnosisIds: Array.from({ length: 21 }, (__, n) => `diag-${n}`) }))
  ));
  const saved = normalizePrescriptions(list);
  assert.equal(saved.length, 51);
  assert.equal(saved[50].id, "rx-50");
  assert.equal(saved[0].diagnosisIds.length, 21);
  assert.equal(typeof prescriptionErrors(list, diagnoses).prescriptions, "string");
});

test("normalize keeps incomplete orders and does not invent TB case ids", () => {
  const partial = { id: "rx-partial", diagnosisIds: [d1], medicineName: "", instructions: "" };
  const saved = normalizePrescriptions([partial, null, "nope"]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "rx-partial");
  assert.deepEqual(saved[0].diagnosisIds, [d1]);
  assert.equal(saved[0].source, "itr");

  const tbNamed = normalizePrescriptions([{
    id: "rx-tb",
    diagnosisIds: [d1],
    medicineName: "HRZE",
    source: "guessed-from-name",
    diagnosisName: "Tuberculosis",
    instructions: "TB case 44",
  }]);
  assert.equal(tbNamed[0].source, "guessed-from-name");
  assert.equal(tbNamed[0].tbCaseId, "");
  assert.equal(Object.hasOwn(tbNamed[0], "diagnosisName"), false);

  const refErrors = prescriptionErrors([
    emptyPrescription(complete({ id: "rx-ref", source: "tb_form4b_ref", tbCaseId: "" })),
  ], diagnoses);
  assert.equal(typeof refErrors["prescriptions.rx-ref.tbCaseId"], "string");

  const linked = prescriptionErrors([
    emptyPrescription(complete({ id: "rx-ref", source: "tb_form4b_ref", tbCaseId: "case-9" })),
  ], diagnoses);
  assert.deepEqual(linked, {});
  assert.equal(
    prescriptionsForSave([
      emptyPrescription(complete({ id: "rx-ref", source: "tb_form4b_ref", tbCaseId: "case-9" })),
    ])[0].tbCaseId,
    "case-9",
  );
});

test("normalize keeps invalid quantity and illegal source visible to prescriptionErrors", () => {
  const qtyErrors = prescriptionErrors(
    normalizePrescriptions([complete({
      id: "rx-zero",
      authorizedQuantity: 0,
      authorizedUnit: "",
    })]),
    diagnoses,
  );
  assert.equal(typeof qtyErrors["prescriptions.rx-zero.authorizedQuantity"], "string");

  const sourceErrors = prescriptionErrors(
    normalizePrescriptions([complete({
      id: "rx-guess",
      source: "guessed-from-name",
    })]),
    diagnoses,
  );
  assert.equal(typeof sourceErrors["prescriptions.rx-guess.source"], "string");
  assert.equal(
    normalizePrescriptions([complete({ id: "rx-guess", source: "guessed-from-name" })])[0].source,
    "guessed-from-name",
  );
  assert.equal(
    normalizePrescriptions([complete({ id: "rx-zero", authorizedQuantity: 0, authorizedUnit: "" })])[0].authorizedQuantity,
    0,
  );
});

test("prescriptionErrors reject diagnosis ids that are not on the visit", () => {
  const errors = prescriptionErrors(
    [emptyPrescription(complete({ id: "rx-unknown", diagnosisIds: ["missing"] }))],
    diagnoses,
  );
  assert.equal(typeof errors["prescriptions.rx-unknown.diagnosisIds"], "string");
});

test("formatPrescriptionLine joins clinical fields and shows qty only when authorized", () => {
  const tracked = formatPrescriptionLine(emptyPrescription(complete({
    authorizedQuantity: 30,
    authorizedUnit: "tablet",
  })));
  assert.equal(tracked, "Losartan 50mg · 1 tablet · PO · Once daily · 30 days · 30 tablet");

  const untracked = formatPrescriptionLine(emptyPrescription(complete({
    medicineName: "Amoxicillin",
    strength: "500mg",
    dose: "1 capsule",
    frequency: "TID",
    duration: "7 days",
    instructions: "Dispense 21 capsules",
  })));
  assert.equal(
    untracked,
    "Amoxicillin 500mg · 1 capsule · PO · TID · 7 days · Dispense 21 capsules",
  );
});

test("visitPrescriptionStatus rolls up per-order fulfillment without inventing remaining qty", () => {
  const tracked = emptyPrescription(complete({ id: "rx-tracked", authorizedQuantity: 30, authorizedUnit: "tablet" }));
  const open = emptyPrescription(complete({ id: "rx-open", diagnosisIds: [d2], medicineName: "Metformin" }));
  const untracked = emptyPrescription(complete({ id: "rx-free", instructions: "Dispense 21 capsules" }));

  const pending = visitPrescriptionStatus([tracked, open], []);
  assert.equal(pending.status, "Pending");
  assert.equal(pending.orders[0].status, "Pending");
  assert.equal(pending.orders[0].remaining, 30);
  assert.equal(pending.orders[1].remaining, null);

  const partial = visitPrescriptionStatus([tracked], [
    { prescriptionId: "rx-tracked", quantity: 10 },
  ]);
  assert.equal(partial.status, "Partially Dispensed");
  assert.equal(partial.orders[0].releasedQuantity, 10);
  assert.equal(partial.orders[0].remaining, 20);

  const done = visitPrescriptionStatus([tracked], [
    { prescription_id: "rx-tracked", quantity: 10 },
    { prescription_id: "rx-tracked", qty: 20 },
  ]);
  assert.equal(done.status, "Dispensed");
  assert.equal(done.orders[0].remaining, 0);

  const firstRelease = visitPrescriptionStatus([untracked], [
    { prescriptionId: "rx-free", quantity: 21 },
  ]);
  assert.equal(firstRelease.status, "Dispensed");
  assert.equal(firstRelease.orders[0].remaining, null);
  assert.equal(firstRelease.orders[0].releasedQuantity, 21);

  const unavailable = visitPrescriptionStatus([tracked], [
    { prescriptionId: "rx-tracked", status: "unavailable", quantity: 30 },
  ]);
  assert.equal(unavailable.status, "Unavailable");
  assert.equal(unavailable.orders[0].releasedQuantity, 0);
  assert.equal(unavailable.orders[0].remaining, 30);

  const mixed = visitPrescriptionStatus([tracked, open], [
    { prescriptionId: "rx-tracked", quantity: 30 },
  ]);
  assert.equal(mixed.status, "Partially Dispensed");
});

test("restorePrescriptions keeps ids and multi-diagnosis links without reading legacy text", () => {
  const restored = restorePrescriptions({
    prescriptionText: "Losartan 50mg once daily",
    prescriptions: [complete({ id: "rx-shared", diagnosisIds: [d1, d2], medicineName: "Losartan" })],
  });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, "rx-shared");
  assert.deepEqual(restored[0].diagnosisIds, [d1, d2]);
  assert.equal(restored[0].medicineName, "Losartan");
  const saved = prescriptionsForSave(restored);
  assert.equal(saved[0].id, "rx-shared");
  assert.deepEqual(saved[0].diagnosisIds, [d1, d2]);

  const fromMonitoring = restorePrescriptions({
    monitoring_data: {
      prescriptions: [complete({ id: "rx-mon", diagnosisIds: [d2, d1], medicineName: "Metformin" })],
    },
  });
  assert.equal(fromMonitoring[0].id, "rx-mon");
  assert.deepEqual(fromMonitoring[0].diagnosisIds, [d2, d1]);
  assert.equal(fromMonitoring[0].medicineName, "Metformin");
  assert.deepEqual(restorePrescriptions({ prescriptionText: "only legacy" }), []);
  assert.deepEqual(restorePrescriptions(null), []);
});

test("prescriptionReviewGroups repeats one order under each linked diagnosis", () => {
  const groups = prescriptionReviewGroups(
    [complete({ id: "rx-shared", diagnosisIds: [d1, d2], medicineName: "Losartan", strength: "50mg" })],
    diagnoses,
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Hypertension — Prescription");
  assert.equal(groups[1].label, "Diabetes mellitus — Prescription");
  assert.equal(groups[0].orders[0].id, "rx-shared");
  assert.equal(groups[1].orders[0].id, "rx-shared");
  assert.deepEqual(groups[0].orders[0].diagnosisIds, [d1, d2]);
  assert.match(formatPrescriptionLine(groups[0].orders[0]), /Losartan/);
  assert.deepEqual(prescriptionReviewGroups([], diagnoses), []);
});

test("non-arrays are empty and a client authorization is not saved", () => {
  assert.deepEqual(normalizePrescriptions(null), []);
  assert.deepEqual(prescriptionsForSave(undefined), []);
  assert.deepEqual(prescriptionErrors(null, null), {});
  const cleared = reconcilePrescriptionsForDiagnosisRemoval(null, d1);
  assert.equal(cleared.blocked, false);
  assert.equal(cleared.error, null);
  assert.deepEqual(cleared.prescriptions, []);

  const saved = prescriptionsForSave([
    emptyPrescription(complete({
      id: "rx-auth",
      authorization: { physicianId: 1, prescriptionHash: "forged" },
    })),
  ]);
  assert.equal(Object.hasOwn(saved[0], "authorization"), false);
  assert.equal(saved[0].id, "rx-auth");
});
