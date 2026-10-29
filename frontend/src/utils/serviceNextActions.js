/**
 * Assessment & Care Plan next actions for selected Prenatal / EPI / FP
 * services. Each selected service is independent: no additional action,
 * a dated BHC return, or inclusion in the visit's one RHU referral.
 * Clinical service forms are unchanged; these controls live only here.
 */
import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";
import { restoreFollowUpSchedules, servicePurposeKey, VISIT_PURPOSE_KEY } from "./followUpSchedules.js";

export const SERVICE_NEXT_ACTIONS = Object.freeze({
  none: "No additional action",
  schedule: "Schedule next visit",
  refer_to_rhu: "Refer to RHU",
});

export const CARE_PLAN_SERVICE_LABELS = Object.freeze({
  Maternal: "Maternal Care",
  EPI: "EPI",
  "Family Planning": "Family Planning",
});

const text = (value) => String(value ?? "").trim();

export function isCarePlanService(program) {
  return Object.hasOwn(PROGRAM_CLASSIFICATIONS, program || "");
}

export function carePlanServiceLabel(program) {
  return CARE_PLAN_SERVICE_LABELS[program] || program;
}

export function defaultServicePurpose(program) {
  if (program === "Maternal") return "Prenatal follow-up";
  if (program === "EPI") return "Immunization follow-up";
  if (program === "Family Planning") return "Family planning appointment";
  return "BHC follow-up";
}

export function selectedCarePlanServices(selectedPrograms = []) {
  return [...new Set((selectedPrograms || []).filter(isCarePlanService))];
}

export function serviceSchedule(program, schedules = []) {
  const key = servicePurposeKey(program);
  return (schedules || []).find((item) => item?.purposeKey === key) || null;
}

export function serviceNextAction(program, { schedules = [], serviceReferrals = [] } = {}) {
  if ((serviceReferrals || []).includes(program)) return "refer_to_rhu";
  if (serviceSchedule(program, schedules)) return "schedule";
  return "none";
}

export function applyServiceNextAction(program, action, schedules = []) {
  const key = servicePurposeKey(program);
  const rest = (schedules || []).filter((item) => item?.purposeKey !== key);
  if (action !== "schedule") return rest;
  const existing = (schedules || []).find((item) => item?.purposeKey === key);
  return [...rest, {
    purposeKey: key,
    purpose: existing?.purpose || defaultServicePurpose(program),
    date: existing?.date || "",
    time: existing?.time || "",
    predecessorTaskId: existing?.predecessorTaskId || null,
    sourceEntryId: existing?.sourceEntryId || null,
  }];
}

export function applyServiceReferral(program, action, serviceReferrals = []) {
  const current = (serviceReferrals || []).filter((key) => key !== program);
  if (action === "refer_to_rhu" && isCarePlanService(program)) return [...current, program];
  return current;
}

export function pruneServiceSchedules(schedules = [], selectedPrograms = []) {
  const keys = new Set(selectedCarePlanServices(selectedPrograms).map(servicePurposeKey));
  return (schedules || []).filter((item) => {
    const key = text(item?.purposeKey);
    if (!key.startsWith("service:")) return true;
    return keys.has(key);
  });
}

export function pruneServiceReferrals(serviceReferrals = [], selectedPrograms = []) {
  const selected = new Set(selectedCarePlanServices(selectedPrograms));
  return (serviceReferrals || []).filter((key) => selected.has(key));
}

/**
 * Older drafts stored a visit or extra return instead of a service key.
 * Adopt one orphan per selected service that has no schedule. Never copy one
 * orphan onto every selected service.
 */
export function adoptOrphanServiceSchedules(schedules = [], selectedPrograms = []) {
  const selected = selectedCarePlanServices(selectedPrograms);
  const used = new Set(
    (schedules || [])
      .filter((item) => text(item?.purposeKey).startsWith("service:"))
      .map((item) => item.purposeKey),
  );
  const orphans = [];
  const kept = [];
  for (const row of schedules || []) {
    const key = text(row?.purposeKey);
    if (key === VISIT_PURPOSE_KEY || key.startsWith("extra:")) orphans.push(row);
    else kept.push(row);
  }
  const needing = selected.filter((program) => !used.has(servicePurposeKey(program)));
  if (needing.length === 1 && orphans.length > 0) {
    const orphan = orphans[0];
    kept.push({
      ...orphan,
      purposeKey: servicePurposeKey(needing[0]),
      purpose: text(orphan.purpose) || defaultServicePurpose(needing[0]),
    });
    orphans.slice(1).forEach((orphan) => {
      if (text(orphan.date) && text(orphan.purpose)) kept.push(orphan);
    });
    return kept;
  }
  orphans.forEach((orphan) => {
    if (text(orphan.date) && text(orphan.purpose)) kept.push(orphan);
  });
  return kept;
}

export function restoreSelectedServiceSchedules(list, selectedPrograms = [], fallback = null) {
  return adoptOrphanServiceSchedules(restoreFollowUpSchedules(list, fallback), selectedPrograms);
}

export function restoreServiceReferrals(draftCarePlan, selectedPrograms = []) {
  const selected = selectedCarePlanServices(selectedPrograms);
  const selectedSet = new Set(selected);
  const draft = draftCarePlan && typeof draftCarePlan === "object" ? draftCarePlan : {};
  if (Array.isArray(draft.serviceReferrals)) {
    return [...new Set(draft.serviceReferrals.filter((key) => selectedSet.has(key)))];
  }
  if (draft.referToRhu === true && selected.length === 1) return selected;
  return [];
}

export function suggestionsForProgram(program, suggestions = []) {
  if (program === "EPI") {
    return (suggestions || []).filter((item) => String(item?.source || "").startsWith("EPI"));
  }
  if (program === "Family Planning") {
    return (suggestions || []).filter((item) => String(item?.source || "").startsWith("FP"));
  }
  return [];
}

export { servicePurposeKey, VISIT_PURPOSE_KEY };
