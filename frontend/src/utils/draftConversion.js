/**
 * Converts a draft saved before the BHC General Consultation simplification
 * (per-concern Health Concerns) into the bhc_general_v2 shape, once, on restore.
 *
 * Nothing the worker typed is dropped or cut: concerns reported nowhere, the
 * old assessment notes and the monitoring notes that no monitoring card would
 * show are kept as read-only "Earlier draft" text (sent as assessment_notes).
 * Text is never sliced away. When it would not fit the assessment_notes limit,
 * the monitoring notes stay in monitoringNotes (labelled; the save path has no
 * cap there), and any rest of the concerns / assessment text continues there
 * too, labelled "Earlier draft — continued: ". Both show read-only as
 * "Earlier draft notes (continued)".
 * The referral form and the follow-up date / time / reason pass through
 * unchanged. Dates are never invented: the checkboxes start ticked only when
 * the old draft already had the matching data.
 */
import { DIAGNOSIS_LIMITS, createDiagnosisId } from "./diagnoses.js";
import { applyLegacyReportingStatus } from "./diagnosisReporting.js";
import { entryDestinations } from "./reportingEntries.js";
import { BHC_GENERAL_V2, EARLIER_DRAFT_LABEL } from "./consultationWorkflow.js";

const CONCERNS_PREFIX = `${EARLIER_DRAFT_LABEL}Health concerns: `;
const CLINICAL_NOTES_PREFIX = `${EARLIER_DRAFT_LABEL}Additional clinical notes: `;
const CONTINUED_PREFIX = `${EARLIER_DRAFT_LABEL}continued: `;

const text = (value) => String(value ?? "").trim();
const hasIds = (value) => Array.isArray(value) && value.length > 0;

/** True for a draft payload not yet stamped bhc_general_v2. */
export function isLegacyDraftPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return payload.consultationWorkflow !== BHC_GENERAL_V2;
}

/** The legacy concern list, with a visit-level `diagnosis` standing in when there are no named concerns. */
function legacyConcerns(payload) {
  const list = (Array.isArray(payload.diagnoses) ? payload.diagnoses : []).filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
  );
  if (list.some((entry) => text(entry.name) !== "")) return list;
  const visitText = text(payload.diagnosis);
  return visitText ? [...list, { name: visitText }] : list;
}

/** Where text longer than the limit is split: at the limit, never inside a surrogate pair. */
function splitIndex(value, limit) {
  const code = value.charCodeAt(limit - 1);
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

/**
 * The converted assessmentNotes and monitoringNotes. Every character of the
 * earlier text is kept in one of the two; only labels are added.
 */
function placeEarlierText({ concernsLine, assessmentNotes, rawMonitoringNotes, movesMonitoringNotes }) {
  const limit = DIAGNOSIS_LIMITS.notes;
  const monitoringNotes = text(rawMonitoringNotes);
  const labelledMonitoringNotes = monitoringNotes ? `${CLINICAL_NOTES_PREFIX}${monitoringNotes}` : "";
  const joined = [concernsLine, assessmentNotes, movesMonitoringNotes ? labelledMonitoringNotes : ""]
    .filter(Boolean)
    .join("\n");
  // Everything fits in the assessment notes: the monitoring notes move there
  // when no monitoring card shows them (as before).
  if (joined.length <= limit) {
    return { assessmentNotes: joined, monitoringNotes: movesMonitoringNotes ? "" : rawMonitoringNotes ?? "" };
  }

  // Too long: the monitoring notes are not moved. Without a monitoring card
  // they stay labelled, so they show read-only as earlier draft text.
  const keptNotes = movesMonitoringNotes ? labelledMonitoringNotes : rawMonitoringNotes ?? "";
  const base = [concernsLine, assessmentNotes].filter(Boolean).join("\n");
  if (base.length <= limit) return { assessmentNotes: base, monitoringNotes: keptNotes };

  // Even the concerns and the old assessment notes are too long: the part
  // past the limit continues, labelled, ahead of the monitoring notes.
  const cut = splitIndex(base, limit);
  return {
    assessmentNotes: base.slice(0, cut),
    monitoringNotes: [`${CONTINUED_PREFIX}${base.slice(cut)}`, keptNotes].filter(Boolean).join("\n"),
  };
}

/**
 * The v2 payload for a legacy draft. A draft already stamped bhc_general_v2 is
 * returned as the same object. The input is never mutated.
 */
export function convertLegacyDraft(payload) {
  if (!isLegacyDraftPayload(payload)) return payload;

  // A pre-per-diagnosis draft has one visit-level status: every concern takes it.
  const concerns = applyLegacyReportingStatus(legacyConcerns(payload), payload.morbidityReportingStatus);

  const entries = [];
  const unreportedNames = [];
  for (const concern of concerns) {
    const name = text(concern.name);
    if (!name) continue;
    const reportIn = entryDestinations(concern);
    // The draft schema caps a name; a longer visit-level text stays whole in the notes instead.
    if (reportIn.length > 0 && name.length <= DIAGNOSIS_LIMITS.name) {
      entries.push({ id: concern.id ? String(concern.id) : createDiagnosisId(), name, reportIn });
    } else {
      unreportedNames.push(name);
    }
  }

  const carePlan = payload.carePlan && typeof payload.carePlan === "object" && !Array.isArray(payload.carePlan)
    ? payload.carePlan
    : {};
  const continuesOrStartsMonitoring = hasIds(carePlan.continuedMonitoringIds) || hasIds(carePlan.startConditionIds);
  const notes = placeEarlierText({
    concernsLine: unreportedNames.length > 0 ? `${CONCERNS_PREFIX}${unreportedNames.join("; ")}` : "",
    assessmentNotes: text(payload.assessmentNotes),
    rawMonitoringNotes: payload.monitoringNotes,
    movesMonitoringNotes: !continuesOrStartsMonitoring,
  });

  const planOf = (concern) => concern.carePlan;
  const bhcFollowUp =
    concerns.some((concern) => planOf(concern) === "follow_up" || planOf(concern) === "recheck") ||
    concerns.some((concern) => planOf(concern) === "refer" && concern.bhcFollowUp === true) ||
    text(payload.followUpDate) !== "";
  // needsReferral alone ticks Refer to RHU only when no monitored condition
  // was referred: a monitoring-only referral stays a monitoring referral.
  const referToRhu =
    concerns.some((concern) => planOf(concern) === "refer" || planOf(concern) === "monitor_refer") ||
    (payload.needsReferral === true && !hasIds(carePlan.monitoringReferrals));

  return {
    ...payload,
    consultationWorkflow: BHC_GENERAL_V2,
    diagnoses: entries,
    diagnosis: "",
    assessmentNotes: notes.assessmentNotes,
    monitoringNotes: notes.monitoringNotes,
    carePlan: { ...carePlan, bhcFollowUp, referToRhu, referralMultipleIssues: false },
  };
}
