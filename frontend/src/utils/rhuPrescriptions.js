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

/**
 * Draft restore. Prefer the visit-level `prescriptions` array. Fall back to a
 * copy already stored under monitoring data. Legacy `prescriptionText` is not
 * converted into orders.
 */
export function restorePrescriptions(payload = {}) {
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.prescriptions)) return normalizePrescriptions(payload.prescriptions);
  const monitoring = isRecord(payload.monitoringData)
    ? payload.monitoringData
    : isRecord(payload.monitoring_data)
      ? payload.monitoring_data
      : null;
  if (Array.isArray(monitoring?.prescriptions)) return normalizePrescriptions(monitoring.prescriptions);
  return [];
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

/** One shared order is listed under every linked diagnosis. Unlinked orders stay visible. */
export function prescriptionReviewGroups(prescriptions, diagnoses = []) {
  const list = normalizePrescriptions(prescriptions);
  const named = Array.isArray(diagnoses) ? diagnoses : [];
  const groups = [];
  const matched = new Set();
  for (const entry of named) {
    const orders = prescriptionsForDiagnosis(list, entry?.id);
    if (!orders.length) continue;
    for (const rx of orders) matched.add(rx.id);
    groups.push({
      label: `${text(entry?.name) || "Diagnosis"} — Prescription`,
      orders,
    });
  }
  const unmatched = list.filter((rx) => !matched.has(rx.id));
  if (unmatched.length) groups.push({ label: "Prescription", orders: unmatched });
  return groups;
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
