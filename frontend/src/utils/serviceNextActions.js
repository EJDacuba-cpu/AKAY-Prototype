/**
 * Assessment & Care Plan next actions for selected Prenatal / EPI / FP /
 * Nutrition services. Each selected service is independent: no additional
 * action, a dated BHC return, inclusion in the visit's one RHU referral, or
 * (RHU only) Manage to BHC monitoring handoff. Clinical service forms are
 * unchanged; these controls live only here.
 */
import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";
import {
  isScheduledServiceFollowUp,
  restoreFollowUpSchedules,
  serviceFollowUpProgram,
  servicePurposeKey,
  VISIT_PURPOSE_KEY,
} from "./followUpSchedules.js";
import { normalizeSupportingLaboratoryTests } from "./laboratoryTests.js";

export const SERVICE_NEXT_ACTIONS = Object.freeze({
  none: "No additional action",
  schedule: "Schedule next visit",
  refer_to_rhu: "Refer to RHU",
  manage_to_bhc: "Manage to BHC",
});

export const CARE_PLAN_SERVICE_LABELS = Object.freeze({
  Maternal: "Maternal Care",
  EPI: "EPI",
  "Family Planning": "Family Planning",
  Nutrition: "Nutrition",
});

const text = (value) => String(value ?? "").trim();

export function isCarePlanService(program) {
  return Object.hasOwn(PROGRAM_CLASSIFICATIONS, program || "");
}

export function isServiceNextAction(value) {
  return Object.hasOwn(SERVICE_NEXT_ACTIONS, value || "");
}

export function carePlanServiceLabel(program) {
  return CARE_PLAN_SERVICE_LABELS[program] || program;
}

export function defaultServicePurpose(program) {
  if (program === "Maternal") return "Prenatal follow-up";
  if (program === "EPI") return "Immunization follow-up";
  if (program === "Family Planning") return "Family planning appointment";
  if (program === "Nutrition") return "Nutrition follow-up";
  return "BHC follow-up";
}

export function selectedCarePlanServices(selectedPrograms = []) {
  return [...new Set((selectedPrograms || []).filter(isCarePlanService))];
}

export function emptyServiceHandoff(program) {
  return {
    program,
    receivingBhcId: "",
    monitoringRecommendation: "",
    laboratoryEvidence: [],
    laboratoryEvidenceConfirmed: false,
  };
}

function normalizeHandoffLaboratoryEvidence(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const reference = text(item?.reference);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    const version = Number(item?.version);
    out.push({
      reference,
      version: Number.isFinite(version) && version >= 0 ? version : 0,
    });
  }
  return out;
}

function mapServiceHandoffRow(item) {
  return {
    program: item.program,
    receivingBhcId: String(item.receivingBhcId ?? item.receiving_bhc_id ?? ""),
    monitoringRecommendation: String(
      item.monitoringRecommendation ?? item.monitoring_recommendation ?? "",
    ),
    laboratoryEvidence: normalizeHandoffLaboratoryEvidence(
      item.laboratoryEvidence ?? item.laboratory_evidence ?? [],
    ),
    laboratoryEvidenceConfirmed: (
      item.laboratoryEvidenceConfirmed ?? item.laboratory_evidence_confirmed
    ) === true,
  };
}

export function serviceHandoff(program, handoffs = []) {
  return (handoffs || []).find((item) => item?.program === program) || null;
}

export function serviceSchedule(program, schedules = []) {
  const key = servicePurposeKey(program);
  return (schedules || []).find((item) => item?.purposeKey === key) || null;
}

export function serviceNextAction(program, {
  schedules = [],
  serviceReferrals = [],
  serviceHandoffs = [],
} = {}) {
  if (serviceHandoff(program, serviceHandoffs)) return "manage_to_bhc";
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

/**
 * Keep or create a Manage to BHC handoff row for one service. Switching away
 * from manage_to_bhc removes that program's row so drafts never keep stale
 * receiving-BHC / recommendation submissions.
 */
export function applyServiceHandoff(program, action, serviceHandoffs = []) {
  const current = (serviceHandoffs || []).filter((item) => item?.program !== program);
  if (action !== "manage_to_bhc" || !isCarePlanService(program)) return current;
  const existing = serviceHandoff(program, serviceHandoffs);
  return [...current, existing ? mapServiceHandoffRow(existing) : emptyServiceHandoff(program)];
}

export function updateServiceHandoff(program, patch, serviceHandoffs = []) {
  if (!isCarePlanService(program)) return serviceHandoffs || [];
  const existing = serviceHandoff(program, serviceHandoffs) || emptyServiceHandoff(program);
  const receivingBhcId = Object.hasOwn(patch, "receivingBhcId")
    ? String(patch.receivingBhcId ?? "")
    : String(existing.receivingBhcId || "");
  const bhcChanged = receivingBhcId !== String(existing.receivingBhcId || "");
  const next = {
    ...mapServiceHandoffRow(existing),
    receivingBhcId,
    monitoringRecommendation: Object.hasOwn(patch, "monitoringRecommendation")
      ? String(patch.monitoringRecommendation ?? "")
      : String(existing.monitoringRecommendation || ""),
    laboratoryEvidence: Object.hasOwn(patch, "laboratoryEvidence")
      ? normalizeHandoffLaboratoryEvidence(patch.laboratoryEvidence)
      : normalizeHandoffLaboratoryEvidence(existing.laboratoryEvidence),
    laboratoryEvidenceConfirmed: Object.hasOwn(patch, "laboratoryEvidenceConfirmed")
      ? patch.laboratoryEvidenceConfirmed === true
      : (bhcChanged ? false : existing.laboratoryEvidenceConfirmed === true),
  };
  if (bhcChanged && !Object.hasOwn(patch, "laboratoryEvidenceConfirmed")) {
    next.laboratoryEvidenceConfirmed = false;
  }
  return [
    ...(serviceHandoffs || []).filter((item) => item?.program !== program),
    next,
  ];
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

export function pruneServiceHandoffs(serviceHandoffs = [], selectedPrograms = []) {
  const selected = new Set(selectedCarePlanServices(selectedPrograms));
  return (serviceHandoffs || [])
    .filter((item) => selected.has(item?.program))
    .map(mapServiceHandoffRow);
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

/**
 * Restore per-service Manage to BHC rows. Legacy drafts without
 * serviceHandoffs read as no handoffs (next action "none" unless schedule/referral).
 */
export function restoreServiceHandoffs(draftCarePlan, selectedPrograms = []) {
  const draft = draftCarePlan && typeof draftCarePlan === "object" ? draftCarePlan : {};
  const raw = Array.isArray(draft.serviceHandoffs)
    ? draft.serviceHandoffs
    : Array.isArray(draft.service_handoffs)
      ? draft.service_handoffs
      : [];
  return pruneServiceHandoffs(
    raw.map((item) => mapServiceHandoffRow({
      ...item,
      program: item?.program,
    })).filter((item) => isCarePlanService(item.program)),
    selectedPrograms,
  );
}

export function serviceHandoffErrors(serviceHandoffs = [], {
  selectedPrograms = [],
  catchmentBhcIds = null,
} = {}) {
  const errors = {};
  const catchment = catchmentBhcIds == null
    ? null
    : new Set((catchmentBhcIds || []).map((id) => String(id)));
  const active = pruneServiceHandoffs(serviceHandoffs, selectedPrograms);
  for (const handoff of active) {
    const key = `serviceHandoffs.${handoff.program}`;
    if (!text(handoff.receivingBhcId)) {
      errors[`${key}.receivingBhcId`] = "Choose a receiving Barangay Health Center.";
    } else if (catchment && !catchment.has(String(handoff.receivingBhcId))) {
      errors[`${key}.receivingBhcId`] = "Choose a catchment Barangay Health Center.";
    }
    if (!text(handoff.monitoringRecommendation)) {
      errors[`${key}.monitoringRecommendation`] = "Enter a monitoring recommendation.";
    }
    if ((handoff.laboratoryEvidence || []).length > 0 && handoff.laboratoryEvidenceConfirmed !== true) {
      errors[`${key}.laboratoryEvidenceConfirmed`] = "Confirm the selected laboratory evidence before sharing.";
    }
  }
  return errors;
}

export function serviceHandoffsForSave(serviceHandoffs = [], selectedPrograms = []) {
  return pruneServiceHandoffs(serviceHandoffs, selectedPrograms)
    .filter((item) => text(item.receivingBhcId) && text(item.monitoringRecommendation))
    .map((item) => ({
      program: item.program,
      receiving_bhc_id: Number(item.receivingBhcId) || item.receivingBhcId,
      monitoring_recommendation: text(item.monitoringRecommendation),
      laboratoryEvidence: normalizeHandoffLaboratoryEvidence(item.laboratoryEvidence),
      laboratoryEvidenceConfirmed: item.laboratoryEvidenceConfirmed === true,
    }));
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

export function serviceSupportingLabsFor(program, serviceSupportingLabs = []) {
  const row = (serviceSupportingLabs || []).find((item) => item?.program === program);
  return normalizeSupportingLaboratoryTests(
    row?.supportingLaboratoryTests ?? row?.supporting_laboratory_tests ?? [],
  );
}

export function applyServiceSupportingLabs(program, selected, serviceSupportingLabs = []) {
  if (!isCarePlanService(program)) return serviceSupportingLabs || [];
  const tests = normalizeSupportingLaboratoryTests(selected);
  const rest = (serviceSupportingLabs || []).filter((item) => item?.program !== program);
  if (tests.length === 0) return rest;
  return [...rest, { program, supportingLaboratoryTests: tests }];
}

export function pruneServiceSupportingLabs(serviceSupportingLabs = [], selectedPrograms = []) {
  const selected = new Set(selectedCarePlanServices(selectedPrograms));
  return (serviceSupportingLabs || [])
    .filter((item) => selected.has(item?.program))
    .map((item) => ({
      program: item.program,
      supportingLaboratoryTests: normalizeSupportingLaboratoryTests(
        item.supportingLaboratoryTests ?? item.supporting_laboratory_tests ?? [],
      ),
    }))
    .filter((item) => item.supportingLaboratoryTests.length > 0);
}

/**
 * Legacy drafts without serviceSupportingLabs restore as no selections.
 */
export function restoreServiceSupportingLabs(draftCarePlan, selectedPrograms = []) {
  const draft = draftCarePlan && typeof draftCarePlan === "object" ? draftCarePlan : {};
  const raw = Array.isArray(draft.serviceSupportingLabs)
    ? draft.serviceSupportingLabs
    : Array.isArray(draft.service_supporting_labs)
      ? draft.service_supporting_labs
      : [];
  return pruneServiceSupportingLabs(
    raw.map((item) => ({
      program: item?.program,
      supportingLaboratoryTests: item?.supportingLaboratoryTests ?? item?.supporting_laboratory_tests ?? [],
    })).filter((item) => isCarePlanService(item.program)),
    selectedPrograms,
  );
}

export function serviceSupportingLabsForSave(serviceSupportingLabs = [], selectedPrograms = []) {
  return pruneServiceSupportingLabs(serviceSupportingLabs, selectedPrograms).map((item) => ({
    program: item.program,
    supporting_laboratory_tests: item.supportingLaboratoryTests,
  }));
}

export { isScheduledServiceFollowUp, serviceFollowUpProgram, servicePurposeKey, VISIT_PURPOSE_KEY };
