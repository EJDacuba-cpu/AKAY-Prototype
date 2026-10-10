import { conditionStatusLabel } from "./medicalConditions.js";

/**
 * The RHU "Confirm Conditions" block: the rows an RHU staff member chose to set
 * on the patient's record, shaped for `condition_confirmations` on
 * POST /feedback and POST /health-records. A row is
 * { conditionId?, name, status, note, setOnRecord, recommend } - an existing
 * condition carries its conditionId, a new one its typed name.
 */

export const CONDITION_STATUS_OPTIONS = ["under_evaluation", "active", "controlled", "resolved", "ruled_out"]
  .map((value) => ({ value, label: conditionStatusLabel(value) }));

/** The statuses a condition can be handed back to BHC monitoring from. */
const MONITORABLE_STATUSES = new Set(["active", "controlled"]);

export const MAX_CONFIRMATIONS = 20;
const MAX_NAME_LENGTH = 150;
const MAX_NOTE_LENGTH = 500;
const FIELD_PREFIX = "conditionConfirmations";

export function canRecommendBhcMonitoring(status) {
  return MONITORABLE_STATUSES.has(status);
}

const nameKey = (name) => String(name || "").replace(/\s+/g, " ").trim().toLowerCase();

const ticked = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => row?.setOnRecord === true);

/**
 * A row after an edit. "Recommend BHC monitoring" only applies to an Active or
 * Controlled condition, so it is cleared whenever the status stops allowing it
 * (it must not come back by itself when the status later returns to Active).
 */
export function patchConditionRow(row, patch) {
  const next = { ...row, ...patch };
  if (!canRecommendBhcMonitoring(next.status)) next.recommend = false;
  return next;
}

/**
 * The row for an existing open condition, not yet ticked. "Recommend BHC
 * monitoring" starts as the condition's current state, so the RHU can see a
 * standing recommendation and withdraw it by unticking (sent as an explicit
 * false once the row is ticked).
 */
export function existingConditionRow(condition) {
  return {
    conditionId: condition.id,
    name: condition.conditionName,
    status: condition.status,
    note: "",
    setOnRecord: false,
    recommend: Boolean(condition.bhcMonitoringRecommendedAt) && canRecommendBhcMonitoring(condition.status),
  };
}

/** The request rows: only those ticked "Set on patient's record". */
export function buildConditionConfirmations(rows) {
  return ticked(rows).map((row) => {
    const item = row.conditionId
      ? { condition_id: row.conditionId }
      : { name: String(row.name || "").trim() };
    const note = String(row.note || "").trim();
    item.status = row.status;
    if (note) item.note = note;
    item.recommend_bhc_monitoring = Boolean(row.recommend) && canRecommendBhcMonitoring(row.status);
    return item;
  });
}

/** Errors keyed `conditionConfirmations.<index>.<field>`; unticked rows are skipped. */
export function validateConditionConfirmations(rows) {
  const errors = {};
  const seen = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (row?.setOnRecord !== true) return;
    const key = (field) => `${FIELD_PREFIX}.${index}.${field}`;
    const name = String(row.name || "").trim();
    if (!row.conditionId && !name) errors[key("name")] = "Enter the condition name.";
    else if (name.length > MAX_NAME_LENGTH) errors[key("name")] = `Keep the name within ${MAX_NAME_LENGTH} characters.`;
    if (!row.status) errors[key("status")] = "Choose a status.";
    if (String(row.note || "").trim().length > MAX_NOTE_LENGTH) {
      errors[key("note")] = `Keep the note within ${MAX_NOTE_LENGTH} characters.`;
    }
    if (name) {
      const identity = nameKey(name);
      const first = seen.get(identity);
      if (first === undefined) {
        seen.set(identity, index);
      } else {
        // Show the error on an editable (new) row when one is involved, else on the later row.
        const target = !row.conditionId ? index : !rows[first].conditionId ? first : index;
        errors[`${FIELD_PREFIX}.${target}.name`] ||= "This condition is listed twice.";
      }
    }
  });
  if (ticked(rows).length > MAX_CONFIRMATIONS) {
    errors[FIELD_PREFIX] = `Confirm at most ${MAX_CONFIRMATIONS} conditions at a time.`;
  }
  return errors;
}

/**
 * Maps a 422 `errors` object onto the block's rows. The server counts the rows
 * that were sent (the ticked ones), so its index is translated back to the
 * row's own position; other fields are left for the form to handle.
 */
export function mapConditionConfirmationErrors(serverErrors, rows) {
  const sentIndexes = (Array.isArray(rows) ? rows : []).flatMap((row, index) => (row?.setOnRecord === true ? [index] : []));
  const mapped = {};
  Object.entries(serverErrors || {}).forEach(([path, messages]) => {
    const match = /^condition_confirmations\.(\d+)\.(\w+)$/.exec(path);
    if (!match) return;
    const rowIndex = sentIndexes[Number(match[1])];
    if (rowIndex === undefined) return;
    const field = match[2] === "recommend_bhc_monitoring" ? "recommend" : match[2] === "condition_id" ? "name" : match[2];
    mapped[`${FIELD_PREFIX}.${rowIndex}.${field}`] = Array.isArray(messages) ? messages[0] : String(messages);
  });
  return mapped;
}

/**
 * Legacy BHC monitoring review (D7). A legacy monitoring has no RHU
 * verification; the RHU may decide each one:
 *  - confirm: add a condition row with the legacy name (Active/Controlled links
 *    it through the server's identity auto-link);
 *  - correct: discontinue it ("Corrected by RHU to <name>") and add a condition
 *    row with the corrected name;
 *  - discontinue: stop it with a typed reason;
 *  - no decision (''): nothing is sent.
 * The legacy row and its visits are never edited or deleted, only superseded.
 */

/** The server prefixes "RHU review: " to fit a 500-character column. */
export const MAX_LEGACY_REASON_LENGTH = 488;
export const MAX_LEGACY_DISCONTINUATIONS = 20;
const LEGACY_PREFIX = "legacyMonitoringDiscontinuations";
const CORRECTED_REASON_PREFIX = "Corrected by RHU to ";

const trimmed = (value) => String(value || "").trim();
const correctedReason = (correctedName) => `${CORRECTED_REASON_PREFIX}${trimmed(correctedName)}`;

export function legacyDecisionRow(monitoring) {
  return {
    monitoringId: monitoring.id,
    conditionName: monitoring.conditionName,
    decision: "",
    correctedName: "",
    reason: "",
  };
}

/**
 * Applies a patch ({ decision?, correctedName?, reason? }) to one legacy row and
 * keeps the condition rows in step: a confirm/correct decision owns exactly one
 * row (tagged `legacyMonitoringId`), kept across edits so the RHU's status and
 * note survive, and removed when the decision changes to one that adds none.
 * `legacyRows` must contain the row for `monitoringId`.
 */
export function applyLegacyDecision(rows, legacyRows, monitoringId, patch) {
  const current = legacyRows.find((row) => row.monitoringId === monitoringId);
  if (!current) return { rows, legacyRows };

  const next = { ...current, ...patch };
  if (patch.decision !== undefined && patch.decision !== current.decision) {
    if (next.decision !== "correct" && patch.correctedName === undefined) next.correctedName = "";
    if (patch.reason === undefined) next.reason = "";
  }
  if (next.decision === "correct") next.reason = correctedReason(next.correctedName);

  const ownedName = next.decision === "confirm" ? current.conditionName : next.decision === "correct" ? next.correctedName : null;
  const ownedIndex = rows.findIndex((row) => row.legacyMonitoringId === monitoringId);
  let nextRows;
  if (ownedName === null) {
    nextRows = rows.filter((row) => row.legacyMonitoringId !== monitoringId);
  } else if (ownedIndex >= 0) {
    nextRows = rows.map((row, index) => (index === ownedIndex ? { ...row, name: ownedName } : row));
  } else {
    nextRows = [
      ...rows,
      { conditionId: null, name: ownedName, status: "", note: "", setOnRecord: true, recommend: false, legacyMonitoringId: monitoringId },
    ];
  }

  return {
    rows: nextRows,
    legacyRows: legacyRows.map((row) => (row.monitoringId === monitoringId ? next : row)),
  };
}

const discontinuing = (row) => row?.decision === "correct" || row?.decision === "discontinue";

/** The request items: only corrected and discontinued monitorings. */
export function buildLegacyDiscontinuations(legacyRows) {
  return (Array.isArray(legacyRows) ? legacyRows : []).filter(discontinuing).map((row) => ({
    monitoring_id: row.monitoringId,
    reason: row.decision === "correct" ? correctedReason(row.correctedName) : trimmed(row.reason),
  }));
}

/** Errors keyed `legacyMonitoringDiscontinuations.<monitoringId>.<field>`. */
export function validateLegacyDecisions(legacyRows) {
  const errors = {};
  const list = Array.isArray(legacyRows) ? legacyRows : [];
  list.forEach((row) => {
    const key = (field) => `${LEGACY_PREFIX}.${row.monitoringId}.${field}`;
    if (row.decision === "discontinue") {
      const reason = trimmed(row.reason);
      if (!reason) errors[key("reason")] = "Enter the reason for discontinuing.";
      else if (reason.length > MAX_LEGACY_REASON_LENGTH) {
        errors[key("reason")] = `Keep the reason within ${MAX_LEGACY_REASON_LENGTH} characters.`;
      }
    } else if (row.decision === "correct") {
      const name = trimmed(row.correctedName);
      if (!name) errors[key("correctedName")] = "Enter the corrected condition name.";
      else if (name.length > MAX_NAME_LENGTH) errors[key("correctedName")] = `Keep the name within ${MAX_NAME_LENGTH} characters.`;
      else if (nameKey(name) === nameKey(row.conditionName)) {
        errors[key("correctedName")] = "Same condition - choose Confirm instead.";
      }
    }
  });
  if (list.filter(discontinuing).length > MAX_LEGACY_DISCONTINUATIONS) {
    errors[LEGACY_PREFIX] = `Review at most ${MAX_LEGACY_DISCONTINUATIONS} legacy monitorings at a time.`;
  }
  return errors;
}

/**
 * Maps a 422 `errors` object onto the legacy rows. The server counts the items
 * that were sent (corrected and discontinued rows), so its index is translated
 * back to the row's monitoring id.
 */
export function mapLegacyDiscontinuationErrors(serverErrors, legacyRows) {
  const sent = (Array.isArray(legacyRows) ? legacyRows : []).filter(discontinuing);
  const mapped = {};
  Object.entries(serverErrors || {}).forEach(([path, messages]) => {
    const match = /^legacy_monitoring_discontinuations\.(\d+)\.(\w+)$/.exec(path);
    if (!match) return;
    const row = sent[Number(match[1])];
    if (!row) return;
    const field = match[2] === "monitoring_id" ? "decision" : match[2];
    mapped[`${LEGACY_PREFIX}.${row.monitoringId}.${field}`] = Array.isArray(messages) ? messages[0] : String(messages);
  });
  return mapped;
}
