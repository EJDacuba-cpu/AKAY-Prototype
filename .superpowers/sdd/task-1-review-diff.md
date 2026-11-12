# Task 1 Review Package (post-fix)
Base: eef0bbe274c5355fed58398ec8d3296ccda2cd9d
Head: WORKING_TREE
Mode: uncommitted

## FILE: frontend/src/utils/rhuPrescriptions.js
```js
/**
 * Visit-level structured prescriptions for an RHU ITR
 * (`monitoring_data.prescriptions`). One medicine shared by two diagnoses is
 * one order with two `diagnosisIds`. Quantity is recorded only when the
 * physician enters it — dose, frequency, duration, and instructions are never
 * parsed into an authorized total.
 *
 * Field errors use `prescriptions.{id}.{field}`. Missing `source` defaults to `itr`;
 * an explicit source outside that set is kept. A present invalid
 * `authorizedQuantity` is kept for validation and omitted on save.
 * `tb_form4b_ref` points at a registered case; this module does not invent
 * `tbCaseId` from a diagnosis name. Authorization is written by the server.
 */

const PRESCRIPTION_SOURCES = new Set(["itr", "tb_form4b_ref"]);

const LIMITS = {
  count: 50,
  id: 64,
  medicineName: 255,
  strength: 100,
  dose: 100,
  route: 50,
  frequency: 100,
  duration: 100,
  instructions: 2000,
  authorizedUnit: 50,
  tbCaseId: 64,
};

const REQUIRED_FIELDS = [
  ["medicineName", "Enter the medicine name."],
  ["strength", "Enter the strength."],
  ["dose", "Enter the dose."],
  ["route", "Enter the route."],
  ["frequency", "Enter the frequency."],
  ["duration", "Enter the duration."],
];

const text = (value) => String(value ?? "").trim();

const clip = (value, max) => text(value).slice(0, max);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createPrescriptionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function diagnosisIdsOf(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of value) {
    const id = clip(item, LIMITS.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * An authorized quantity counts only when this field itself is a whole number
 * of at least 1 (or a digit string from the form). Anything else was not
 * authorized, including prose such as "30 tablets".
 */
function quantityState(value) {
  if (value == null || value === "") return { present: false, valid: false, value: null };
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return { present: true, valid: true, value };
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed >= 1) return { present: true, valid: true, value: parsed };
  }
  return { present: true, valid: false, value: null };
}

function sourceOf(value) {
  if (value == null || value === "") return "itr";
  if (PRESCRIPTION_SOURCES.has(value)) return value;
  return value;
}

function canonical(item) {
  const quantity = quantityState(item?.authorizedQuantity);
  return {
    id: clip(item?.id, LIMITS.id) || createPrescriptionId(),
    diagnosisIds: diagnosisIdsOf(item?.diagnosisIds),
    medicineName: clip(item?.medicineName, LIMITS.medicineName),
    strength: clip(item?.strength, LIMITS.strength),
    dose: clip(item?.dose, LIMITS.dose),
    route: clip(item?.route, LIMITS.route),
    frequency: clip(item?.frequency, LIMITS.frequency),
    duration: clip(item?.duration, LIMITS.duration),
    instructions: clip(item?.instructions, LIMITS.instructions),
    authorizedQuantity: quantity.valid
      ? quantity.value
      : quantity.present
        ? item.authorizedQuantity
        : null,
    authorizedUnit: clip(item?.authorizedUnit, LIMITS.authorizedUnit),
    source: sourceOf(item?.source),
    tbCaseId: clip(item?.tbCaseId, LIMITS.tbCaseId),
  };
}

export function emptyPrescription(partial = {}) {
  return canonical(partial);
}

export function normalizePrescriptions(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord).map(canonical);
}

export function prescriptionsForSave(list) {
  return normalizePrescriptions(list).map((rx) => {
    const saved = {
      id: rx.id,
      diagnosisIds: rx.diagnosisIds,
      medicineName: rx.medicineName,
      strength: rx.strength,
      dose: rx.dose,
      route: rx.route,
      frequency: rx.frequency,
      duration: rx.duration,
      instructions: rx.instructions,
      source: rx.source,
    };
    if (rx.tbCaseId || rx.source === "tb_form4b_ref") saved.tbCaseId = rx.tbCaseId;
    const quantity = quantityState(rx.authorizedQuantity);
    if (quantity.valid) {
      saved.authorizedQuantity = quantity.value;
      saved.authorizedUnit = rx.authorizedUnit;
    } else if (rx.authorizedUnit) {
      saved.authorizedUnit = rx.authorizedUnit;
    }
    return saved;
  });
}

export function prescriptionErrors(list, diagnoses) {
  const errors = {};
  if (!Array.isArray(list)) return errors;
  if (list.length > LIMITS.count) errors.prescriptions = "Add at most 50 prescriptions.";

  const known = new Set(
    (Array.isArray(diagnoses) ? diagnoses : []).map((entry) => text(entry?.id)).filter(Boolean),
  );

  list.forEach((item, index) => {
    if (!isRecord(item)) return;
    const id = text(item.id);
    const key = `prescriptions.${id || index}`;
    if (!id) errors[`${key}.id`] = "Prescription id is required.";

    const diagnosisIds = diagnosisIdsOf(item.diagnosisIds);
    if (diagnosisIds.length === 0) {
      errors[`${key}.diagnosisIds`] = "Link this prescription to at least one diagnosis.";
    } else if (diagnosisIds.some((diagnosisId) => !known.has(diagnosisId))) {
      errors[`${key}.diagnosisIds`] = "Link this prescription only to diagnoses on this visit.";
    }

    for (const [field, message] of REQUIRED_FIELDS) {
      const value = text(item[field]);
      if (!value) errors[`${key}.${field}`] = message;
      else if (value.length > LIMITS[field]) errors[`${key}.${field}`] = `Use up to ${LIMITS[field]} characters.`;
    }

    const instructions = text(item.instructions);
    if (instructions.length > LIMITS.instructions) {
      errors[`${key}.instructions`] = `Use up to ${LIMITS.instructions} characters.`;
    }

    const quantity = quantityState(item.authorizedQuantity);
    const unit = text(item.authorizedUnit);
    if (quantity.present && !quantity.valid) {
      errors[`${key}.authorizedQuantity`] = "Authorized quantity must be a whole number of at least 1.";
    } else if (!quantity.present && unit) {
      errors[`${key}.authorizedQuantity`] = "Enter an authorized quantity of at least 1, or clear the unit.";
    }
    if (quantity.present && quantity.valid && !unit) {
      errors[`${key}.authorizedUnit`] = "Enter the unit for the authorized quantity.";
    } else if (unit.length > LIMITS.authorizedUnit) {
      errors[`${key}.authorizedUnit`] = `Use up to ${LIMITS.authorizedUnit} characters.`;
    }

    const rawSource = item.source == null || item.source === "" ? "itr" : item.source;
    if (!PRESCRIPTION_SOURCES.has(rawSource)) {
      errors[`${key}.source`] = "Choose a valid prescription source.";
    }
    if (rawSource === "tb_form4b_ref" && !text(item.tbCaseId)) {
      errors[`${key}.tbCaseId`] = "Link the registered TB case.";
    }
  });

  return errors;
}

export function reconcilePrescriptionsForDiagnosisRemoval(prescriptions, diagnosisId) {
  const removedId = text(diagnosisId);
  const list = Array.isArray(prescriptions) ? prescriptions.filter(isRecord) : [];
  if (!removedId) return { blocked: false, error: null, prescriptions: list.slice() };

  const orphans = list.filter((rx) => {
    const ids = diagnosisIdsOf(rx.diagnosisIds);
    return ids.includes(removedId) && ids.length <= 1;
  });
  if (orphans.length > 0) {
    const names = orphans.map((rx) => text(rx.medicineName) || "this prescription");
    const label = names.length === 1 ? names[0] : `${names.length} prescriptions`;
    return {
      blocked: true,
      error: `Remove or relink ${label} before removing this diagnosis.`,
      prescriptions: list.slice(),
    };
  }

  return {
    blocked: false,
    error: null,
    prescriptions: list.map((rx) => {
      const ids = diagnosisIdsOf(rx.diagnosisIds);
      if (!ids.includes(removedId)) return rx;
      return { ...rx, diagnosisIds: ids.filter((id) => id !== removedId) };
    }),
  };
}

export function formatPrescriptionLine(rx) {
  const item = canonical(rx);
  const name = [item.medicineName, item.strength].filter(Boolean).join(" ");
  const parts = [name, item.dose, item.route, item.frequency, item.duration, item.instructions].filter(Boolean);
  const quantity = quantityState(item.authorizedQuantity);
  if (quantity.valid) {
    parts.push([String(quantity.value), item.authorizedUnit].filter(Boolean).join(" "));
  }
  return parts.join(" · ");
}

export function prescriptionsForDiagnosis(list, diagnosisId) {
  const id = text(diagnosisId);
  if (!id) return [];
  return normalizePrescriptions(list).filter((rx) => rx.diagnosisIds.includes(id));
}

function releasePrescriptionId(event) {
  return text(event?.prescriptionId ?? event?.prescription_id);
}

function isUnavailableRelease(event) {
  return event?.unavailable === true || text(event?.status).toLowerCase() === "unavailable";
}

function releaseQuantity(event) {
  if (!isRecord(event) || isUnavailableRelease(event)) return 0;
  const raw = event.quantity ?? event.qty;
  const parsed = typeof raw === "number" ? raw : Number(text(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function orderFulfillment(order, releases) {
  const related = releases.filter((event) => releasePrescriptionId(event) === order.id);
  const releasedQuantity = related.reduce((sum, event) => sum + releaseQuantity(event), 0);
  const unavailable = related.some(isUnavailableRelease);
  const authorizedState = quantityState(order.authorizedQuantity);
  const authorized = authorizedState.valid ? authorizedState.value : null;
  let status = "Pending";
  let remaining = null;

  if (authorized != null) {
    remaining = Math.max(0, authorized - releasedQuantity);
    if (releasedQuantity <= 0) status = unavailable ? "Unavailable" : "Pending";
    else if (releasedQuantity < authorized) status = "Partially Dispensed";
    else status = "Dispensed";
  } else if (releasedQuantity > 0) {
    status = "Dispensed";
    remaining = null;
  } else if (unavailable) {
    status = "Unavailable";
  }

  return { id: order.id, status, releasedQuantity, remaining };
}

function rollupStatus(orders) {
  if (orders.length === 0 || orders.every((order) => order.status === "Pending")) return "Pending";
  if (orders.every((order) => order.status === "Dispensed")) return "Dispensed";
  if (orders.every((order) => order.status === "Unavailable")) return "Unavailable";
  return "Partially Dispensed";
}

export function visitPrescriptionStatus(orders, releases) {
  const list = normalizePrescriptions(orders);
  const events = Array.isArray(releases) ? releases : [];
  const rows = list.map((order) => orderFulfillment(order, events));
  return { status: rollupStatus(rows), orders: rows };
}

```

## FILE: frontend/src/utils/rhuPrescriptions.test.js
```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrescriptionId,
  emptyPrescription,
  normalizePrescriptions,
  prescriptionsForSave,
  prescriptionErrors,
  reconcilePrescriptionsForDiagnosisRemoval,
  formatPrescriptionLine,
  prescriptionsForDiagnosis,
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

```
