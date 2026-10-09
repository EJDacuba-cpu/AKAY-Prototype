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
  const seen = new Set();
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
      if (seen.has(identity)) errors[key("name")] ||= "This condition is listed twice.";
      seen.add(identity);
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
