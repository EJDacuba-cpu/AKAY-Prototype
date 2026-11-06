import { getRecordDateValue } from "./healthRecordPrograms.js";

export const NUTRITION_INTENT_ENROLL = "enroll";
export const NUTRITION_INTENT_CONTINUE = "continue";
export const NUTRITION_STATUS_NOT_ENROLLED = "Not Enrolled";
export const NUTRITION_STATUS_ACTIVE = "Active";
export const NUTRITION_STATUS_CLOSED = "Closed";

const NOT_ENROLLED = {
  enrolled: false,
  status: NUTRITION_STATUS_NOT_ENROLLED,
  intent: NUTRITION_INTENT_ENROLL,
  enrolledOn: null,
  latestRecord: null,
  visitCount: 0,
  episodeStartedOn: "",
  closedOn: "",
  episodeRecords: [],
  fromApi: false,
};

/**
 * Nutrition enrollment record: selected program Nutrition, or category
 * Nutrition. A mention of nutrition in free text is not an enrollment.
 */
export function isNutritionEnrollmentRecord(record = {}) {
  const explicit = record.selectedPrograms ?? record.monitoringData?.selectedPrograms ?? record.monitoring_data?.selectedPrograms;
  if (Array.isArray(explicit) && explicit.includes("Nutrition")) return true;
  const category = record.category || record.patientClassification || record.classification || record.recordType || record.record_type || "";
  return category === "Nutrition";
}

function isFinalizedHealthRecord(record = {}) {
  const status = String(record.status || record.recordStatus || "").trim().toLowerCase();
  if (status === "draft" || record.isDraft === true || record.is_draft === true) return false;
  const finalized = record.finalizedAt ?? record.finalized_at;
  return !(finalized === null || finalized === false || finalized === "");
}

function dateOnly(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function recordDay(record) {
  return dateOnly(getRecordDateValue(record));
}

function timestamp(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function closureStartId(closure) {
  return closure?.startedHealthRecordId ?? closure?.started_health_record_id;
}

function recordIsAfterClosure(record, closure) {
  const recordCreated = timestamp(record.createdAt || record.created_at);
  const closureCreated = timestamp(closure.createdAt || closure.created_at);
  if (recordCreated !== null && closureCreated !== null) return recordCreated > closureCreated;
  const day = recordDay(record);
  const closedOn = dateOnly(closure.closedOn || closure.closed_on);
  return Boolean(day && closedOn && day > closedOn);
}

/**
 * Nutrition episodes oldest-first. A closure is matched to the record that
 * opened the episode. A nutrition record saved after that closure starts
 * the next episode, including a same-day re-enroll.
 */
export function nutritionEpisodes(records = [], closures = []) {
  const nutrition = (Array.isArray(records) ? records : [])
    .filter((record) => record && isFinalizedHealthRecord(record) && isNutritionEnrollmentRecord(record))
    .sort((a, b) => recordDay(a).localeCompare(recordDay(b)) || Number(a.id) - Number(b.id));
  const closureList = Array.isArray(closures) ? closures : [];
  const episodes = [];
  let index = 0;

  while (index < nutrition.length) {
    const start = nutrition[index];
    const closure = closureList.find((item) => String(closureStartId(item)) === String(start.id)) || null;
    const episodeRecords = [start];
    index += 1;
    while (index < nutrition.length) {
      const next = nutrition[index];
      if (closure && recordIsAfterClosure(next, closure)) break;
      episodeRecords.push(next);
      index += 1;
    }
    episodes.push({
      startedOn: recordDay(start),
      closedOn: closure ? dateOnly(closure.closedOn || closure.closed_on) : "",
      status: closure ? NUTRITION_STATUS_CLOSED : NUTRITION_STATUS_ACTIVE,
      records: episodeRecords,
    });
  }

  return episodes;
}

function hasApiSummary(value) {
  return Boolean(value && typeof value === "object" && typeof value.status === "string" && value.status);
}

function presentDate(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

/**
 * Enrollment for the service panel and Care Tracking.
 * A nutritionCare summary that carries `status` wins. Otherwise status is
 * derived from finalized Nutrition records plus any local closures.
 * `patient` and `today` match the prenatal helper's call shape; age is
 * applied when the care card builds BMI, not here.
 */
export function resolveNutritionCare(records = [], nutritionCare) {
  const closures = Array.isArray(nutritionCare?.closures) ? nutritionCare.closures : [];
  const summary = hasApiSummary(nutritionCare) ? nutritionCare : null;
  const episodes = nutritionEpisodes(records, summary ? [] : closures);
  const episode = episodes[episodes.length - 1] || null;
  const latestRecord = episode ? episode.records[episode.records.length - 1] : null;
  const visitCount = episode ? episode.records.length : 0;

  if (summary) {
    const status = summary.status;
    const enrolled = status === NUTRITION_STATUS_ACTIVE;
    return {
      enrolled,
      status,
      intent: enrolled ? NUTRITION_INTENT_CONTINUE : NUTRITION_INTENT_ENROLL,
      enrolledOn: enrolled ? (presentDate(summary.enrolled_on, summary.enrolledOn) || null) : null,
      latestRecord,
      visitCount,
      episodeStartedOn: presentDate(summary.enrolled_on, summary.enrolledOn, episode?.startedOn),
      closedOn: "",
      episodeRecords: episode?.records || [],
      fromApi: true,
    };
  }

  if (!episode) return { ...NOT_ENROLLED };

  const enrolled = episode.status === NUTRITION_STATUS_ACTIVE;
  return {
    enrolled,
    status: episode.status,
    intent: enrolled ? NUTRITION_INTENT_CONTINUE : NUTRITION_INTENT_ENROLL,
    enrolledOn: enrolled ? episode.startedOn : null,
    latestRecord,
    visitCount,
    episodeStartedOn: episode.startedOn,
    closedOn: episode.closedOn,
    episodeRecords: episode.records,
    fromApi: false,
  };
}

export function getNutritionEnrollment(patient = {}, records = [], today = new Date(), nutritionCareFromApi) {
  // Same call shape as getPrenatalEnrollment. Status comes from records and
  // the nutrition summary; age is applied later, when the card formats BMI.
  void patient;
  void today;
  const resolved = resolveNutritionCare(records, nutritionCareFromApi);
  return {
    enrolled: resolved.enrolled,
    status: resolved.status,
    intent: resolved.intent,
    enrolledOn: resolved.enrolledOn,
    latestRecord: resolved.latestRecord,
    visitCount: resolved.visitCount,
  };
}

/**
 * Health Services panel copy. Closed enrolls again; Active continues.
 */
export function nutritionProgramCopy({ enrolled, included, status } = {}) {
  const open = Boolean(enrolled) && status !== NUTRITION_STATUS_CLOSED;
  return {
    title: "Nutrition Care",
    enrollLabel: open ? "Continue Nutrition Care" : "Enroll to Nutrition",
    statusLabel: open
      ? (included ? "Continuing this visit" : "Active")
      : (included ? "Included this visit" : "Not included"),
    statusTone: open ? "active" : included ? "included" : "neutral",
    description: open
      ? "Active Nutrition Care from a finalized consultation. Continue this visit without starting a second enrollment."
      : "Optional. Nutrition Care becomes Active only after this consultation is finalized.",
    hideAction: false,
  };
}
