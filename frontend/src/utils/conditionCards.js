import { reportingEntryErrors, formatEntryDestinations } from "./reportingEntries.js";
import { ATTENTION_LEVELS } from "./referralAttention.js";
import { entryPurposeKey } from "./followUpSchedules.js";

/** Stored per-entry outcomes on saved records (follow-up maps to managed). */
export const CONDITION_OUTCOMES = Object.freeze({
  managed_at_bhc: "Managed at BHC",
  refer_to_rhu: "Refer to RHU",
});

/** One exclusive Care Outcome per concern on Assessment & Care Plan. */
export const CARE_OUTCOMES = Object.freeze({
  managed_at_bhc: "Managed at BHC",
  bhc_follow_up: "BHC Follow-up",
  refer_to_rhu: "Refer to RHU",
});

export const CARE_OUTCOME_ERROR = "Choose a care outcome.";

function text(value) {
  return String(value ?? "").trim();
}

export function namedConcern(entry) {
  return text(entry?.name) !== "";
}

export function isCareOutcome(value) {
  return Object.hasOwn(CARE_OUTCOMES, value || "");
}

/** UI care outcome: stored clinicalOutcome plus whether this concern has a return. */
export function entryCareOutcome(entry, schedules = []) {
  if (entry?.clinicalOutcome === "refer_to_rhu") return "refer_to_rhu";
  const purposeKey = entryPurposeKey(entry?.id);
  if (purposeKey && (schedules || []).some((item) => item?.purposeKey === purposeKey)) return "bhc_follow_up";
  if (entry?.clinicalOutcome === "managed_at_bhc") return "managed_at_bhc";
  return "";
}

export function applyEntryCareOutcome(entry, careOutcome) {
  if (careOutcome === "refer_to_rhu") return { ...entry, clinicalOutcome: "refer_to_rhu" };
  if (careOutcome === "managed_at_bhc" || careOutcome === "bhc_follow_up") {
    return { ...entry, clinicalOutcome: "managed_at_bhc" };
  }
  const next = { ...entry };
  delete next.clinicalOutcome;
  return next;
}

/** Shared submissions keep per-card outcomes but send referral details once. */
export function sharedConditionEntries(entries = []) {
  return entries.map((entry) => {
    const next = { ...entry };
    delete next.referral;
    return next;
  });
}

/** Preserve earlier per-condition reasons without choosing between conflicting destinations. */
export function restoreSharedReferralDraft(payload = {}) {
  const form = { ...(payload.referralForm || {}) };
  const current = { receivingRhuId: payload.receivingRhuId || "", referralForm: form };
  if (payload.sharedConditionReferral === true) return current;
  const earlier = (payload.diagnoses || []).filter((entry) => entry.clinicalOutcome === "refer_to_rhu" && (entry.referral?.receivingRhuId || entry.referral?.reasonForReferral?.trim()));
  if (earlier.length === 0) return current;
  const hadVisitReferral = payload.carePlan?.referToRhu === true || payload.carePlan?.monitoringReferrals?.length > 0;
  const destinations = [...new Set([...(hadVisitReferral && current.receivingRhuId ? [String(current.receivingRhuId)] : []), ...earlier.map((entry) => String(entry.referral?.receivingRhuId || "")).filter(Boolean)])];
  const priorities = [...new Set([...(hadVisitReferral && form.urgencyLevel ? [form.urgencyLevel] : []), ...earlier.map((entry) => entry.referral?.urgencyLevel).filter(Boolean)])];
  const reasons = [
    ...(form.reasonForReferral?.trim() ? [form.reasonForReferral.trim()] : []),
    ...earlier.filter((entry) => entry.referral?.reasonForReferral?.trim()).map((entry) => `${entry.name}: ${entry.referral.reasonForReferral.trim()}`),
  ];
  return {
    receivingRhuId: destinations.length === 1 ? destinations[0] : "",
    referralForm: { ...form, urgencyLevel: priorities.length === 1 ? priorities[0] : "", reasonForReferral: [...new Set(reasons)].join("\n") },
  };
}

export function conditionCardErrors(entries = [], { referralDetails = false, allowEmpty = true, schedules = [] } = {}) {
  const errors = reportingEntryErrors(entries);
  const named = (entries || []).filter(namedConcern);
  if (!allowEmpty && named.length === 0) {
    errors.diagnoses = "Add at least one condition before continuing.";
  }
  for (const entry of named) {
    const key = `reportingEntry.${entry.id}`;
    if (!isCareOutcome(entryCareOutcome(entry, schedules))) {
      errors[`${key}.clinicalOutcome`] = CARE_OUTCOME_ERROR;
    }
    if (!referralDetails || entry.clinicalOutcome !== "refer_to_rhu") continue;
    if (!ATTENTION_LEVELS.includes(entry.referral?.urgencyLevel)) errors[`${key}.referral.urgencyLevel`] = "Choose a referral priority.";
    if (!entry.referral?.receivingRhuId) errors[`${key}.referral.receivingRhuId`] = "Select an authorized RHU.";
    if (!entry.referral?.reasonForReferral?.trim()) errors[`${key}.referral.reasonForReferral`] = "Enter the reason for referral.";
  }
  return errors;
}

export function conditionCardReviewRows(entries = [], schedules = []) {
  return (entries || [])
    .filter(namedConcern)
    .map((entry) => {
      const outcome = CARE_OUTCOMES[entryCareOutcome(entry, schedules)] || "Outcome not selected";
      return {
        label: entry.name,
        value: [outcome, formatEntryDestinations(entry) || "Not classified"].filter(Boolean).join(" · "),
      };
    });
}

/** Covers successful, held, and partially submitted referral sets. */
export function savedReferralSummary(record = {}) {
  const monitoring = record.monitoringData || record.monitoring_data || {};
  const held = (monitoring.conditionReferralOutcomes || []).filter((item) => item.holdId).length +
    (monitoring.referralHoldId && monitoring.submissionStatus === "Not Yet Submitted" ? 1 : 0);
  const submitted = record.referrals?.length || (record.officialResult?.referral_id ? 1 : 0);
  return {
    submittedReferralCount: submitted,
    heldReferralCount: held,
    referralSubmitted: submitted > 0,
    awaitingDoctor: held > 0,
    referralTrackingId: record.referrals?.[0]?.tracking_id || record.referrals?.[0]?.trackingId || "",
  };
}
