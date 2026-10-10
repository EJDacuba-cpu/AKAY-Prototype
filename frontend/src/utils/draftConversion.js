/**
 * Converts a draft saved before the BHC General Consultation simplification
 * (per-concern Health Concerns) into the bhc_general_v2 shape, once, on restore.
 *
 * Nothing the worker typed is dropped: concerns reported nowhere, the old
 * assessment notes and the monitoring notes that no monitoring card would show
 * are kept as read-only "Earlier draft" text (sent as assessment_notes).
 * The referral form and the follow-up date / time / reason pass through
 * unchanged. Dates are never invented: the checkboxes start ticked only when
 * the old draft already had the matching data.
 */
import { DIAGNOSIS_LIMITS, createDiagnosisId } from "./diagnoses.js";
import { applyLegacyReportingStatus } from "./diagnosisReporting.js";
import { entryDestinations } from "./reportingEntries.js";
import { BHC_GENERAL_V2 } from "./consultationWorkflow.js";

const CONCERNS_PREFIX = "Earlier draft — Health concerns: ";
const CLINICAL_NOTES_PREFIX = "Earlier draft — Additional clinical notes: ";
const ELLIPSIS = "…";

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

function truncateNotes(value) {
  const limit = DIAGNOSIS_LIMITS.notes;
  return value.length > limit ? `${value.slice(0, limit - 1)}${ELLIPSIS}` : value;
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
  const monitoringNotes = text(payload.monitoringNotes);

  const earlierNotes = [
    unreportedNames.length > 0 ? `${CONCERNS_PREFIX}${unreportedNames.join("; ")}` : "",
    text(payload.assessmentNotes),
    !continuesOrStartsMonitoring && monitoringNotes ? `${CLINICAL_NOTES_PREFIX}${monitoringNotes}` : "",
  ].filter(Boolean);

  const planOf = (concern) => concern.carePlan;
  const bhcFollowUp =
    concerns.some((concern) => planOf(concern) === "follow_up" || planOf(concern) === "recheck") ||
    concerns.some((concern) => planOf(concern) === "refer" && concern.bhcFollowUp === true) ||
    text(payload.followUpDate) !== "";
  const referToRhu =
    concerns.some((concern) => planOf(concern) === "refer" || planOf(concern) === "monitor_refer") ||
    payload.needsReferral === true;

  return {
    ...payload,
    consultationWorkflow: BHC_GENERAL_V2,
    diagnoses: entries,
    diagnosis: "",
    assessmentNotes: truncateNotes(earlierNotes.join("\n")),
    monitoringNotes: continuesOrStartsMonitoring ? payload.monitoringNotes ?? "" : "",
    carePlan: { ...carePlan, bhcFollowUp, referToRhu, referralMultipleIssues: false },
  };
}
