import { programReviewRows } from "../../utils/consultationReview";
import { Button } from "../../components/ui/button";
import ReferralFacilityField from "../../components/features/health-records/ReferralFacilityField";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ClipboardList,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "../../components/features/health-records/wizard/consultation-ehr.css";
import {
  ConnectionIssueModal,
  NoticeModal,
  SuccessModal,
} from "../../components/common";
import { DatePickerField } from "../../components/common/forms/DatePickerField";
import DispensedMedicinesSection from "../../components/features/medicine/DispensedMedicinesSection";
import healthRecordService, {
  getHealthRecordById,
  getHealthRecordsByPatient,
} from "../../services/healthRecordService";
import {
  transitionDraft,
  discardHealthRecordDraft,
  getHealthRecordDraft,
  listHealthRecordDrafts,
} from "../../services/healthRecordDraftService";
import {
  deleteLocalDraft,
  isLocalDraftVaultAvailable,
  listLocalDrafts,
} from "../../services/localDraftVault";
import useDraftAutosave from "../../hooks/useDraftAutosave";
import { isNoProviderAvailableError } from "../../services/referrals";
import {
  ATTENTION_LEVELS,
  DEFAULT_ATTENTION,
  normalizeAttention,
} from "../../utils/referralAttention";
import { formatDisplayTime } from "../../utils/healthRecordPrograms";
import {
  FP_CLIENT_TYPE_OPTIONS,
  FP_SOURCE_OPTIONS,
  PREVIOUS_FP_METHOD_OPTIONS,
  getApplicableFpMethods,
  getFpMethodRestriction,
} from "../../utils/familyPlanning";
import { calculateBmi, formatBmi, getBmiCategory } from "../../utils/bmi";
import UnfinishedConsultationModal from "../../components/features/health-records/UnfinishedConsultationModal";
import {
  locationToPath,
} from "../../utils/profileNavigation";
import { PROGRAM_CLASSIFICATIONS, getConsultationPrograms, getPrimaryProgram, restoredClassification, toggleConsultationProgram } from "../../utils/consultationPrograms";
import {
  MATERNAL_LAB_TEST_KEYS,
  MATERNAL_LAB_TESTS,
  MATERNAL_RISK_GROUPS,
  PRENATAL_IMMUNIZATION_OPTIONS,
  applyRiskFactorChange,
  thisVisitDoseEntry,
} from "../../utils/prenatalForm";
import {
  localConsultationKey,
} from "../../utils/savedDrafts";
import ImmunizationVisitFields from "../../components/features/health-records/ImmunizationVisitFields";
import { RadioChoiceGroup } from "../../components/features/health-records/fields/ClinicalFields";
import CarePlanSection from "../../components/features/health-records/wizard/CarePlanSection";
import MonitoringDetailsForms from "../../components/features/health-records/wizard/MonitoringDetailsForms";
import ConsultationBackgroundCard from "../../components/features/health-records/wizard/ConsultationBackgroundCard";
import BackgroundConflictPanel from "../../components/features/health-records/wizard/BackgroundConflictPanel";
import {
  BACKGROUND_SECTION_LABELS,
  backgroundChangeRows,
  editedSectionKeys,
  readBackgroundConflicts,
  resolveBackgroundConflicts,
  toRecordBackgroundUpdate,
} from "../../utils/backgroundUpdate";
import {
  buildCarePlanPayload,
  buildReferralReason,
  carePlanFor,
  deriveDisposition,
  monitoredConditionKeys,
  validateCarePlan,
} from "../../utils/carePlan";
import { monitoringDetailKeys as getMonitoringDetailKeys } from "../../utils/monitoringDetails";
import {
  carePlanDraftPayload,
  carePlanFollowUpErrors,
  carePlanReviewRows,
  continuedVisitLink,
  followUpPlan,
  nextPhaseBackTarget,
  nextPhaseForwardTarget,
  restoreCarePlanDraft,
  reviewBackTarget,
  setMonitoringStop,
  shouldRegenerateReferralReason,
} from "../../utils/carePlanWorkspace";
import {
  activeMonitoringsFromOverview,
  droppedContinuedCareNotice,
  keepStopsFor,
  resolveContinuedCare,
  tbPrefillRecordId,
} from "../../utils/continuedCare";
import { getCareOverview } from "../../services/careOverviewService";
import {
  NextActionStep,
  ConsultationReviewStep,
} from "../../components/features/health-records/wizard/HealthRecordWizardSteps";
import ConsultationProgramPanel from "../../components/features/health-records/wizard/ConsultationProgramPanel";
import BodyPreviewPanel, { BodyFindingsList } from "../../components/features/health-records/wizard/BodyPreviewPanel";
import { formatBodyFindings, normalizeBodyFindings } from "../../utils/bodyFindings";
import DiagnosisListField from "../../components/features/health-records/wizard/DiagnosisListField";
import MonitoredConditionsNote from "../../components/features/health-records/wizard/MonitoredConditionsNote";
import { formatDiagnoses, joinDiagnosisNames, restoreDiagnoses } from "../../utils/diagnoses";
import { applyLegacyReportingStatus, deriveReportingStatus, setDiagnosisReportAs } from "../../utils/diagnosisReporting";
import useClinicalRegistry from "../../hooks/useClinicalRegistry";
import {
  ConsultationActionBar,
  ConsultationStepHeading,
  ConsultationWorkspaceBody,
} from "../../components/features/health-records/wizard/ConsultationWorkflow";
import {
  ASSESSMENT_STEP,
  INTERVIEW_STEP,
  MONITORING_STEP,
  NEXT_STEP,
  PROGRAMS_STEP,
  REVIEW_STEP,
  EXIT_STEP,
  buildConsultationSteps,
  findFirstErrorStepKey,
  getErrorOwnerStepKey,
  getFormSequence,
  getGlobalStepKey,
  getNextStepKey,
  getPreviousStepKey,
  getServiceFormReturnTarget,
  getProgramFormSteps,
  getStepOrder,
  pickErrorsForStep,
  programStepKey,
  resolveFormStep,
  resolveRestoredPosition,
  resolveStepHeading,
} from "../../utils/consultationSteps";
import {
  EMPTY_TB_DATA,
  normalizeTbData,
} from "../../components/features/health-records/TbTreatmentCardForm";
import {
  BHC_MEDICINES_UPDATED_EVENT,
  getBhcMedicines,
  loadMedicineAvailability,
  refreshRhuMedicines,
} from "../../services/medicineService";
import { getBhcPatientById } from "../../services/patientService";
import { isConnectionError } from "../../services/apiClient";
import { getCurrentUser } from "../../utils/auth";
import {
  compileEpiHistory,
  getEpiCode,
  getEpiCompletionState,
} from "../../utils/epiTracking";
import {
  formatDisplayValue,
  formatFacilityName,
  formatLongDate,
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { createIdempotencyKey } from "../../utils/idempotency";
import { resolveBhcConsultationRoute } from "../../utils/consultationRoute";
import { validateFbs } from "../../utils/fbs";
import {
  adoptConsultationUuid,
  ensureConsultationUuid,
} from "../../utils/consultationIdentity";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../../utils/sessionPrivacy";

/* ═══════════════════════════════════════════════════════════════
   KEYFRAMES
   ═══════════════════════════════════════════════════════════════ */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes subtlePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    50%      { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.08); }
  }
  @keyframes dropIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up    { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-pulse-next { animation: subtlePulse 2.2s ease-in-out infinite; }
  .anim-drop-in    { animation: dropIn 0.18s cubic-bezier(0.22,1,0.36,1) both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

// The one card every consultation step sits in.
// Flat stack: each section inside it is its own bordered card (FormSection).
const CONSULTATION_CARD_CLASS = "space-y-4";


const WIZARD_FORM = "form";
const WIZARD_NEXT = "next";
const WIZARD_REVIEW = "review";
// Step "phase" (from utils/consultationSteps) -> this page's wizardPhase.
const WIZARD_PHASE_FOR_STEP = {
  form: WIZARD_FORM,
  next: WIZARD_NEXT,
  review: WIZARD_REVIEW,
};

const HEALTH_RECORD_CONNECTION_LOST_MESSAGE =
  "The server did not confirm this submission. Your form remains available in this tab. Keep this page open, check the patient's recent records, and retry when the connection is stable.";
const DRAFT_SUPPORTED_RECORD_TYPES = new Set([
  "General Consultation",
  "Immunization",
  "Maternal",
  "Family Planning",
  "TB DOTS / TB Monitoring",
]);

function pickDraftFields(source = {}, keys = []) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key] ?? ""]));
}

/**
 * Display copy for the Select Program step. The KEYS are the stored
 * classification values and must not change - only the
 * titles and descriptions shown to the user live here.
 */
const RECORD_TYPE_DETAILS = {
  "General Consultation": {
    title: "General Consultation",
    description: "Common illnesses, checkups, and general complaints.",
    icon: ClipboardList,
  },
  Immunization: {
    title: "Extended Program For Immunization",
    description: "For vaccines, child care, EPI entries, and growth monitoring.",
    icon: ShieldCheck,
  },
  Maternal: {
    title: "Prenatal Care",
    description: "For prenatal, pregnancy, postpartum, and maternal monitoring.",
    icon: HeartPulse,
  },
  "Family Planning": {
    title: "Family Planning",
    description: "Contraceptive counselling and reproductive health.",
    icon: Users,
  },
  "TB DOTS / TB Monitoring": {
    title: "TB DOTS",
    description: "Directly observed treatment for tuberculosis.",
    icon: Syringe,
  },
};

/**
 * The report a diagnosis starts with on this visit: Morbidity on a General
 * Consultation, not reported on a program visit. The worker changes it per
 * diagnosis in its Care Plan row (see utils/diagnosisReporting.js).
 */
function getDefaultReportAs(recordType = "") {
  return normalizeRecordType(recordType) === "General Consultation" ? "morbidity" : null;
}

// Surveillance is flagged per diagnosis (diagnoses[].includeInSurveillance),
// and morbidity / notifiable reads go through
// utils/diagnosisReporting.js - see healthRecordService.js for the same
// consolidation note.

const EMPTY_FAMILY_PLANNING_DATA = {
  clientType: "",
  methodUsed: "",
  previousMethod: "",
  fpVisitType: "",
  source: "",
  dateRegistered: "",
  dateOfVisit: "",
  nextAppointmentDate: "",
  remarks: "",
  actionTaken: "",
  hasClinicalConcern: "No",
  concern: "",
  findings: "",
  adviceGiven: "",
  medicinesSupplies: "",
};

const EMPTY_MATERNAL_DATA = {
  lmp: "",
  pmp: "",
  cycleDuration: "",
  // Actual date of delivery, recorded on a Postpartum visit. Drives the
  // Care & Programs "Postpartum" -> "Completed" transition; EDD alone never
  // does. Optional - a Postpartum visit without it stays "Postpartum" with a
  // "Delivery date not recorded" flag on the patient's Care & Programs tab.
  deliveryDate: "",
  gravida: "",
  para: "",
  term: "",
  preterm: "",
  abortion: "",
  living: "",
  bmi: "",
  // Fetal heart tone, e.g. "140 bpm".
  fht: "",
  treatment: "",
  previousFpMethodUsed: "",
  previousFpMethodOther: "",
  previousPregnancyHistory: [],
  riskAssessment: {
    ageRisk: false,
    heightRisk: false,
    grandMultipara: false,
    // Risk Code D / Risk Code E parents. The condition keys that follow are
    // their children and predate this grouping, so existing records keep
    // rendering unchanged.
    previousPregnancyComplications: false,
    medicalConditions: false,
    previousCs: false,
    recurrentMiscarriageOrStillbirth: false,
    postpartumHemorrhage: false,
    tuberculosis: false,
    heartDisease: false,
    diabetes: false,
    bronchialAsthma: false,
    goiter: false,
    hypertensive: false,
    alcoholUser: false,
    smoker: false,
  },
  laboratoryResults: {
    hemoglobin: "",
    cbc: "",
    hbsag: "",
    bloodType: "",
    hiv: "",
    syphilis: "",
    urinalysis: "",
  },
  // The date each laboratory result above was taken. Kept beside
  // laboratoryResults rather than inside it, so records that stored a plain
  // result string for each test keep reading exactly as before.
  laboratoryResultDates: {
    hemoglobin: "",
    cbc: "",
    hbsag: "",
    bloodType: "",
    hiv: "",
    syphilis: "",
    urinalysis: "",
  },
  // The TT/Td dose given AT THIS VISIT. On save its date is also written into
  // tetanusToxoidStatus / tetanusDiphtheriaStatus under that dose, so the
  // existing TT/Td history and its readers keep working unchanged.
  immunizationThisVisit: {
    type: "",
    doseStatus: "",
    dateGiven: "",
  },
  tetanusToxoidStatus: {
    tt1: "",
    tt2: "",
    tt3: "",
    tt4: "",
    tt5: "",
  },
  // TT and Td are two distinct, separate 5-dose schedules, not a
  // rename/replacement of one another - both are tracked independently.
  tetanusDiphtheriaStatus: {
    td1: "",
    td2: "",
    td3: "",
    td4: "",
    td5: "",
  },
  ultrasound: {
    result: "",
    dateDone: "",
  },
};

// The red sub-heading the prenatal form uses inside a section.
const MATERNAL_EYEBROW_CLASS =
  "mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#DC2626]";
// FieldInput's own input style, for a table cell whose column header labels it.
const MATERNAL_TABLE_INPUT_CLASS =
  "h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

/**
 * OB score components, recorded as separate counts rather than one string.
 *
 * These bind to the maternalData fields the record already stored, so the
 * `tpal` value sent with the record ("term-preterm-abortion-living") keeps
 * being derived from them and no new payload key is introduced.
 */
const OB_SCORE_TPAL_FIELDS = [
  { key: "term", label: "Term" },
  { key: "preterm", label: "Preterm" },
  { key: "abortion", label: "Abortion" },
  { key: "living", label: "Living" },
];

const OB_SCORE_GP_FIELDS = [
  { key: "gravida", label: "Gravida (G)", placeholder: "e.g. 2" },
  { key: "para", label: "Para (P)", placeholder: "e.g. 1" },
];

function toDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function mergeMaternalData(data = {}, fallback = {}) {
  const source = data || {};
  const legacyRiskAssessment = source.riskAssessment || source.medicalHistory || {};
  const previousPregnancyHistory = Array.isArray(
    source.previousPregnancyHistory,
  )
    ? source.previousPregnancyHistory
    : Array.isArray(source.previous_pregnancy_history)
      ? source.previous_pregnancy_history
      : [];
  return {
    ...EMPTY_MATERNAL_DATA,
    ...source,
    lmp: source.lmp || fallback.lmp || "",
    pmp: source.pmp || fallback.pmp || "",
    cycleDuration: source.cycleDuration || fallback.cycleDuration || "",
    gravida: source.gravida || fallback.gravida || "",
    para: source.para || fallback.para || "",
    term: source.term || fallback.term || "",
    preterm: source.preterm || fallback.preterm || "",
    abortion: source.abortion || fallback.abortion || "",
    living: source.living || fallback.living || "",
    bmi: source.bmi || fallback.bmi || "",
    fht: source.fht || fallback.fht || "",
    treatment: source.treatment || fallback.treatment || "",
    previousFpMethodUsed:
      source.previousFpMethodUsed ||
      source.previous_fp_method_used ||
      fallback.previousFpMethodUsed ||
      "",
    previousFpMethodOther:
      source.previousFpMethodOther ||
      source.previous_fp_method_other ||
      fallback.previousFpMethodOther ||
      "",
    previousPregnancyHistory,
    riskAssessment: {
      ...EMPTY_MATERNAL_DATA.riskAssessment,
      ...legacyRiskAssessment,
    },
    laboratoryResults: {
      ...EMPTY_MATERNAL_DATA.laboratoryResults,
      ...(source.laboratoryResults || {}),
    },
    laboratoryResultDates: {
      ...EMPTY_MATERNAL_DATA.laboratoryResultDates,
      ...(source.laboratoryResultDates || {}),
    },
    immunizationThisVisit: {
      ...EMPTY_MATERNAL_DATA.immunizationThisVisit,
      ...(source.immunizationThisVisit || {}),
    },
    tetanusToxoidStatus: {
      ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
      ...(source.tetanus_toxoid_status || {}),
      ...(source.tetanusToxoidStatus || {}),
    },
    tetanusDiphtheriaStatus: {
      ...EMPTY_MATERNAL_DATA.tetanusDiphtheriaStatus,
      ...(source.tetanus_diphtheria_status || {}),
      ...(source.tetanusDiphtheriaStatus || {}),
    },
    ultrasound: {
      ...EMPTY_MATERNAL_DATA.ultrasound,
      ...(source.ultrasound || {}),
    },
  };
}

const EMPTY_IMMUNIZATION_DATA = {
  bcg_vaccine: false,
  hepb_birth: false,
  pentavalent_dose1: false,
  pentavalent_dose2: false,
  pentavalent_dose3: false,
  opv_dose1: false,
  opv_dose2: false,
  opv_dose3: false,
  ipv_dose1: false,
  ipv_dose2: false,
  pcv_dose1: false,
  pcv_dose2: false,
  pcv_dose3: false,
  mmr_dose1: false,
  mmr_dose2: false,
  feeding_status: "",
  vaccineEntries: [],
  vaccinesGiven: [],
  breastfeedingMonitoring: {
    month1: "",
    month2: "",
    month3: "",
    month4: "",
    month5: "",
    month6: "",
  },
};

const ADULT_IMMUNIZATION_MIN_AGE_YEARS = 18;
const CHILD_VACCINE_OPTIONS = [
  "Newborn Screening",
  "CPAB",
  "BCG",
  "HEPA B",
  "OPV 1",
  "OPV 2",
  "OPV 3",
  "PENTA 1",
  "PENTA 2",
  "PENTA 3",
  "PCV 1",
  "PCV 2",
  "PCV 3",
  "IPV 1",
  "IPV 2",
  "MCV 1",
  "MCV 2",
  "HPV",
];
const BREASTFEEDING_MONTHS = [
  { key: "month1", label: "1 Month" },
  { key: "month2", label: "2 Months" },
  { key: "month3", label: "3 Months" },
  { key: "month4", label: "4 Months" },
  { key: "month5", label: "5 Months" },
  { key: "month6", label: "6 Months" },
];
const EMPTY_VACCINE_ENTRY = {
  vaccineName: "",
  customVaccineName: "",
  dose: "",
  dateGiven: "",
  weight: "",
  height: "",
  temperature: "",
  nextScheduleDate: "",
  siteRoute: "",
  reason: "",
  remarks: "",
};

function normalizeRecordType(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase().replace(/[_-]+/g, " ");

  if (!raw) return "";
  if (lower.includes("immun")) return "Immunization";
  if (lower.includes("maternal") || lower.includes("prenatal")) return "Maternal";
  if (lower.includes("family") || lower.includes("planning")) return "Family Planning";
  if (lower.includes("general") || lower.includes("consult")) {
    return "General Consultation";
  }

  return raw;
}

function closeDateTimePopovers() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("akay:datetime-popover-close"));
}

function normalizePatientStatus(status) {
  const value = String(status || "").trim();
  const compact = value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) return "Routine Monitoring";
  if (["routine monitoring", "routine", "monitoring"].includes(compact)) {
    return "Routine Monitoring";
  }
  if (["follow up", "follow up required", "follow up after 2 days"].includes(compact)) {
    return "Follow-up Required";
  }
  if (
    [
      "completed",
      "complete",
      "recovered",
      "closed",
      "no further follow up required",
    ].includes(compact)
  ) {
    return "Completed";
  }
  if (["needs referral", "for referral", "referral"].includes(compact)) {
    return "Routine Monitoring";
  }

  return value || "Routine Monitoring";
}

function calculateAgeInYears(birthdate, referenceDate = new Date()) {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && reference.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function getPatientAgeInYears(patient, referenceDate) {
  if (!patient) return null;
  const birthdate = getEffectivePatientBirthdate(patient);
  const ageFromBirthdate = calculateAgeInYears(birthdate, referenceDate);
  if (ageFromBirthdate !== null) return ageFromBirthdate;

  const ageText = String(patient.age || patient.ageSex || "").trim();
  const ageMatch = ageText.match(/\d+(?:\.\d+)?/);
  return ageMatch ? Number(ageMatch[0]) : null;
}

function getEffectivePatientBirthdate(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const direct =
      source.birthdate ||
      source.birthDate ||
      source.dateOfBirth ||
      source.date_of_birth ||
      source.birth_date ||
      source.dob;
    if (direct) return direct;

    const nested = getEffectivePatientBirthdate(
      source.patient,
      source.patientDetails,
      source.patient_details,
      source.healthRecord?.patient,
      source.health_record?.patient,
      source.originalRecord?.patient,
      source.original_record?.patient,
      source.followUpContext?.patient,
      source.follow_up_context?.patient,
    );
    if (nested) return nested;
  }

  return "";
}

function getImmunizationPatientMode(patient, referenceDate, ...fallbackSources) {
  const birthdate = getEffectivePatientBirthdate(patient, ...fallbackSources);
  const agePatient = birthdate ? { ...(patient || {}), birthdate } : patient;
  const age = getPatientAgeInYears(agePatient, referenceDate);
  if (age === null) return { age: null, mode: "unknown" };
  return {
    age,
    mode: age >= ADULT_IMMUNIZATION_MIN_AGE_YEARS ? "adult" : "child",
  };
}

function getAdultImmunizationMessage(age) {
  const ageText = Number.isFinite(age) ? `${age}` : "18 or more";
  return `Immunization records are intended for child vaccination schedule entries. This patient is recorded as ${ageText} years old. Please choose another classification.`;
}

function getMaternalEligibility(patient) {
  if (patient && isPatientMale(patient)) {
    return {
      eligible: false,
      message:
        "Prenatal Care records are for pregnant clients. This patient is recorded as male.",
    };
  }

  return { eligible: true, message: "" };
}

/**
 * Whether Family Planning may be selected for this patient at all.
 *
 * Sex is deliberately NOT considered here. Condom and NSV are male methods, so
 * blocking the whole classification for a male patient made them unreachable.
 * The sex rule lives on the method instead - see getFpMethodRestriction.
 */
function getFamilyPlanningEligibility(patient, referenceDate) {
  if (!patient) return { eligible: true };

  const age = getPatientAgeInYears(patient, referenceDate);
  if (age !== null && age < 10) {
    return {
      eligible: false,
      message: `Family Planning records are intended for adolescent or adult reproductive health clients. This patient is recorded as ${age} years old. Please choose another classification.`,
    };
  }

  return { eligible: true };
}

function getVaccineEntries(data) {
  const entries = Array.isArray(data?.vaccineEntries)
    ? data.vaccineEntries
    : Array.isArray(data?.vaccinesGiven)
      ? data.vaccinesGiven
      : [];
  return entries.filter((entry) => String(entry?.vaccineName || "").trim());
}

/* ═══════════════════════════════════════════════════════════════
   IMMUNIZATION — CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function ConsultationWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || "rhu";
  const canFinalize = (currentUser?.permissions || []).includes("consultations.finalize");
  const currentUserName = formatUserName(currentUser, "");
  const currentBhcFacilityId = String(
    currentUser?.barangayHealthCenterId ||
      currentUser?.bhcId ||
      currentUser?.facilityId ||
      "",
  ).trim();
  // ---- On-device safety net for an interrupted consultation --------------
  // AKAY stays ONLINE-FIRST. The vault holds only consultations that were
  // already open when the connection dropped, encrypted and scoped to this
  // user. Nothing else - patient search, inventory, referrals, reports - works
  // offline, and nothing else is ever written here.
  const localVaultAvailable = useMemo(() => isLocalDraftVaultAvailable(), []);
  const localDraftOwnerKey = String(currentUser?.id || "");
  const basePath = userRole === "bhc" ? "/bhc" : "/rhu";
  const healthRecordsPath = `${basePath}/health-records`;
  const patientsPath = `${basePath}/patients`;
  const routeContext = resolveBhcConsultationRoute(searchParams);
  // "continue" (Start Consultation modal, Follow-ups "Record Visit") opens the
  // same step-flow New Consultation as "new", then seeds Care Plan from it.
  const opensNewConsultation =
    routeContext.kind === "new" || routeContext.kind === "continue";

  const preselectedPatientId = routeContext.patientId || "";
  const requestedDraftId = routeContext.kind === "draft" ? routeContext.draftId : "";
  const preselectedClassification = normalizeRecordType(
    searchParams.get("serviceType") ||
      searchParams.get("classification") ||
      searchParams.get("category") ||
      searchParams.get("recordType") ||
      searchParams.get("healthRecordType"),
  );
  const isDraftRouteEligible = userRole === "bhc";

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [lastFailedSubmit, setLastFailedSubmit] = useState(null);
  const officialSubmissionRef = useRef(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId);
  // The wizard is a single ordered phase rather than a set of booleans so that
  // "which screen am I on" has exactly one answer. Every entry opens on the form.
  const [wizardPhase, setWizardPhase] = useState(WIZARD_FORM);
  const [consultationMode, setConsultationMode] = useState(
    opensNewConsultation ? "general" : null,
  );
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [primaryProgram, setPrimaryProgram] = useState("");
  // Which screen of the form phase is showing (a program form, Clinical
  // Assessment or Treatment). UI position only - saved in the one draft.
  const [formStep, setFormStep] = useState(
    opensNewConsultation ? INTERVIEW_STEP : "",
  );
  const [correctionNote, setCorrectionNote] = useState("");
  const resumedRouteDraft = useRef("");
  const classificationRef = useRef(null);

  const [dateOfVisit, setDateOfVisit] = useState(
    (() => { const date = new Date(); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); })(),
  );
  const [timeOfVisit, setTimeOfVisit] = useState(
    new Date().toTimeString().split(" ")[0].slice(0, 5),
  );
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [summaryOfPresentIllness, setSummaryOfPresentIllness] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  // Assessment step: structured diagnoses (the `diagnosis` text above is kept
  // as their joined names) and optional longer assessment notes.
  const [diagnoses, setDiagnoses] = useState([]);
  const [assessmentNotes, setAssessmentNotes] = useState("");
  // Physical examination findings. Persisted in the existing monitoring_data
  // JSON column, so no health-record column was added for it.
  const [physicalExam, setPhysicalExam] = useState("");
  // Findings pinned on the assessment step's 2D body preview.
  const [bodyFindings, setBodyFindings] = useState([]);
  // The body preview's input while open: { region, side, anchor, editingId }.
  const [bodyFindingDialog, setBodyFindingDialog] = useState(null);
  // Which side of the body figure is shown: "front" | "back".
  const [bodyPreviewSide, setBodyPreviewSide] = useState("front");
  const [medication, setMedication] = useState("");
  const [attendingStaff, setAttendingStaff] = useState(currentUserName);
  const [consultationNotes, setConsultationNotes] = useState("");
  const [healthRecordType, setHealthRecordType] = useState(
    preselectedClassification ||
      (opensNewConsultation ? "General Consultation" : ""),
  );
  const { registry: clinicalRegistry } = useClinicalRegistry();

  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temp, setTemp] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  // Optional extra measurement. Recorded only - nothing reads it to flag,
  // suggest or alert.
  const [fbs, setFbs] = useState("");

  const [followUpStatus, setFollowUpStatus] = useState("Completed");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  // Care Plan & Next Steps: what this ITR continues (Start Consultation modal)
  // and stops. Names come from care-overview; drafts store ids only.
  const [continuedFollowUpTaskIds, setContinuedFollowUpTaskIds] = useState([]);
  // { id, sourceHealthRecordId } per continued follow-up; the first one's
  // source ITR becomes parent_health_record_id (display/compatibility only).
  const [continuedFollowUps, setContinuedFollowUps] = useState([]);
  const [continuedMonitorings, setContinuedMonitorings] = useState([]);
  // { [monitoringId]: reason } - a key present means "stop this monitoring".
  const [monitoringStops, setMonitoringStops] = useState({});
  // Every active monitoring record of this patient (care-overview, Task 10),
  // selected or not - only used to note "Already monitored at BHC" on a row.
  const [activeMonitorings, setActiveMonitorings] = useState([]);
  // The Next phase has two screens: Care Plan & Next Steps, then Monitoring
  // Details when a monitored condition needs it. UI position only.
  const [nextScreen, setNextScreen] = useState(NEXT_STEP);
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [patientCondition, setPatientCondition] = useState("Improving");
  const [needsReferral, setNeedsReferral] = useState(false);
  // Same server-backed source the BHC dashboard and CreateReferral use.
  const [receivingRhuId, setReceivingRhuId] = useState("");
  const [referralForm, setReferralForm] = useState({
    receivingFacility: "",
    urgencyLevel: DEFAULT_ATTENTION,
    dateOfReferral: toDateInputValue(),
    timeOfReferral: toTimeInputValue(),
    referringHci: "",
    philHealthNumber: "",
    referringPractitioner: currentUserName,
    patientName: "",
    birthDate: "",
    address: "",
    ageSexCivilStatus: "",
    philHealthCategory: "",
    chiefComplaint: "",
    initialDiagnosis: "",
    initialActionsTaken: "",
    reasonForReferral: "",
    clinicalSummary: "",
  });

  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [bhcMedicineInventory, setBhcMedicineInventory] = useState([]);
  const [bhcMedicineInventoryLoading, setBhcMedicineInventoryLoading] =
    useState(false);
  const [bhcMedicineInventoryError, setBhcMedicineInventoryError] =
    useState("");
  const [bhcMedicineInventoryReloadKey, setBhcMedicineInventoryReloadKey] =
    useState(0);
  const [dispensedMedicines, setDispensedMedicines] = useState([]);
  const [
    hasPendingDispensedMedicineDraft,
    setHasPendingDispensedMedicineDraft,
  ] = useState(false);
  const [healthRecordDrafts, setHealthRecordDrafts] = useState([]);
  const [draftListLoading, setDraftListLoading] = useState(isDraftRouteEligible);
  const [, setDraftListError] = useState("");
  const [draftResumingId, setDraftResumingId] = useState("");
  // Set only when starting a New Consultation would duplicate an unfinished
  // draft for the same patient; page entry itself is never blocked.
  const [draftDecision, setDraftDecision] = useState(null);
  const [draftDecisionBusy, setDraftDecisionBusy] = useState(false);
  const [draftDecisionError, setDraftDecisionError] = useState("");
  const [activeDraft, setActiveDraft] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftMedicineWarnings, setDraftMedicineWarnings] = useState([]);
  // The stable identity of THIS consultation, from route entry to the official
  // record: carried by the server draft, the encrypted device copy, and the
  // final health record. Minted once when the workspace opens;
  // adopted (never re-minted) on resume or recovery; cleared only when this
  // consultation ends - saved, discarded, or abandoned for another patient.
  // Distinct from idempotencyKey, which names one final-save ATTEMPT.
  const [consultationUuid, setConsultationUuid] = useState(() =>
    opensNewConsultation ? ensureConsultationUuid("") : "",
  );
  // Encrypted on-device consultations belonging to this user are still loaded
  // for route-scoped recovery after a refresh, close, or restart.
  const [, setLocalDrafts] = useState([]);
  const [, setLocalDraftsLoading] = useState(false);
  const [localRecovery, setLocalRecovery] = useState(null);
  // True from recovering that copy until the server confirms it. It tells
  // autosave the restored form is NEWER than the server draft, so the content
  // is pushed up instead of being mistaken for an already-saved baseline.
  const [pendingLocalSync, setPendingLocalSync] = useState(false);
  // Which offline transition the midwife has already dismissed, so the
  // Connection Lost modal shows once per drop instead of on every retry.
  const [dismissedOfflineEpoch, setDismissedOfflineEpoch] = useState(0);
  const [offlineRetryNotice, setOfflineRetryNotice] = useState("");

  const loadHealthRecordDrafts = useCallback(async () => {
    if (!isDraftRouteEligible) return;
    setDraftListLoading(true);
    setDraftListError("");
    try {
      setHealthRecordDrafts(await listHealthRecordDrafts());
    } catch (error) {
      // Server drafts only. The drawer still lists on-device drafts, so this
      // never becomes the whole state of Saved Drafts.
      setDraftListError(
        isConnectionError(error)
          ? typeof navigator !== "undefined" && navigator.onLine === false
            ? "Server drafts are unavailable while offline. Showing drafts saved on this device."
            : "Server drafts could not be loaded. Showing drafts saved on this device."
          : error?.message || "Unable to load server drafts right now.",
      );
    } finally {
      setDraftListLoading(false);
    }
  }, [isDraftRouteEligible]);

  // Reads the encrypted vault. Needs no connection, so it runs on every entry
  // and alongside every server refresh.
  const loadLocalDrafts = useCallback(async () => {
    if (!isDraftRouteEligible || !localVaultAvailable || !localDraftOwnerKey) {
      setLocalDrafts([]);
      return [];
    }
    setLocalDraftsLoading(true);
    try {
      const entries = await listLocalDrafts(localDraftOwnerKey);
      setLocalDrafts(entries);
      return entries;
    } catch {
      // An unreadable vault is treated as empty; nothing is fabricated.
      setLocalDrafts([]);
      return [];
    } finally {
      setLocalDraftsLoading(false);
    }
  }, [isDraftRouteEligible, localVaultAvailable, localDraftOwnerKey]);

  useEffect(() => {
    void loadHealthRecordDrafts();
  }, [loadHealthRecordDrafts]);

  useEffect(() => {
    void loadLocalDrafts();
  }, [loadLocalDrafts]);

  const draftConflictCheckedRef = useRef(false);
  useEffect(() => {
    if (
      draftConflictCheckedRef.current ||
      !opensNewConsultation ||
      draftListLoading ||
      !selectedPatientId
    ) {
      return;
    }
    draftConflictCheckedRef.current = true;
    const conflicting = [...healthRecordDrafts]
      .filter(
        (draft) =>
          String(draft.patient?.id || "") === String(selectedPatientId) &&
          draft.id !== activeDraft?.id,
      )
      .sort((a, b) => new Date(b.lastSavedAt) - new Date(a.lastSavedAt))[0];
    if (conflicting) {
      setDraftDecisionError("");
      setDraftDecision(conflicting);
    }
  }, [
    activeDraft?.id,
    draftListLoading,
    healthRecordDrafts,
    opensNewConsultation,
    selectedPatientId,
  ]);

  useEffect(() => {
    function clearInMemorySubmissionState() {
      officialSubmissionRef.current = null;
      setConsultationUuid("");
      setLastFailedSubmit(null);
      setConnectionIssue(null);
      setHealthRecordDrafts([]);
      setActiveDraft(null);
      setDraftSavedAt("");
      setDraftMedicineWarnings([]);
    }

    window.addEventListener(
      SENSITIVE_SESSION_CLEARED_EVENT,
      clearInMemorySubmissionState,
    );
    return () =>
      window.removeEventListener(
        SENSITIVE_SESSION_CLEARED_EVENT,
        clearInMemorySubmissionState,
      );
  }, []);
  const [familyPlanningData, setFamilyPlanningData] = useState(
    EMPTY_FAMILY_PLANNING_DATA,
  );
  const [tbData, setTbData] = useState(EMPTY_TB_DATA);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");

  const [immunizationData, setImmunizationData] = useState(
    EMPTY_IMMUNIZATION_DATA,
  );
  const [epiHistoryRecords, setEpiHistoryRecords] = useState([]);
  const [epiHistoryLoading, setEpiHistoryLoading] = useState(false);
  const [epiHistoryError, setEpiHistoryError] = useState("");

  // DOC-14 is computed by the server; the client only mirrors it.
  const noProviderMessage =
    "The receiving Rural Health Unit has no available doctor right now. This referral cannot be submitted until the RHU marks a doctor available.";


  useEffect(() => {
    if (routeContext.kind === "redirect") {
      navigate(patientsPath, { replace: true });
    }
  }, [navigate, patientsPath, routeContext.kind]);

  useEffect(() => {
    let active = true;

    function getScopedBhcMedicines(medicines = []) {
      return medicines.filter((item) => {
        if (item.ruralHealthUnitId) return false;
        const itemBhcId = String(
          item.barangayHealthCenterId ||
            item.barangay_health_center_id ||
            item.bhcId ||
            "",
        ).trim();
        return !currentBhcFacilityId || !itemBhcId || itemBhcId === currentBhcFacilityId;
      });
    }

    async function loadMedicines() {
      setBhcMedicineInventoryLoading(true);
      setBhcMedicineInventoryError("");

      try {
        const medicines = await loadMedicineAvailability();
        if (active) {
          setBhcMedicineInventory(getScopedBhcMedicines(medicines));
        }
      } catch (error) {
        if (active) {
          setBhcMedicineInventoryError(
            isConnectionError(error)
              ? "Unable to load BHC inventory. Please check your connection and try again."
              : error?.message ||
                  "Unable to load BHC inventory. Please check your connection and try again.",
          );
        }
      } finally {
        if (active) setBhcMedicineInventoryLoading(false);
      }
    }

    function syncFromCache() {
      setBhcMedicineInventory(getScopedBhcMedicines(getBhcMedicines()));
    }

    syncFromCache();
    loadMedicines();
    window.addEventListener(BHC_MEDICINES_UPDATED_EVENT, syncFromCache);

    return () => {
      active = false;
      window.removeEventListener(BHC_MEDICINES_UPDATED_EVENT, syncFromCache);
    };
  }, [bhcMedicineInventoryReloadKey, currentBhcFacilityId]);

  useEffect(() => {
    if (currentUserName && !attendingStaff) {
      setAttendingStaff(currentUserName);
    }
  }, [currentUserName, attendingStaff]);

  const { data: selectedPatientDetails, isLoading: selectedPatientLoading } = useQuery({
    queryKey: ["consultation-selected-patient", selectedPatientId],
    queryFn: () => getBhcPatientById(selectedPatientId),
    enabled: Boolean(selectedPatientId),
  });
  const selectedPatient = selectedPatientDetails || null;

  // Patient Background (Patient Interview): the only place it is edited.
  // Edits are staged here and in the draft, and applied with the finalized
  // record - see docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
  // Without clinical.history the card is locked and nothing is staged.
  const canViewBackground = (currentUser?.permissions || []).includes("clinical.history");
  const [backgroundUpdate, setBackgroundUpdate] = useState(null);
  const [backgroundExpanded, setBackgroundExpanded] = useState(false);
  // The 409 conflicts from the last save, until the clinician applies a choice per section.
  const [backgroundConflicts, setBackgroundConflicts] = useState(null);

  const normalizedHealthRecordType = normalizeRecordType(healthRecordType);
  const recordTypeKey = normalizedHealthRecordType.toLowerCase();
  const isImmunization = recordTypeKey === "immunization" || selectedPrograms.includes("EPI");
  const isMaternal = recordTypeKey === "maternal" || selectedPrograms.includes("Maternal");
  const isFamilyPlanning = recordTypeKey === "family planning" || selectedPrograms.includes("Family Planning");
  // Care Plan & Next Steps, derived from the per-diagnosis plans and the
  // continued/stopped monitoring (rules in utils/carePlan.js).
  const carePlanDisposition = useMemo(
    () => deriveDisposition({
      diagnoses, continuedMonitorings, stops: monitoringStops, registry: clinicalRegistry,
      serviceNeedsNextVisit: isImmunization,
    }),
    [diagnoses, continuedMonitorings, monitoringStops, clinicalRegistry, isImmunization],
  );
  const monitoringDetailKeys = useMemo(
    () => getMonitoringDetailKeys(
      monitoredConditionKeys(diagnoses, continuedMonitorings, monitoringStops, clinicalRegistry),
      clinicalRegistry,
    ),
    [diagnoses, continuedMonitorings, monitoringStops, clinicalRegistry],
  );
  // Whether the visit's follow-up survives a referral, and whether its fields
  // show. A service visit (programs selected, and sent - see the payload's
  // consultationMode guard) keeps its dated next visit through a referral.
  const carePlanHasService = Boolean(consultationMode) && selectedPrograms.length > 0;
  const carePlanFollowUp = followUpPlan(carePlanDisposition, followUpDate, { hasService: carePlanHasService });
  const patientGateLocked = !selectedPatientId;

  // ---- Step-based consultation -------------------------------------------
  // Every consultation (new, continued or resumed) walks Interview -> Vital
  // Signs -> Clinical Assessment -> one screen per selected program (primary
  // first; skipped when none) -> Treatment & Management -> Care Plan & Next
  // Steps (-> Monitoring Details) -> Review & Save - see utils/consultationSteps.
  // A TB record is one carrying TB-DOTS data: a visit monitoring a condition
  // whose Monitoring Details include the TB card.
  const isTb = monitoringDetailKeys.includes("tb_dots");
  // What this visit reports: the Assessment step's per-diagnosis choices.
  // The server re-derives the same value from the diagnoses on save.
  const effectiveReportingStatus = deriveReportingStatus(diagnoses);
  const defaultReportAs = getDefaultReportAs(normalizedHealthRecordType);
  const consultationSteps = useMemo(
    () => buildConsultationSteps({ monitoringDetailKeys }),
    [monitoringDetailKeys],
  );
  // The service forms. They are a detour opened from Patient Interview (or
  // Review's Edit), not part of Next / Previous.
  const programFormSteps = useMemo(
    () => getProgramFormSteps(selectedPrograms, primaryProgram),
    [selectedPrograms, primaryProgram],
  );
  const formSequence = getFormSequence();
  const stepOrder = getStepOrder(programFormSteps, monitoringDetailKeys);
  const activeFormStep = resolveFormStep(formStep, formSequence, programFormSteps);
  // Where the open service form was launched from, so finishing it goes back
  // there: the first step (the hub) or Review.
  const [serviceFormOrigin, setServiceFormOrigin] = useState(INTERVIEW_STEP);
  // Interview, Vital Signs, Clinical Assessment, each program form, and
  // Treatment are all screens of the one form phase; formStep says which.
  const currentStepKey =
    wizardPhase === WIZARD_FORM
      ? activeFormStep
      : wizardPhase === WIZARD_NEXT
        ? nextScreen
        : wizardPhase === WIZARD_REVIEW
          ? REVIEW_STEP
          : "";
  const currentGlobalStepKey = getGlobalStepKey(currentStepKey);

  // Monitoring Details disappears when nothing monitored needs it any more.
  useEffect(() => {
    if (monitoringDetailKeys.length === 0 && nextScreen === MONITORING_STEP) {
      setNextScreen(NEXT_STEP);
    }
  }, [monitoringDetailKeys.length, nextScreen]);

  // The visit-level needsReferral / followUpStatus every existing save rule,
  // reader and draft uses are derived from the care plan.
  useEffect(() => {
    if (needsReferral !== carePlanDisposition.needsReferral) {
      setNeedsReferral(carePlanDisposition.needsReferral);
    }
    const derivedStatus = followUpDate ? "Follow-up Required" : "Completed";
    if (followUpStatus !== derivedStatus) setFollowUpStatus(derivedStatus);
  }, [carePlanDisposition.needsReferral, needsReferral, followUpDate, followUpStatus]);

  // Pre-fill the referral reason ("Referred for: ...") from the diagnoses
  // referred, and keep it in step when that set changes - but only while the
  // text is empty or still exactly the last pre-fill. Once the worker edits it
  // (or it came back from a draft) it is never overwritten.
  const lastAutoReferralReasonRef = useRef("");
  const currentReferralReason = referralForm.reasonForReferral || "";
  useEffect(() => {
    if (!carePlanDisposition.needsReferral) return;
    const next = buildReferralReason(diagnoses, continuedMonitorings, clinicalRegistry);
    if (!shouldRegenerateReferralReason({
      current: currentReferralReason,
      lastAuto: lastAutoReferralReasonRef.current,
      next,
    })) return;
    lastAutoReferralReasonRef.current = next;
    setReferralForm((prev) => ({ ...prev, reasonForReferral: next }));
  }, [carePlanDisposition.needsReferral, diagnoses, continuedMonitorings, clinicalRegistry, currentReferralReason]);

  const activeProgramStep =
    programFormSteps.find((step) => step.key === activeFormStep) || null;
  // Each program's own fields render only on its own step.
  const showProgramBlock = (classification) =>
    wizardPhase === WIZARD_FORM &&
    activeFormStep === programStepKey(classification);
  const selectedPatientIsMale = isPatientMale(selectedPatient);
  const selectedPatientSexMissing =
    Boolean(selectedPatientId) &&
    !hasPatientSex(selectedPatient);
  const showMaternalPatientWarning = isMaternal && selectedPatientSexMissing;
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
  const showFollowUpMonitoringFields =
    normalizedPatientStatus === "Follow-up Required" && !needsReferral;
  const immunizationPatientInfo = getImmunizationPatientMode(
    selectedPatient,
    dateOfVisit,
  );
  // Sex restricts the METHOD, not the classification: a male client can be
  // recorded under Condom or NSV, but not under a female-only method.
  const applicableFamilyPlanningMethods = getApplicableFpMethods(
    PREVIOUS_FP_METHOD_OPTIONS,
    { isMale: selectedPatientIsMale },
  );
  const familyPlanningMethodRestriction = getFpMethodRestriction({
    method: familyPlanningData.methodUsed,
    isMale: selectedPatientIsMale,
  });
  const familyPlanningEligibility = getFamilyPlanningEligibility(
    selectedPatient,
    dateOfVisit,
  );
  const immunizationVaccineEntries = getVaccineEntries(immunizationData);
  const epiHistoryByCode = useMemo(
    () =>
      compileEpiHistory(epiHistoryRecords),
    [epiHistoryRecords],
  );
  const epiCompletion = useMemo(
    () => getEpiCompletionState(epiHistoryByCode, immunizationVaccineEntries),
    [epiHistoryByCode, immunizationVaccineEntries],
  );
  const epiWillComplete = isImmunization && epiCompletion.completeAfterSave;
  const epiNeedsNextFollowUp =
    isImmunization && !needsReferral && !epiWillComplete;
  const canSaveCurrentDraft =
    (activeDraft?.reviewState !== "review" || (canFinalize && (currentUser?.permissions || []).includes("records.correct"))) &&
    isDraftRouteEligible &&
    Boolean(selectedPatientId) &&
    DRAFT_SUPPORTED_RECORD_TYPES.has(normalizedHealthRecordType) &&
    !saveSuccess && Boolean(consultationUuid);

  function handleDispensedMedicinesChange(nextMedicines) {
    setDispensedMedicines(nextMedicines);
    setDraftMedicineWarnings([]);
  }

  const handlePendingDispensedMedicineChange = useCallback((pending) => {
    setHasPendingDispensedMedicineDraft(pending);
    if (!pending) {
      setValidationErrors((current) => {
        if (!current.dispensedMedicines) return current;
        const next = { ...current };
        delete next.dispensedMedicines;
        return next;
      });
    }
  }, []);

  function buildHealthRecordDraftPayload() {
    return {
      receivingRhuId,
      // Rides in the payload so the encrypted device copy carries the same
      // identity as the server draft. Omitted rather than sent empty.
      ...(consultationUuid ? { consultationUuid } : {}),
      selectedPrograms,
      primaryProgram,
      consultationMode,
      // Review & Save has no phase of its own in a draft; it resumes on Next Step.
      wizardPhase,
      // The exact screen the user is on, so a resumed or recovered draft
      // opens there. Never a new wizardPhase value: the draft allowlist
      // accepts only program / form / next.
      formStep: activeFormStep,
      dateOfVisit,
      timeOfVisit,
      chiefComplaint,
      summaryOfPresentIllness,
      physicalExam,
      bodyFindings,
      diagnosis,
      diagnoses,
      assessmentNotes,
      medication,
      attendingStaff,
      consultationNotes,
      systolicBp,
      diastolicBp,
      temp,
      pulse,
      spo2,
      weight,
      height,
      fbs,
      followUpStatus,
      followUpDate,
      followUpTime,
      followUpReason,
      monitoringNotes,
      patientCondition,
      morbidityReportingStatus: effectiveReportingStatus,
      needsReferral,
      expectedDeliveryDate,
      aog,
      maternalData: {
        ...pickDraftFields(maternalData, [
          "lmp",
          "pmp",
          "cycleDuration",
          "gravida",
          "para",
          "term",
          "preterm",
          "abortion",
          "living",
          "bmi",
          "fht",
          "treatment",
          "previousFpMethodUsed",
          "previousFpMethodOther",
        ]),
        previousPregnancyHistory: Array.isArray(
          maternalData.previousPregnancyHistory,
        )
          ? maternalData.previousPregnancyHistory.map((item) =>
              pickDraftFields(item, [
                "pregnancyNo",
                "placeOfDelivery",
                "year",
                "notes",
              ]),
            )
          : [],
        riskAssessment: pickDraftFields(maternalData.riskAssessment, [
          "ageRisk",
          "heightRisk",
          "grandMultipara",
          // The Risk Code D / E flags themselves, so a resumed draft keeps
          // them too (they were previously dropped from drafts).
          "previousPregnancyComplications",
          "medicalConditions",
          "previousCs",
          "recurrentMiscarriageOrStillbirth",
          "postpartumHemorrhage",
          "tuberculosis",
          "heartDisease",
          "diabetes",
          "bronchialAsthma",
          "goiter",
          "hypertensive",
          "alcoholUser",
          "smoker",
        ]),
        laboratoryResults: pickDraftFields(
          maternalData.laboratoryResults,
          MATERNAL_LAB_TEST_KEYS,
        ),
        laboratoryResultDates: pickDraftFields(
          maternalData.laboratoryResultDates,
          MATERNAL_LAB_TEST_KEYS,
        ),
        immunizationThisVisit: pickDraftFields(
          maternalData.immunizationThisVisit,
          ["type", "doseStatus", "dateGiven"],
        ),
        tetanusToxoidStatus: pickDraftFields(
          maternalData.tetanusToxoidStatus,
          ["tt1", "tt2", "tt3", "tt4", "tt5"],
        ),
        tetanusDiphtheriaStatus: pickDraftFields(
          maternalData.tetanusDiphtheriaStatus,
          ["td1", "td2", "td3", "td4", "td5"],
        ),
        ultrasound: pickDraftFields(maternalData.ultrasound, [
          "result",
          "dateDone",
        ]),
      },
      immunizationData: {
        ...pickDraftFields(immunizationData, [
          "bcg_vaccine",
          "hepb_birth",
          "pentavalent_dose1",
          "pentavalent_dose2",
          "pentavalent_dose3",
          "opv_dose1",
          "opv_dose2",
          "opv_dose3",
          "ipv_dose1",
          "ipv_dose2",
          "pcv_dose1",
          "pcv_dose2",
          "pcv_dose3",
          "mmr_dose1",
          "mmr_dose2",
          "feeding_status",
        ]),
        vaccineEntries: getVaccineEntries(immunizationData).map((entry) =>
          pickDraftFields(entry, [
            "vaccineName",
            "customVaccineName",
            "medicineId", "inventoryQuantity", "confirmedGiven",
            "dose",
            "dateGiven",
            "weight",
            "height",
            "temperature",
            "nextScheduleDate",
            "siteRoute",
            "reason",
            "remarks",
          ]),
        ),
        breastfeedingMonitoring: pickDraftFields(
          immunizationData.breastfeedingMonitoring,
          ["month1", "month2", "month3", "month4", "month5", "month6"],
        ),
      },
      familyPlanningData: pickDraftFields(familyPlanningData, [
        "clientType",
        "methodUsed",
        "previousMethod",
        "fpVisitType",
        "source",
        "dateRegistered",
        "dateOfVisit",
        "nextAppointmentDate",
        "remarks",
        "actionTaken",
        "hasClinicalConcern",
        "concern",
        "findings",
        "adviceGiven",
        "medicinesSupplies",
      ]),
      tbData,
      ...(canViewBackground && backgroundUpdate ? { backgroundUpdate } : {}),
      // Ids and stops only; condition names are re-read from care-overview.
      carePlan: carePlanDraftPayload({
        continuedFollowUpTaskIds,
        continuedMonitorings,
        monitoringStops,
      }),
      referralForm: pickDraftFields(referralForm, [
        "urgencyLevel",
        "dateOfReferral",
        "timeOfReferral",
        "referringPractitioner",
        "chiefComplaint",
        "initialDiagnosis",
        "initialActionsTaken",
        "reasonForReferral",
        "clinicalSummary",
      ]),
      dispensedMedicines: dispensedMedicines.map((item) => ({
        medicineId: Number(item.medicineId),
        confirmedGiven: item.confirmedGiven === true,
        quantity: Number(item.quantity),
        remarks: item.remarks || "",
      })),
    };
  }

  // ---- Care overview: what this consultation continues ------------------
  // Read fresh for the patient whenever a consultation opens. From a
  // "continue" route it seeds the Start Consultation selection (once); for a
  // resumed draft it re-hydrates the stored ids (names, registry keys, each
  // follow-up's source ITR) and drops ids that are no longer active, which the
  // server would reject. Either way it lists the patient's active monitoring
  // for Care Plan's "Monitored at BHC" note. A newer load (a draft resumed
  // over a seeded route) supersedes one still in flight.
  const careOverviewRequestRef = useRef(0);
  async function loadContinuedCare(patientId, selection = null) {
    if (!patientId) return;
    const request = ++careOverviewRequestRef.current;
    const isCurrent = () => request === careOverviewRequestRef.current;
    const hasSelection = Boolean(
      selection && (selection.followUpIds.length || selection.monitoringIds.length),
    );
    let overview;
    try {
      overview = await queryClient.fetchQuery({
        queryKey: queryKeys.careOverview(patientId),
        queryFn: () => getCareOverview(patientId),
        staleTime: 0,
      });
    } catch {
      if (isCurrent() && hasSelection) {
        toast.error(
          selection.restored
            ? "Unable to load this patient's follow-ups and monitoring. Continued items show without their condition names until the page is reloaded."
            : "Unable to load this patient's follow-ups and monitoring. This consultation was opened without them.",
          { id: "continued-care-unavailable" },
        );
      }
      return;
    }
    if (!isCurrent()) return;

    setActiveMonitorings(activeMonitoringsFromOverview(overview));
    if (!selection) return;

    const resolved = resolveContinuedCare(overview, {
      followUpIds: selection.followUpIds,
      monitoringIds: selection.monitoringIds,
      includeFollowUpConditions: !selection.restored,
      includeLinkedFollowUps: !selection.restored,
    });
    setContinuedFollowUpTaskIds(resolved.continuedFollowUpTaskIds);
    setContinuedFollowUps(resolved.continuedFollowUps);
    setContinuedMonitorings(resolved.continuedMonitorings);
    setMonitoringStops((current) => keepStopsFor(current, resolved.continuedMonitorings));
    const notice = droppedContinuedCareNotice(resolved);
    if (notice) toast(notice, { id: "continued-care-dropped", duration: 8000 });

    // Continuing TB fills the TB-DOTS card from its last ITR, as the old
    // follow-up form did. A resumed draft keeps the card it saved.
    if (selection.restored) return;
    const tbRecordId = tbPrefillRecordId(
      resolved.continuedMonitorings,
      queryClient.getQueryData(queryKeys.clinicalRegistry()) || clinicalRegistry,
    );
    if (!tbRecordId) return;
    try {
      const record = await getHealthRecordById(tbRecordId);
      if (!isCurrent()) return;
      setTbData((current) =>
        current === EMPTY_TB_DATA ? normalizeTbData(record?.tbData || record?.tb_data) : current,
      );
    } catch {
      // The card simply starts empty.
    }
  }

  function restoreHealthRecordDraft(draft) {
    const payload = draft.payload || {};
    setReceivingRhuId(payload.receivingRhuId || "");
    setSelectedPatientId(draft.patient.id);
    // Adopt the consultation's existing identity - never mint a fresh one for
    // a consultation that already has it. A legacy draft saved before
    // identities existed has none, so it gains one now; the server adopts it
    // on the next save (and never reassigns one that is already set).
    setConsultationUuid(adoptConsultationUuid(draft));
    const restoredPrograms = getConsultationPrograms({ ...payload, classification: draft.classification });
    const restoredPrimary = getPrimaryProgram({ ...payload, classification: draft.classification });
    setHealthRecordType(normalizeRecordType(restoredClassification(draft.classification, restoredPrimary)));
    setSelectedPrograms(restoredPrograms);
    setPrimaryProgram(restoredPrimary);
    setConsultationMode(restoredPrograms.length ? payload.consultationMode || (draft.classification === "General Consultation" ? "general" : "program") : "general");
    setDateOfVisit(payload.dateOfVisit || toDateInputValue());
    setTimeOfVisit(payload.timeOfVisit || toTimeInputValue());
    setChiefComplaint(payload.chiefComplaint || "");
    setSummaryOfPresentIllness(payload.summaryOfPresentIllness || "");
    setPhysicalExam(payload.physicalExam || "");
    setBodyFindings(normalizeBodyFindings(payload.bodyFindings));
    {
      // Drafts from before the structured list keep their typed text: one
      // diagnosis when it fits, otherwise moved to the assessment notes.
      // Drafts from before per-diagnosis reporting carry one visit-level
      // status instead; each diagnosis takes it, keeping what was chosen.
      const restored = restoreDiagnoses(payload);
      setDiagnoses(applyLegacyReportingStatus(restored.diagnoses, payload.morbidityReportingStatus));
      setAssessmentNotes(restored.assessmentNotes);
      setDiagnosis(joinDiagnosisNames(restored.diagnoses));
    }
    setMedication(payload.medication || "");
    setAttendingStaff(payload.attendingStaff || currentUserName);
    setConsultationNotes(payload.consultationNotes || "");
    setSystolicBp(payload.systolicBp || "");
    setDiastolicBp(payload.diastolicBp || "");
    setTemp(payload.temp || "");
    setPulse(payload.pulse || "");
    setSpo2(payload.spo2 || "");
    setWeight(payload.weight || "");
    setHeight(payload.height || "");
    setFbs(payload.fbs === undefined || payload.fbs === null ? "" : String(payload.fbs));
    setFollowUpStatus(payload.followUpStatus || "Routine Monitoring");
    setFollowUpDate(payload.followUpDate || "");
    setFollowUpTime(payload.followUpTime || "");
    setFollowUpReason(payload.followUpReason || "");
    setMonitoringNotes(payload.monitoringNotes || "");
    setPatientCondition(payload.patientCondition || "Improving");
    setNeedsReferral(Boolean(payload.needsReferral));
    setExpectedDeliveryDate(payload.expectedDeliveryDate || "");
    setAog(payload.aog || "");
    setMaternalData(mergeMaternalData(payload.maternalData));
    setImmunizationData({
      ...EMPTY_IMMUNIZATION_DATA,
      ...(payload.immunizationData || {}),
      vaccineEntries: payload.immunizationData?.vaccineEntries || [],
      vaccinesGiven: payload.immunizationData?.vaccineEntries || [],
      breastfeedingMonitoring: {
        ...EMPTY_IMMUNIZATION_DATA.breastfeedingMonitoring,
        ...(payload.immunizationData?.breastfeedingMonitoring || {}),
      },
    });
    setFamilyPlanningData({
      ...EMPTY_FAMILY_PLANNING_DATA,
      ...(payload.familyPlanningData || {}),
    });
    setTbData(normalizeTbData(payload.tbData));
    // The server never sends it to a user without clinical.history.
    setBackgroundUpdate(payload.backgroundUpdate || null);
    setBackgroundConflicts(null);
    setReferralForm((current) => ({
      ...current,
      ...(payload.referralForm || {}),
    }));
    {
      // Names (and each follow-up's source record) are filled in from
      // care-overview once it loads (loadContinuedCare); until then placeholders.
      const restoredCarePlan = restoreCarePlanDraft(payload.carePlan);
      setContinuedFollowUpTaskIds(restoredCarePlan.continuedFollowUpTaskIds);
      setContinuedFollowUps([]);
      setContinuedMonitorings(restoredCarePlan.continuedMonitorings);
      setMonitoringStops(restoredCarePlan.monitoringStops);
      setActiveMonitorings([]);
      setNextScreen(NEXT_STEP);
      void loadContinuedCare(draft.patient.id, {
        followUpIds: restoredCarePlan.continuedFollowUpTaskIds,
        monitoringIds: restoredCarePlan.continuedMonitorings.map((monitoring) => monitoring.id),
        restored: true,
      });
    }

    const warnings = [];
    setDispensedMedicines(
      (draft.medicineSelections || []).map((selection) => {
        if (selection.warning) warnings.push(selection.warning);
        const medicine = selection.medicine;
        return {
          medicineId: String(selection.medicine_id),
          confirmedGiven: payload.dispensedMedicines?.find(item => String(item.medicineId) === String(selection.medicine_id))?.confirmedGiven === true,
          medicineName: medicine?.name || "Unavailable medicine",
          category: medicine?.category || "Unavailable",
          availableStock: medicine?.quantity ?? 0,
          quantity: selection.quantity,
          unit: medicine?.unit || "",
          remarks: selection.remarks || "",
        };
      }),
    );
    setDraftMedicineWarnings(Array.from(new Set(warnings)));
    // A recovered on-device copy may never have reached the server, in which
    // case there is no draft to update yet - autosave must create one.
    setActiveDraft(draft.id ? { id: draft.id, version: draft.version, reviewState: draft.reviewState, returnNote: draft.returnNote } : null);
    setDraftSavedAt(draft.id ? draft.lastSavedAt || "" : "");
    // Restored content matches whatever it was restored from. Recovering an
    // on-device copy sets this back to true right after, because that copy IS
    // ahead of the server; reloading after a conflict deliberately is not.
    setPendingLocalSync(false);
    // Back to the exact screen the user left on - see resolveRestoredPosition.
    const restored = resolveRestoredPosition(payload);
    setWizardPhase(draft.reviewState === "review" ? WIZARD_REVIEW : WIZARD_PHASE_FOR_STEP[restored.phase]);
    setFormStep(draft.reviewState === "review" ? REVIEW_STEP : restored.formStep);
    setValidationErrors({});
  }

  // New / continue routes load the overview once for the route's patient.
  const routeCareLoadedRef = useRef(false);
  useEffect(() => {
    if (routeCareLoadedRef.current || !opensNewConsultation || !preselectedPatientId) return;
    routeCareLoadedRef.current = true;
    void loadContinuedCare(
      preselectedPatientId,
      routeContext.kind === "continue"
        ? { followUpIds: routeContext.followUpIds, monitoringIds: routeContext.monitoringIds }
        : null,
    );
    // Loaded once per opened consultation; a resumed draft runs its own load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opensNewConsultation, preselectedPatientId]);

  const handleDraftAutosaved = useCallback((saved) => {
    setActiveDraft({ id: saved.id, version: saved.version, reviewState: saved.reviewState });
    setDraftSavedAt(saved.lastSavedAt || "");
    // The server has it, so the recovered copy is no longer ahead of it.
    setPendingLocalSync(false);
    setHealthRecordDrafts((current) => [
      saved,
      ...current.filter((item) => item.id !== saved.id),
    ]);
  }, []);

  // In-memory autosave payload: rebuilt each render only while a draft can be
  // saved, and never written to browser storage (privacy requirement).
  const draftAutosavePayload = canSaveCurrentDraft
    ? buildHealthRecordDraftPayload()
    : null;
  // Entering the referral/care-decision sub-steps flushes an immediate save.
  const draftAutosaveSectionKey = `${normalizedHealthRecordType}|${wizardPhase}|${activeFormStep}|${needsReferral}`;
  const draftIdentity = useMemo(
    () =>
      activeDraft
        ? {
            id: activeDraft.id,
            version: activeDraft.version,
            lastSavedAt: draftSavedAt || null,
          }
        : null,
    [activeDraft, draftSavedAt],
  );

  const localDraftIdentity = useMemo(() => {
    if (
      !canSaveCurrentDraft ||
      !localVaultAvailable ||
      !localDraftOwnerKey ||
      !consultationUuid
    ) {
      return null;
    }
    // One slot per CONSULTATION, scoped to this user. Keyed on the stable
    // consultation identity - never the patient - so two consultations for the
    // same patient are two slots and neither can overwrite the other. Nor is
    // it keyed on the server draft id or classification, which can appear or
    // change mid-visit and would orphan the earlier snapshot. With no identity
    // there is no slot: a new slot never falls back to the patient.
    return {
      ownerKey: localDraftOwnerKey,
      consultationKey: localConsultationKey(consultationUuid),
    };
  }, [
    canSaveCurrentDraft,
    localVaultAvailable,
    localDraftOwnerKey,
    consultationUuid,
  ]);

  // Rebuilt on demand at the moment of an offline write. Plain function, not
  // memoized: the hook reads it from a ref refreshed on every render, so it
  // always closes over the newest form state.
  function buildLocalDraftRecord() {
    return {
      draft: {
        id: activeDraft?.id || "",
        consultationUuid,
        version: Number(activeDraft?.version || 0),
        patient: {
          id: String(selectedPatientId || ""),
          label: getPatientName(selectedPatient) || "Patient",
        },
        classification: normalizedHealthRecordType,
        lastSavedAt: draftSavedAt || "",
        payload: buildHealthRecordDraftPayload(),
        // Names are kept for display on recovery only. Stock is re-checked
        // against the server before the official save - see the warning
        // raised by handleRecoverLocalDraft.
        medicineSelections: dispensedMedicines.map((item) => ({
          medicine_id: item.medicineId,
          quantity: item.quantity,
          remarks: item.remarks || "",
          medicine: {
            name: item.medicineName,
            category: item.category,
            quantity: item.availableStock,
            unit: item.unit,
          },
          warning: "",
        })),
      },
    };
  }

  const draftAutosave = useDraftAutosave({
    enabled: canSaveCurrentDraft,
    patientId: selectedPatientId,
    classification: normalizedHealthRecordType,
    payload: draftAutosavePayload,
    draft: draftIdentity,
    sectionKey: draftAutosaveSectionKey,
    onDraftSaved: handleDraftAutosaved,
    consultationUuid,
    localDraft: localDraftIdentity,
    buildLocalRecord: buildLocalDraftRecord,
    unsyncedRecovery: pendingLocalSync,
  });

  const {
    status: draftAutosaveStatus,
    conflict: draftConflict,
    error: draftAutosaveError,
    localStatus: draftLocalStatus,
    syncStatus: draftSyncStatus,
    offlineEpoch: draftOfflineEpoch,
    saveNow: saveDraftNow,
    flushBeforeLeave: flushDraftBeforeLeave,
    persistLocalNow: protectLocalRecovery,
    completeConsultation: completeDraftRecovery,
    getDraftIdentity,
    resolveConflict: resolveDraftConflict,
    acknowledgeSync: acknowledgeDraftSync,
  } = draftAutosave;

  // Confirmed sync is a one-off confirmation, not a status to live with: a
  // short toast, then nothing. Offline itself is announced once by the
  // Connection Lost dialog and then stays silent while the midwife works.
  useEffect(() => {
    if (draftSyncStatus !== "synced") return;
    toast.success("Saved automatically", { id: "consultation-draft-synced" });
    acknowledgeDraftSync();
  }, [draftSyncStatus, acknowledgeDraftSync]);

  // The Connection Lost dialog interrupts once per drop. A later drop raises a
  // new epoch, so it can appear again - but typing is never interrupted twice
  // for the same outage.
  const connectionLostOpen =
    canSaveCurrentDraft &&
    draftAutosaveStatus === "offline" &&
    draftOfflineEpoch > dismissedOfflineEpoch;

  useEffect(() => {
    if (draftAutosaveStatus !== "offline") setOfflineRetryNotice("");
  }, [draftAutosaveStatus]);

  function dismissConnectionLost() {
    setDismissedOfflineEpoch(draftOfflineEpoch);
    setOfflineRetryNotice("");
  }

  async function handleOfflineDraftRetry() {
    setOfflineRetryNotice("");
    const synced = await saveDraftNow();
    if (!synced) {
      setOfflineRetryNotice(
        "Synchronization has not completed. Keep this page open until your progress is secured.",
      );
    }
  }

  // Offer back a consultation this device kept through a refresh, tab close,
  // or restart. Checked once, and only on a fresh entry - never over an open
  // consultation, which would replace live work with an older snapshot.
  const localRecoveryCheckedRef = useRef(false);
  useEffect(() => {
    if (localRecoveryCheckedRef.current) return undefined;
    if (!isDraftRouteEligible || !localVaultAvailable || !localDraftOwnerKey) {
      return undefined;
    }
    if (!opensNewConsultation || !selectedPatientId) return undefined;
    localRecoveryCheckedRef.current = true;

    let active = true;
    listLocalDrafts(localDraftOwnerKey)
      .then((entries) => {
        if (!active) return;
        const recoverable = entries.find(
          (entry) =>
            String(entry.record?.draft?.patient?.id || "") ===
            String(selectedPatientId),
        );
        if (recoverable) setLocalRecovery(recoverable);
      })
      .catch(() => {
        // An unreadable vault is treated as empty; nothing is fabricated.
      });

    return () => {
      active = false;
    };
  }, [
    isDraftRouteEligible,
    localVaultAvailable,
    localDraftOwnerKey,
    selectedPatientId,
    opensNewConsultation,
  ]);

  /**
   * Reopen an encrypted on-device consultation: the same patient, programs,
   * fields, medicines, and wizard step, continuing the SAME draft. Never
   * creates a second consultation - the restored server draft id (when the
   * copy had one) is what autosave keeps updating.
   */
  function recoverLocalDraft(entry) {
    if (!entry?.record?.draft) return;

    restoreHealthRecordDraft(entry.record.draft);
    // Autosave now treats the restored form as ahead of the server and pushes
    // it up on the next connection; the on-device copy stays until it lands.
    setPendingLocalSync(true);
    setLocalRecovery(null);
    if (entry.record.draft.medicineSelections?.length) {
      setDraftMedicineWarnings((current) => [
        ...current,
        "Medicine availability was not re-checked while this consultation was offline. Confirm stock before saving.",
      ]);
    }
  }

  function handleRecoverLocalDraft() {
    recoverLocalDraft(localRecovery);
  }

  // Deleting unsynced clinical work is irreversible, so it is confirmed on its
  // own. "Keep It" puts the recovery offer back rather than silently dropping.
  function handleDiscardLocalRecovery() {
    const entry = localRecovery;
    setNoticeModal({
      title: "Discard Offline Consultation?",
      message:
        "The consultation kept on this device will be permanently deleted. It never reached the server, so it cannot be recovered afterwards.",
      actions: [
        {
          label: "Delete Permanently",
          variant: "destructive",
          onClick: async () => {
            if (entry?.consultationKey && localDraftOwnerKey) {
              await deleteLocalDraft({
                ownerKey: localDraftOwnerKey,
                consultationKey: entry.consultationKey,
              }).catch(() => {});
            }
            setLocalRecovery(null);
          },
        },
        {
          label: "Keep It",
          variant: "secondary",
          onClick: () => setLocalRecovery(entry),
        },
      ],
    });
  }

  // Non-destructive conflict dialog: never silently overwrite a newer draft.
  useEffect(() => {
    if (!draftConflict) return;
    setNoticeModal({
      title: "Unfinished Consultation Updated Elsewhere",
      message:
        "This unfinished consultation was updated in another tab or device. Reload the latest version (your unsaved edits here will be discarded) or keep editing without saving.",
      actions: [
        {
          label: "Reload Latest",
          onClick: async () => {
            if (draftConflict.draftId) {
              await handleResumeDraft(draftConflict.draftId);
            }
            resolveDraftConflict("reload");
          },
        },
        {
          label: "Keep Editing",
          variant: "secondary",
          onClick: () => resolveDraftConflict("keep"),
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftConflict]);

  // Surface allowlist/validation rejections; the retry loop has already stopped.
  useEffect(() => {
    if (!draftAutosaveError) return;
    if (draftAutosaveError.type === "validation") {
      setValidationErrors((current) => ({
        ...current,
        ...draftAutosaveError.fieldErrors,
      }));
    }
    setNoticeModal({
      title: "Consultation Not Saved",
      message:
        draftAutosaveError.message ||
        "Some entries could not be saved. Your form remains available on this page.",
    });
  }, [draftAutosaveError]);

  // Warn before leaving while unsaved changes are still only in memory.
  useEffect(() => {
    if (!canSaveCurrentDraft || saveSuccess) return undefined;
    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [canSaveCurrentDraft, saveSuccess]);

  // Leaving mid-consultation (sidebar, header links, browser Back) saves the
  // draft first and then goes - no "discard?" prompt, the draft protects the
  // work. Trips to this page's own path (Back from Patient Profile) and View
  // Full Profile itself are exempt: the consultation stays mounted for those.
  const pageLocation = useLocation();
  const bypassLeaveGuardRef = useRef(false);
  const leaveBlocker = useBlocker(
    ({ nextLocation }) =>
      !bypassLeaveGuardRef.current &&
      canSaveCurrentDraft &&
      !saveSuccess &&
      locationToPath(nextLocation) !== locationToPath(pageLocation),
  );
  const leaveBlockerRef = useRef(leaveBlocker);
  useEffect(() => {
    leaveBlockerRef.current = leaveBlocker;
  });

  const [leavingConsultation, setLeavingConsultation] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  async function leaveAndResumeLater() {
    if (leavingConsultation || saving) return;
    setLeavingConsultation(true);
    setLeaveError("");
    try {
      const synced = await flushDraftBeforeLeave();
      if (!synced) {
        const secured = await protectLocalRecovery();
        if (!secured) {
          setLeaveError("Your latest changes could not be saved securely. Keep this page open and reconnect before leaving.");
          return;
        }
        toast("Saved securely on this device; not yet synced. Resume on this device.");
      }
      leaveBlockerRef.current.proceed?.();
    } finally {
      setLeavingConsultation(false);
    }
  }

  useEffect(() => {
    if (!requestedDraftId || !isDraftRouteEligible || resumedRouteDraft.current === requestedDraftId) return;
    resumedRouteDraft.current = requestedDraftId;
    void handleResumeDraft(requestedDraftId);
    // A route draft is restored once; autosave changes must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDraftId, isDraftRouteEligible]);

  async function handleResumeDraft(draftId) {
    if (!draftId || draftResumingId) return;
    setDraftResumingId(draftId);
    try {
      const draft = await getHealthRecordDraft(draftId);
      if (!draft?.patient?.id) {
        setNoticeModal({
          title: "Consultation Patient Missing",
          message:
            "This unfinished consultation has no patient context and cannot be resumed safely.",
          actions: [
            {
              label: "Return to Patients",
              variant: "primary",
              onClick: () => navigate(patientsPath, { replace: true }),
            },
          ],
        });
        return;
      }
      restoreHealthRecordDraft(draft);
    } catch (error) {
      setNoticeModal({
        title: "Unable to Resume Consultation",
        message: isConnectionError(error)
          ? "Unable to reach the server. Please check your connection and try again."
          : error?.message || "This unfinished consultation is no longer available.",
      });
      void loadHealthRecordDrafts();
    } finally {
      setDraftResumingId("");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadEpiHistory() {
      if (!isImmunization || !selectedPatientId) {
        setEpiHistoryRecords([]);
        setEpiHistoryError("");
        setEpiHistoryLoading(false);
        return;
      }

      setEpiHistoryLoading(true);
      setEpiHistoryError("");

      try {
        const records = await getHealthRecordsByPatient(selectedPatientId);
        if (!active) return;
        setEpiHistoryRecords((Array.isArray(records) ? records : []).filter(Boolean));
      } catch (error) {
        if (!active) return;
        setEpiHistoryError(
          isConnectionError(error)
            ? "Unable to load previous EPI history. Please check your connection and try again."
            : error?.message ||
                "Unable to load previous EPI history. Please check your connection and try again.",
        );
      } finally {
        if (active) setEpiHistoryLoading(false);
      }
    }

    loadEpiHistory();

    return () => {
      active = false;
    };
  }, [isImmunization, selectedPatientId]);


  const formattedBp = (() => {
    const sys = systolicBp || "N/A";
    const dia = diastolicBp || "N/A";
    return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
  })();

  const consultationVitalSigns =
    `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | ` +
    `PR: ${pulse || "N/A"} bpm | SpO2: ${spo2 || "N/A"}% | ` +
    `Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;

  /** Assessment-step diagnoses; the plain-text `diagnosis` follows them. */
  function updateDiagnoses(next) {
    setDiagnoses(next);
    setDiagnosis(joinDiagnosisNames(next));
    clearValidationError("diagnosis");
  }

  function clearValidationError(field) {
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function setValidationErrorsAndFocus(errors) {
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, value]) => Boolean(value)),
    );
    setValidationErrors(nextErrors);

    const firstField = Object.keys(nextErrors)[0];
    if (!firstField) return false;

    window.requestAnimationFrame(() => {
      const selector =
        firstField === "dispensedMedicines"
          ? "[data-dispensed-medicines-section]"
          : `[name="${firstField}"], [data-field="${firstField}"]`;
      const element = document.querySelector(selector);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof element?.focus === "function") {
        element.focus({ preventScroll: true });
      }
    });

    return true;
  }

  function getClinicalValidationErrors({ finalizing = canFinalize } = {}) {
    const errors = {};

    for (const [key, value] of Object.entries({ pulse, spo2, weight, height, temp })) {
      if (String(value).trim() && (!Number.isFinite(Number(value)) || (key !== "temp" && Number(value) < 0) || (["weight", "height"].includes(key) && Number(value) === 0) || (key === "spo2" && Number(value) > 100))) errors[key] = "Enter a valid measurement.";
    }
    const fbsError = validateFbs(fbs);
    if (fbsError) errors.fbs = fbsError;
    if (!chiefComplaint.trim()) errors.chiefComplaint = "Chief complaint is required.";
    if (!finalizing) return errors;
    // A follow-up that keeps monitored conditions going already names what it
    // addresses; a referral, or a visit stopping every continued condition, still needs one.
    const followUpOfMonitoring = !needsReferral && continuedMonitorings.some((monitoring) => !Object.hasOwn(monitoringStops, monitoring.id));
    if ((needsReferral || normalizePatientStatus(followUpStatus) === "Follow-up Required") && !diagnosis.trim() && !followUpOfMonitoring) errors.diagnosis = "A suspected case is required for follow-up or referral.";
    if (needsReferral && !receivingRhuId) errors.receivingRhuId = "Receiving facility is required.";
    if (needsReferral && !ATTENTION_LEVELS.includes(referralForm.urgencyLevel)) errors.urgencyLevel = "Referral priority is required.";
    if (needsReferral && !referralForm.reasonForReferral?.trim()) errors.reasonForReferral = "Reason for referral is required.";
    // Care Plan: a stop reason for every monitoring this visit ends, and a
    // reason whenever a kept follow-up has a date (the date is optional and
    // the status follows it, so there is no "date required" case here).
    // validateCarePlan must run before buildCarePlanPayload, which drops
    // blank-reason stops.
    Object.assign(
      errors,
      validateCarePlan({ diagnoses, continuedMonitorings, stops: monitoringStops, registry: clinicalRegistry }),
      carePlanFollowUpErrors({ kept: carePlanFollowUp.kept, followUpDate, followUpReason }),
    );

    if (hasPendingDispensedMedicineDraft) {
      errors.dispensedMedicines =
        'Click "Add Medicine" before saving so this item is included in the visit.';
    }
    if (isImmunization) {
      const preparedEntries = immunizationVaccineEntries.map((entry) => ({
        ...entry,
        dateGiven: entry.dateGiven || dateOfVisit,
      }));
      const duplicateEntry = preparedEntries.find((entry) =>
        epiCompletion.alreadyGivenCodes.has(getEpiCode(entry.vaccineName)),
      );

      if (preparedEntries.length === 0 && !consultationNotes.trim()) {
        errors.vaccineEntries =
          "Select at least one vaccine or enter remarks if no vaccine was given.";
      }
      if (duplicateEntry) {
        errors.vaccineEntries =
          "This vaccine/service was already recorded for this patient.";
      }
      if (!needsReferral && normalizePatientStatus(followUpStatus) === "Follow-up Required" && epiNeedsNextFollowUp && !followUpDate) {
        errors.followUpDate =
          "Next follow-up date is required because there are still remaining EPI vaccines/services.";
      }

    }

    if (isFamilyPlanning) {
      if (!String(familyPlanningData.methodUsed || "").trim()) {
        errors.familyPlanningMethodUsed = "Method used / accepted is required.";
      } else if (familyPlanningMethodRestriction) {
        errors.familyPlanningMethodUsed = familyPlanningMethodRestriction;
      }
    }


    if (isTb) {
      if (!String(tbData.diagnosis.tbCaseNumber || "").trim()) {
        errors["tbData.diagnosis.tbCaseNumber"] = "TB case number is required.";
      }
      if (!String(tbData.phases.intensiveStart || "").trim()) {
        errors["tbData.phases.intensiveStart"] =
          "Intensive phase start date is required.";
      }
    }

    if (!isImmunization && !isFamilyPlanning && !isMaternal && !isTb && !chiefComplaint.trim()) {
      errors.chiefComplaint = "Chief complaint is required.";
    }

    return errors;
  }



  function handleReferralFormChange(field, value) {
    clearValidationError(field);
    setReferralForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    const recordLmp = maternalData.lmp;
    if (!recordLmp) {
      setExpectedDeliveryDate("");
      setAog("");
      return;
    }

    const lmpDate = new Date(recordLmp);
    const visitDate = dateOfVisit ? new Date(dateOfVisit) : new Date();

    if (Number.isNaN(lmpDate.getTime())) {
      setExpectedDeliveryDate("Invalid Date");
      setAog("Invalid Date");
      return;
    }

    const edd = new Date(lmpDate);
    edd.setDate(edd.getDate() + 7);
    edd.setMonth(edd.getMonth() - 3);
    edd.setFullYear(edd.getFullYear() + 1);
    setExpectedDeliveryDate(edd.toISOString().split("T")[0]);

    const timeDiff = visitDate.getTime() - lmpDate.getTime();
    if (timeDiff < 0) {
      setAog("Invalid (LMP is ahead of visit)");
      return;
    }

    const totalDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;

    if (weeks > 42) {
      setAog("Post-term (>42 Weeks)");
      return;
    }

    const weekStr = `${weeks} week${weeks !== 1 ? "s" : ""}`;
    const dayStr = days > 0 ? ` and ${days} day${days > 1 ? "s" : ""}` : "";
    setAog(`${weekStr}${dayStr}`);
  }, [maternalData.lmp, dateOfVisit]);

  useEffect(() => {
    if (!isMaternal || !weight || !height) return;

    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);
    if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight)) return;
    if (parsedWeight <= 0 || parsedHeight <= 0) return;

    const heightInMeters = parsedHeight / 100;
    const nextBmi = (parsedWeight / (heightInMeters * heightInMeters)).toFixed(1);
    setMaternalData((prev) =>
      prev.bmi === nextBmi ? prev : { ...prev, bmi: nextBmi },
    );
  }, [height, isMaternal, weight]);

  function handleBreastfeedingChange(monthKey, value) {
    setImmunizationData((prev) => ({
      ...prev,
      breastfeedingMonitoring: {
        ...(prev.breastfeedingMonitoring || {}),
        [monthKey]: value,
      },
    }));
  }

  function updateVaccineInventory(index, field, value) {
    setImmunizationData(current => {
      const entries = getVaccineEntries(current).map((entry, i) => i === index ? { ...entry, [field]: value } : entry);
      return { ...current, vaccineEntries: entries, vaccinesGiven: entries };
    });
  }

  function handleVaccineToggle(vaccineName, checked) {
    const vaccineCode = getEpiCode(vaccineName);
    if (vaccineCode && epiCompletion.alreadyGivenCodes.has(vaccineCode)) return;

    clearValidationError("vaccineEntries");
    setImmunizationData((prev) => {
      const existingEntries = getVaccineEntries(prev);
      const entries = checked
        ? [
            ...existingEntries,
            {
              ...EMPTY_VACCINE_ENTRY,
              vaccineName,
              dateGiven: dateOfVisit,
            },
          ]
        : existingEntries.filter((entry) => entry.vaccineName !== vaccineName);
      return {
        ...prev,
        vaccineEntries: entries,
        vaccinesGiven: entries,
      };
    });
  }

  function handleMaternalChange(field, value) {
    clearValidationError(field);
    setMaternalData((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Toggle one risk-code checkbox.
   *
   * Unchecking a parent (Risk Code D or E) also clears its children, so a
   * sub-condition can never stay set while hidden and be submitted with the
   * record.
   */
  // Every risk factor is its own checkbox; Risk Code D / E flags are kept in
  // step by applyRiskFactorChange (utils/prenatalForm).
  function handleRiskAssessmentChange(key, checked) {
    setMaternalData((previous) => ({
      ...previous,
      riskAssessment: applyRiskFactorChange(previous.riskAssessment, key, checked),
    }));
  }

  function handleNestedMaternalChange(group, field, value) {
    clearValidationError(`${group}.${field}`);
    setMaternalData((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || EMPTY_MATERNAL_DATA[group] || {}),
        [field]: value,
      },
    }));
  }




  function handleFamilyPlanningChange(field, value) {
    if (field === "nextAppointmentDate") {
      clearValidationError("followUpDate");
      setFollowUpDate(value);
    }
    setFamilyPlanningData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "hasClinicalConcern" && value !== "Yes"
        ? { concern: "", findings: "", adviceGiven: "" }
        : {}),
    }));
  }

  function beginOfficialSubmission(formData) {
    if (!officialSubmissionRef.current) {
      officialSubmissionRef.current = {
        idempotencyKey: createIdempotencyKey(),
        payload: JSON.parse(JSON.stringify(formData)),
      };
    }

    return officialSubmissionRef.current;
  }

  function clearOfficialSubmission() {
    officialSubmissionRef.current = null;
  }

  function isIdempotencyPayloadMismatch(error) {
    return (
      Number(error?.status) === 409 &&
      error?.payload?.code === "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"
    );
  }

  function isFollowUpAlreadyProcessed(error) {
    return (
      Number(error?.status) === 409 &&
      error?.payload?.code === "FOLLOW_UP_ALREADY_PROCESSED"
    );
  }

  function isInsufficientStock(error) {
    return (
      Number(error?.status) === 409 &&
      error?.payload?.code === "INSUFFICIENT_STOCK"
    );
  }

  /**
   * A 409 because an edited Patient Background section changed since it was
   * opened. Nothing was saved; the draft already holds the clinician's edits.
   * Refetches the patient so the panel compares against the latest version.
   */
  function showBackgroundConflict(error) {
    const conflicts = readBackgroundConflicts(error);
    if (!conflicts) return false;
    clearOfficialSubmission();
    setConnectionIssue(null);
    setLastFailedSubmit(null);
    setBackgroundConflicts(conflicts);
    queryClient.invalidateQueries({ queryKey: ["consultation-selected-patient", selectedPatientId] });
    goToStepKey(REVIEW_STEP);
    return true;
  }

  function applyBackgroundConflictChoices(choices) {
    setBackgroundUpdate(resolveBackgroundConflicts(backgroundUpdate, backgroundConflicts, choices));
    setBackgroundConflicts(null);
    toast.success("Patient Background choices applied. Save again to finalize.");
  }

  function refreshMedicineStock() {
    setBhcMedicineInventoryReloadKey((current) => current + 1);
  }

  function reviewDispensedMedicines() {
    window.requestAnimationFrame(() => {
      const section = document.querySelector(
        "[data-dispensed-medicines-section]",
      );
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      section?.querySelector("select, input, button")?.focus();
    });
  }

  function showMedicineStockConflict(error) {
    const affectedItems = Array.isArray(error?.payload?.items)
      ? error.payload.items
      : [];
    const itemDetails = affectedItems
      .map(
        (item) =>
          `${item.medicine_name || "Medicine or supply"}\nRequested: ${item.requested_quantity}\nAvailable: ${item.available_quantity}`,
      )
      .join("\n\n");

    setConnectionIssue(null);
    setLastFailedSubmit(null);
    clearOfficialSubmission();
    refreshMedicineStock();
    setNoticeModal({
      title: "Medicine Stock Changed",
      message: [
        "One or more selected medicines no longer have enough available stock. No health record was created.",
        itemDetails,
      ]
        .filter(Boolean)
        .join("\n\n"),
      actions: [
        {
          label: "Review Medicines",
          variant: "secondary",
          onClick: reviewDispensedMedicines,
        },
        { label: "Refresh Stock", onClick: refreshMedicineStock },
        { label: "Close", variant: "secondary" },
      ],
    });
  }

  function showSubmissionConflict() {
    setConnectionIssue(null);
    setNoticeModal({
      title: "Submission Conflict",
      message:
        "This submission key was already used for different health-record information. Your current form has not been submitted. Review the patient's health-record history before trying again.",
    });
  }

  async function refreshFollowUpConflictState() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords(userRole),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTasks("bhc"),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.patientDetails(userRole, selectedPatientId),
      }),
    ]);
  }

  function showFollowUpAlreadyProcessed(error) {
    const latestRecordId = error?.payload?.health_record_id || "";
    setConnectionIssue(null);
    void refreshFollowUpConflictState();
    setNoticeModal({
      title: "Follow-up Already Processed",
      message:
        "This follow-up was already completed through another health-record submission. No new record was created from this attempt.",
      actions: [
        ...(latestRecordId
          ? [
              {
                label: "View Latest Health Record",
                onClick: () =>
                  navigate(`${healthRecordsPath}/${latestRecordId}`),
              },
            ]
          : []),
        {
          label: "Return to Follow-ups",
          variant: "secondary",
          onClick: () => navigate("/bhc/follow-ups"),
        },
        {
          label: "Refresh",
          variant: "secondary",
          onClick: () => void refreshFollowUpConflictState(),
        },
      ],
    });
  }

  async function saveHealthRecord(formData, submission = null) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await protectLocalRecovery();
      throw new Error("Reconnect before completing this consultation. Your progress remains available here.");
    }
    if (canSaveCurrentDraft && !(await flushDraftBeforeLeave())) {
      await protectLocalRecovery();
      throw new Error("The latest changes have not synced. Keep this consultation open and retry synchronization before completing it.");
    }
    const finalDraftId = getDraftIdentity()?.id || activeDraft?.id;
    let finalDraftVersion = getDraftIdentity()?.version || activeDraft?.version;
    const savedRecord = await healthRecordService.createHealthRecord(formData, "bhc", {
      idempotencyKey: submission?.idempotencyKey,
      draftId: finalDraftId,
      draftVersion: finalDraftVersion,
      // The SAME identity the consultation has carried since entry -
      // never minted here. Retries keep it; only idempotencyKey is
      // per-attempt.
      consultationUuid,
    });
    bypassLeaveGuardRef.current = true;
    try { await completeDraftRecovery(); }
    catch { toast.error("The record was saved, but device recovery cleanup failed. Sign out when finished to clear protected session data."); }
    queryClient.invalidateQueries({ queryKey: ["unfinished-consultations"] });
    if (activeDraft?.id) {
      setHealthRecordDrafts((current) =>
        current.filter((item) => item.id !== activeDraft.id),
      );
      setActiveDraft(null);
      setDraftSavedAt("");
    }
    // The consultation is now an official record, so its identity is spent.
    // The next consultation started on this page is a new one and mints its
    // own at entry. Reached only after the create resolved - a failed save
    // throws above and keeps the identity for its retry.
    setConsultationUuid("");
    const savedId =
      savedRecord?.id ||
      savedRecord?._id ||
      savedRecord?.data?.id ||
      savedRecord?.data?._id;

    queryClient.invalidateQueries({
      queryKey: queryKeys.healthRecords(userRole),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.familyPlanningRecords(userRole),
    });
    if (userRole === "bhc") {
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTasks("bhc"),
      });
    }
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboardSummary(userRole),
    });
    if (selectedPatientId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.patientDetails(userRole, selectedPatientId),
      });
    }
    if (savedId) {
      queryClient.setQueryData(
        queryKeys.healthRecordData(userRole, savedId),
        savedRecord,
      );
      queryClient.setQueryData(
        queryKeys.healthRecordDetails(userRole, savedId),
        {
          record: savedRecord,
          patient:
            savedRecord?.patient ||
            selectedPatient ||
            null,
          linkedReferral: savedRecord?.referrals?.[0] || null,
        },
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails(userRole, savedId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordData(userRole, savedId),
      });
    }
    await refreshRhuMedicines();
    const dispensedMedicineIds = Array.from(
      new Set(
        [...dispensedMedicines, ...getVaccineEntries(immunizationData)]
          .map((item) => String(item?.medicineId || item?.medicine_id || ""))
          .filter(Boolean),
      ),
    );
    await Promise.all(
      dispensedMedicineIds.map((medicineId) =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.medicineTransactions(
            currentUser,
            medicineId,
          ),
        }),
      ),
    );

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.medicineAvailability("bhc") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.referralHolds() }),
    ]);
    return { savedRecord, savedId };
  }

  async function handleRetryFailedHealthRecord() {
    const failedFormData = lastFailedSubmit?.formData;
    if (!failedFormData || saving) return;
    setSaving(true);
    try {
      const submission = {
        idempotencyKey: lastFailedSubmit.idempotencyKey,
        payload: failedFormData,
      };
      officialSubmissionRef.current = submission;
      const { savedRecord, savedId } = await saveHealthRecord(
        submission.payload,
        submission,
      );
      const savedRecordId =
        savedId ||
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id ||
        "";
      setConnectionIssue(null);
      setLastFailedSubmit(null);
      clearOfficialSubmission();
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: normalizePatientStatus(
          savedRecord?.followUpStatus ||
            savedRecord?.status ||
            failedFormData.followUpStatus,
        ),
        needsReferral: failedFormData.needs_referral === true,
        referralSubmitted: Boolean(savedRecord?.officialResult?.referral_id),
        referralTrackingId:
          savedRecord?.referrals?.[0]?.tracking_id ||
          savedRecord?.referrals?.[0]?.trackingId ||
          "",
      });
    } catch (error) {
      if (showBackgroundConflict(error)) {
        // Shown on Review & Confirm.
      } else if (isFollowUpAlreadyProcessed(error)) {
        showFollowUpAlreadyProcessed(error);
      } else if (isInsufficientStock(error)) {
        showMedicineStockConflict(error);
      } else if (isIdempotencyPayloadMismatch(error)) {
        showSubmissionConflict();
      } else if (isConnectionError(error)) {
        setConnectionIssue({
          title: "Connection Lost",
          message: HEALTH_RECORD_CONNECTION_LOST_MESSAGE,
        });
      } else {
        clearOfficialSubmission();
        setConnectionIssue(null);
        setNoticeModal({
          title: "Save Failed",
          message:
            error?.message ||
            "Unable to save the health record. Please review the form and try again.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (saving) return;
    if (backgroundConflicts?.length) {
      toast.error("Choose which Patient Background version to keep before saving.");
      goToStepKey(REVIEW_STEP);
      return;
    }
    if (!canFinalize) {
      if (!chiefComplaint.trim()) { setValidationErrorsAndFocus({ chiefComplaint: "Chief complaint is required." }); goToStepKey(INTERVIEW_STEP); return; }
      setSaving(true);
      try {
        if (!(await flushDraftBeforeLeave())) throw new Error("Save the latest changes before submitting for review.");
        const identity = getDraftIdentity() || activeDraft;
        if (!identity?.id) throw new Error("Save a draft before submitting for review.");
        await transitionDraft(identity.id, "submit", identity.version);
        bypassLeaveGuardRef.current = true;
        toast.success("Consultation submitted for review.");
        queryClient.invalidateQueries({ queryKey: ["unfinished-consultations"] });
        navigate("/bhc/patients/" + selectedPatientId);
      } catch (error) { toast.error(error.message); } finally { setSaving(false); }
      return;
    }
    if (needsReferral && !(currentUser?.permissions || []).includes("referrals.submit")) { toast.error("Finalize Consultation and Submit Referral permissions are both required."); return; }
    closeDateTimePopovers();

    const isReferralContinuation =
      needsReferral &&
      userRole === "bhc";

    if (!selectedPatientId) {
      setValidationErrorsAndFocus({
        selectedPatientId: "Please select a patient first.",
      });
      return;
    }

    const effectiveHealthRecordType = normalizedHealthRecordType;

    if (!effectiveHealthRecordType) {
      setValidationErrorsAndFocus({
        healthRecordType: "Select a classification first.",
      });
      return;
    }

    const clientErrors = getClinicalValidationErrors();

    if (revealErrorStep(clientErrors)) return;
    if (setValidationErrorsAndFocus(clientErrors)) return;

    if (
      effectiveHealthRecordType === "Maternal" &&
      selectedPatientIsMale
    ) {
      setNoticeModal({
        title: "Invalid Classification",
        message:
          "Maternal records cannot be created for a patient recorded as male. Please choose another classification.",
      });
      return;
    }

    if (
      effectiveHealthRecordType === "Immunization" &&
      immunizationPatientInfo.mode === "adult"
    ) {
      setHealthRecordType("");
      setNoticeModal({
        title: "Invalid Classification",
        message: getAdultImmunizationMessage(immunizationPatientInfo.age),
        onClose: () => classificationRef.current?.focus(),
        buttonLabel: "Okay",
      });
      return;
    }

    if (
      effectiveHealthRecordType === "Family Planning" &&
      !familyPlanningEligibility.eligible
    ) {
      setHealthRecordType("");
      setNoticeModal({
        title: "Invalid Classification",
        message: familyPlanningEligibility.message,
        onClose: () => classificationRef.current?.focus(),
        buttonLabel: "Okay",
      });
      return;
    }

    const preparedVaccineEntries = immunizationVaccineEntries.map((entry) => ({
      ...entry,
      vaccineName:
        entry.vaccineName === "Other"
          ? entry.customVaccineName || entry.vaccineName
          : entry.vaccineName,
      dateGiven: entry.dateGiven || dateOfVisit,
    }));
    const preparedImmunizationData = {
      ...immunizationData,
      patientAgeYears: immunizationPatientInfo.age,
      immunizationFormType: "child",
      vaccineEntries: preparedVaccineEntries,
      vaccinesGiven: preparedVaccineEntries,
    };

    if (effectiveHealthRecordType === "Immunization") {
      if (preparedVaccineEntries.length === 0 && !consultationNotes.trim()) {
        setValidationErrorsAndFocus({
          vaccineEntries:
            "Select at least one vaccine or enter remarks if no vaccine was given.",
        });
        return;
      }
    }

    const immunizationNextScheduleDate =
      preparedVaccineEntries.find((entry) => entry.nextScheduleDate)
        ?.nextScheduleDate || "";
    const finalNeedsReferral = carePlanDisposition.needsReferral;
    // Continued follow-ups (Start Consultation modal): the visit is a
    // follow-up visit of the first one's source record. Every continued task
    // is fulfilled through care_plan either way.
    const continuedLink = continuedVisitLink(continuedFollowUpTaskIds, continuedFollowUps);
    const effectiveVisitType = continuedLink
      ? continuedLink.visitType
      : "initial_consultation";
    const linkedParentRecordId = continuedLink
      ? continuedLink.parentHealthRecordId
      : "";
    const submittedFollowUpTaskId = continuedLink
      ? continuedLink.followUpTaskId
      : "";
    // A referral cancels the follow-up, unless another diagnosis is set to
    // Monitor at BHC or a service visit has its
    // next date (the EPI next dose counts as that date) - followUpPlan.
    const followUpKept = followUpPlan(
      carePlanDisposition,
      followUpDate || immunizationNextScheduleDate,
      { hasService: carePlanHasService },
    ).kept;
    const immunizationWillComplete = false;
    const effectiveFollowUpDate = followUpKept
      ? followUpDate || immunizationNextScheduleDate || ""
      : "";
    const effectiveFollowUpTime =
      !followUpKept || immunizationWillComplete ? "" : followUpTime;

    if (
      effectiveHealthRecordType === "Immunization" &&
      followUpKept &&
      !immunizationWillComplete &&
      !followUpDate &&
      immunizationNextScheduleDate
    ) {
      setFollowUpDate(immunizationNextScheduleDate);
    }

    const finalChiefComplaint =
      isImmunization && !chiefComplaint
          ? "Vaccination Visit"
          : effectiveHealthRecordType === "Family Planning" && !chiefComplaint
            ? familyPlanningData.fpVisitType === "Side-effect Concern"
              ? familyPlanningData.concern || "Family Planning Concern"
              : "Family Planning Visit"
          : effectiveHealthRecordType === "Maternal" && !chiefComplaint
            ? "Prenatal Visit"
          : effectiveHealthRecordType === "TB DOTS / TB Monitoring" &&
              !chiefComplaint
            ? "TB DOTS / TB Monitoring Visit"
          : chiefComplaint;

    // The dose given at this visit is also filed under its TT/Td schedule,
    // so the existing TT/Td history stays complete - see thisVisitDoseEntry.
    const thisVisitImmunization = {
      ...EMPTY_MATERNAL_DATA.immunizationThisVisit,
      ...(maternalData.immunizationThisVisit || {}),
    };

    const recordMaternalData = {
      ...maternalData,
      expectedDeliveryDate,
      aog,
      bmi: maternalData.bmi || "",
      treatment: maternalData.treatment || medication || "",
      previousFpMethodUsed: maternalData.previousFpMethodUsed || "",
      previous_fp_method_used: maternalData.previousFpMethodUsed || "",
      previousFpMethodOther: maternalData.previousFpMethodOther || "",
      previous_fp_method_other: maternalData.previousFpMethodOther || "",
      previousPregnancyHistory: Array.isArray(
        maternalData.previousPregnancyHistory,
      )
        ? maternalData.previousPregnancyHistory
        : [],
      previous_pregnancy_history: Array.isArray(
        maternalData.previousPregnancyHistory,
      )
        ? maternalData.previousPregnancyHistory
        : [],
      riskAssessment: {
        ...EMPTY_MATERNAL_DATA.riskAssessment,
        ...(maternalData.riskAssessment || {}),
      },
      laboratoryResults: {
        ...EMPTY_MATERNAL_DATA.laboratoryResults,
        ...(maternalData.laboratoryResults || {}),
      },
      laboratoryResultDates: {
        ...EMPTY_MATERNAL_DATA.laboratoryResultDates,
        ...(maternalData.laboratoryResultDates || {}),
      },
      immunizationThisVisit: thisVisitImmunization,
      tetanusToxoidStatus: {
        ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
        ...(maternalData.tetanus_toxoid_status || {}),
        ...(maternalData.tetanusToxoidStatus || {}),
        ...thisVisitDoseEntry(thisVisitImmunization, "tetanusToxoidStatus"),
      },
      tetanusDiphtheriaStatus: {
        ...EMPTY_MATERNAL_DATA.tetanusDiphtheriaStatus,
        ...(maternalData.tetanus_diphtheria_status || {}),
        ...(maternalData.tetanusDiphtheriaStatus || {}),
        ...thisVisitDoseEntry(thisVisitImmunization, "tetanusDiphtheriaStatus"),
      },
      ultrasound: {
        ...EMPTY_MATERNAL_DATA.ultrasound,
        ...(maternalData.ultrasound || {}),
      },
      tpal: [
        maternalData.term || 0,
        maternalData.preterm || 0,
        maternalData.abortion || 0,
        maternalData.living || 0,
      ].join("-"),
    };

    const recordFamilyPlanningData = {
      ...familyPlanningData,
      client_type: familyPlanningData.clientType || "",
      method_used: familyPlanningData.methodUsed || "",
      previous_method: familyPlanningData.previousMethod || "",
      fp_visit_type: familyPlanningData.fpVisitType || "",
      visitType: familyPlanningData.fpVisitType || "",
      visit_type: familyPlanningData.fpVisitType || "",
      source: familyPlanningData.source || "",
      dateRegistered: familyPlanningData.dateRegistered || dateOfVisit,
      date_registered: familyPlanningData.dateRegistered || dateOfVisit,
      dateOfVisit: familyPlanningData.dateOfVisit || dateOfVisit,
      date_of_visit: familyPlanningData.dateOfVisit || dateOfVisit,
      next_appointment_date: familyPlanningData.nextAppointmentDate || "",
      remarks: familyPlanningData.remarks || "",
      action_taken: familyPlanningData.actionTaken || "",
      hasClinicalConcern: familyPlanningData.hasClinicalConcern === "Yes",
      has_clinical_concern: familyPlanningData.hasClinicalConcern === "Yes",
      concern: familyPlanningData.concern || "",
      findings: familyPlanningData.findings || "",
      advice_given: familyPlanningData.adviceGiven || "",
      medicinesSupplies: familyPlanningData.medicinesSupplies || "",
      medicines_supplies: familyPlanningData.medicinesSupplies || "",
    };

    const finalPatientStatus =
      effectiveHealthRecordType === "Immunization"
        ? effectiveFollowUpDate
          ? "Follow-up Required"
          : "Completed"
        : recordTypeKey === "general consultation"
          ? normalizePatientStatus(followUpStatus)
        : effectiveFollowUpDate
          ? "Follow-up Required"
          : "Completed";
    const formData = {
      patientId: selectedPatientId,
      patientName: getPatientName(selectedPatient),
      category: effectiveHealthRecordType,
      recordType: effectiveHealthRecordType,
      patientClassification: effectiveHealthRecordType,
      visitType: effectiveVisitType,
      visit_type: effectiveVisitType,
      parentHealthRecordId: linkedParentRecordId || null,
      parent_health_record_id: linkedParentRecordId || null,
      previousRecordId: linkedParentRecordId || "",
      followUpTaskId: submittedFollowUpTaskId || null,
      follow_up_task_id: submittedFollowUpTaskId || null,
      dateOfVisit: dateOfVisit || toDateInputValue(),
      timeOfVisit: timeOfVisit || toTimeInputValue(),
      chiefComplaint: finalChiefComplaint,
      summaryOfPresentIllness,
      physicalExam,
      bodyFindings,
      diagnosis,
      // Each diagnosis carries its effective care plan (defaults included).
      diagnoses: diagnoses.map((entry) => ({ ...entry, carePlan: carePlanFor(entry, continuedMonitorings, clinicalRegistry) })),
      assessmentNotes,
      vitalSigns: consultationVitalSigns,
      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      temperature: temp || null,
      pulse: pulse || null,
      spo2: spo2 || null,
      weight: weight || null,
      height: height || null,
      fbs: fbs === "" ? null : Number(fbs),
      medication:
        effectiveHealthRecordType === "Maternal"
          ? recordMaternalData.treatment || medication
          : medication,
      attendingStaff: attendingStaff || currentUserName,
      consultationNotes,
      followUpStatus: finalPatientStatus,
      followUpDate: effectiveFollowUpDate,
      followUpTime: effectiveFollowUpTime,
      followUpReason:
        followUpKept &&
        normalizePatientStatus(finalPatientStatus) === "Follow-up Required"
          ? followUpReason.trim()
          : "",
      monitoringNotes,
      patientCondition:
        effectiveFollowUpDate ? patientCondition : "",
      // healthRecordService derives the legacy include/notifiable flags from
      // this; the server re-derives all three from diagnoses[].reportAs.
      morbidityReportingStatus: effectiveReportingStatus,
      needsReferral: finalNeedsReferral,
      needs_referral: finalNeedsReferral,
      referralReason: "",
      referralCategory: null,
      referralAssessmentStatus: null,
      maternalData: recordMaternalData,
      lmp: recordMaternalData.lmp || null,
      pmp: recordMaternalData.pmp || null,
      cycleDuration: recordMaternalData.cycleDuration || null,
      gravida: recordMaternalData.gravida || null,
      para: recordMaternalData.para || null,
      term: recordMaternalData.term || null,
      preterm: recordMaternalData.preterm || null,
      abortion: recordMaternalData.abortion || null,
      living: recordMaternalData.living || null,
      tpal: recordMaternalData.tpal || null,
      expectedDeliveryDate,
      aog,
      immunizationData: preparedImmunizationData,
      familyPlanningData:
        isFamilyPlanning
          ? recordFamilyPlanningData
          : null,
      // Sent whenever Monitoring Details includes the TB card (isTb).
      tbData: isTb ? tbData : null,
      // Patient Background sections reviewed in this visit (only the edited ones).
      backgroundUpdate: canViewBackground ? toRecordBackgroundUpdate(backgroundUpdate) : undefined,
      // What this visit continues and stops. validateCarePlan already ran in
      // getClinicalValidationErrors above (this payload drops blank stops).
      carePlan: buildCarePlanPayload({
        continuedFollowUpTaskIds,
        continuedMonitorings,
        stops: monitoringStops,
        diagnoses,
        registry: clinicalRegistry,
      }),
      ...(consultationMode ? { selectedPrograms, primaryProgram } : {}),
      monitoringData: {
        ...(consultationMode ? { selectedPrograms, primaryProgram } : {}),
      },
      createdByRole: userRole,
      linkedTrackingId: "",
      dispensedMedicines,
    };

    if (isReferralContinuation) {
      setReferralForm((prev) => ({
        ...prev,
        urgencyLevel: normalizeAttention(prev.urgencyLevel),
        dateOfReferral: prev.dateOfReferral || dateOfVisit || toDateInputValue(),
        timeOfReferral: prev.timeOfReferral || timeOfVisit || toTimeInputValue(),
        referringHci:
          prev.referringHci || getReferringFacilityName(currentUser),
        philHealthNumber:
          prev.philHealthNumber || getPatientPhilHealthNumber(selectedPatient),
        referringPractitioner:
          prev.referringPractitioner || attendingStaff || currentUserName,
        patientName: prev.patientName || getPatientName(selectedPatient),
        birthDate: prev.birthDate || getPatientBirthDate(selectedPatient),
        address: prev.address || getPatientAddress(selectedPatient),
        ageSexCivilStatus:
          prev.ageSexCivilStatus ||
          getPatientAgeSexCivilStatus(selectedPatient),
        philHealthCategory:
          prev.philHealthCategory || getPatientPhilHealthCategory(selectedPatient),
        chiefComplaint: prev.chiefComplaint || finalChiefComplaint,
        initialDiagnosis: prev.initialDiagnosis || diagnosis,
        initialActionsTaken: prev.initialActionsTaken || medication,
        reasonForReferral:
          prev.reasonForReferral ||
          diagnosis ||
          finalChiefComplaint ||
          "RHU referral requested",
        clinicalSummary:
          prev.clinicalSummary ||
          [summaryOfPresentIllness, consultationNotes].filter(Boolean).join("\n\n"),
      }));
      // The approved flow saves the referral straight from Next Action, so the
      // logistics that used to be collected on a dedicated step are defaulted
      // above (facility is assigned server-side from the patient's BHC,
      // urgency falls back to the default; the RHU assigns the doctor).
      //
      // The DOC-14 no-provider gate is NOT bypassed by this: it is enforced by
      // ReferralSubmissionGate inside the same server transaction, so a blocked
      // submission still fails closed and is reported through the gate error
      // handling in submitHealthRecordWithReferral.
      await submitHealthRecordWithReferral({
        formData,
        referralOverrides: {
          chiefComplaint: referralForm.chiefComplaint || finalChiefComplaint,
          initialDiagnosis: referralForm.initialDiagnosis || diagnosis,
          initialActionsTaken:
            referralForm.initialActionsTaken || medication,
          reasonForReferral:
            referralForm.reasonForReferral ||
            diagnosis ||
            finalChiefComplaint ||
            "RHU referral requested",
          referringPractitioner: attendingStaff || currentUserName,
          dateOfReferral: dateOfVisit || toDateInputValue(),
          timeOfReferral: timeOfVisit || toTimeInputValue(),
          clinicalSummary: [summaryOfPresentIllness, consultationNotes]
            .filter(Boolean)
            .join("\n\n"),
        },
      });
      return;
    }

    setSaving(true);

    try {
      const submission = beginOfficialSubmission(formData);
      const { savedRecord, savedId } = await saveHealthRecord(
        submission?.payload || formData,
        submission,
      );
      const savedRecordId =
        savedId ||
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id ||
        "";
      const savedStatus = normalizePatientStatus(
        savedRecord?.followUpStatus ||
          savedRecord?.status ||
          savedRecord?.data?.followUpStatus ||
          savedRecord?.data?.status ||
          formData.followUpStatus,
      );

      setLastFailedSubmit(null);
      clearOfficialSubmission();
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: savedStatus,
        needsReferral: formData.needs_referral === true,
      });
    } catch (error) {
      if (showBackgroundConflict(error)) return;
      if (isFollowUpAlreadyProcessed(error)) {
        showFollowUpAlreadyProcessed(error);
        return;
      }
      if (isInsufficientStock(error)) {
        showMedicineStockConflict(error);
        return;
      }
      if (isIdempotencyPayloadMismatch(error)) {
        showSubmissionConflict();
        return;
      }
      if (error?.status === 422 && error?.errors) {
        clearOfficialSubmission();
        const backendErrors = Object.fromEntries(
          Object.entries(error.errors).map(([field, messages]) => [
            field,
            Array.isArray(messages) ? messages[0] : String(messages),
          ]),
        );
        if (setValidationErrorsAndFocus(backendErrors)) return;
      }
      if (isConnectionError(error)) {
        const submission = officialSubmissionRef.current;
        setLastFailedSubmit({
          formData: submission?.payload || formData,
          idempotencyKey: submission?.idempotencyKey,
        });
        setConnectionIssue({
          title: "Connection Lost",
          message: HEALTH_RECORD_CONNECTION_LOST_MESSAGE,
        });
        return;
      }
      clearOfficialSubmission();
      setNoticeModal({
        title: "Save Failed",
        message:
          error?.message ||
          "Unable to save the health record. Please review the form and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Save the health record and its referral in one submission.
   *
   * Takes the record payload explicitly rather than reading pendingReferralDraft,
   * because Next Action now saves in the same tick it builds the payload and
   * would otherwise race React state.
   */
  async function submitHealthRecordWithReferral({
    formData,
    referralOverrides = {},
  } = {}) {
    closeDateTimePopovers();

    const attempt = { formData, referralOverrides };

    if (!attempt.formData) {
      setNoticeModal({
        title: "Health Record Draft Missing",
        message:
          "The health record draft is no longer available. Please review the health record form again.",
      });
      return;
    }

    const referral = { ...referralForm, ...attempt.referralOverrides };

    if (!String(referral.reasonForReferral || "").trim()) {
      setValidationErrorsAndFocus({
        reasonForReferral: "Reason for referral is required.",
      });
      return;
    }

    const referralUrgency = normalizeAttention(referral.urgencyLevel);
    const referralRemarks = referral.clinicalSummary || "";
    const officialPayload = {
      ...attempt.formData,
      referral: {
        ruralHealthUnitId: receivingRhuId,
        referralCategory: attempt.formData.category,
        urgencyLevel: referralUrgency,
        reasonForReferral: referral.reasonForReferral,
        chiefComplaint:
          referral.chiefComplaint || attempt.formData.chiefComplaint,
        initialDiagnosis:
          referral.initialDiagnosis || attempt.formData.diagnosis,
        initialActionsTaken:
          referral.initialActionsTaken || attempt.formData.medication,
        referringPractitioner:
          referral.referringPractitioner || attempt.formData.attendingStaff,
        referralDate: referral.dateOfReferral,
        referralTime: referral.timeOfReferral,
        remarks: referralRemarks || null,
      },
    };
    const submission = beginOfficialSubmission(officialPayload);

    setSaving(true);

    try {
      const result = await saveHealthRecord(submission.payload, submission);
      const savedRecord = result.savedRecord;
      const savedRecordId =
        result.savedId ||
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id ||
        "";

      if (!savedRecordId) throw new Error("Saved health record ID was not returned.");

      const referral = savedRecord?.referrals?.[0] || null;
      const referralTrackingId =
        referral?.tracking_id || referral?.trackingId || "";

      queryClient.invalidateQueries({ queryKey: queryKeys.referrals("bhc") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.incomingReferrals("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords(userRole),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTasks("bhc"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary(userRole),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails(userRole, savedRecordId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordData(userRole, savedRecordId),
      });

      setLastFailedSubmit(null);
      clearOfficialSubmission();
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: normalizePatientStatus(
          savedRecord?.followUpStatus ||
            savedRecord?.status ||
            attempt.formData.followUpStatus,
        ),
        needsReferral: true,
        referralSubmitted: Boolean(referral),
        awaitingDoctor: !referral,
        referralTrackingId,
      });
    } catch (error) {
      // DOC-14 - unconditional. No override affordance is offered.
      if (isNoProviderAvailableError(error)) {
        clearOfficialSubmission();
        setNoticeModal({
          title: "Referral Submission Unavailable",
          message: error?.message || noProviderMessage,
        });
        return;
      }
      if (showBackgroundConflict(error)) return;
      if (isFollowUpAlreadyProcessed(error)) {
        showFollowUpAlreadyProcessed(error);
        return;
      }
      if (isInsufficientStock(error)) {
        showMedicineStockConflict(error);
        return;
      }
      if (isIdempotencyPayloadMismatch(error)) {
        showSubmissionConflict();
        return;
      }
      if (isConnectionError(error)) {
        setLastFailedSubmit({
          formData: submission.payload,
          idempotencyKey: submission.idempotencyKey,
        });
        setConnectionIssue({
          title: "Connection Lost",
          message: HEALTH_RECORD_CONNECTION_LOST_MESSAGE,
        });
        return;
      }
      clearOfficialSubmission();
      setNoticeModal({
        title: "Save Failed",
        message:
          error?.message ||
          "Unable to save the health record and referral. Please review the form and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = "New Consultation";
  const monitoringNotesLabel =
    normalizedPatientStatus === "Completed"
      ? "Additional Notes"
      : showFollowUpMonitoringFields
        ? "Monitoring and Follow-up Notes"
        : "Monitoring Notes";
  const monitoringNotesPlaceholder =
    normalizedPatientStatus === "Completed"
      ? "Write final outcome notes or closing instructions..."
      : showFollowUpMonitoringFields
        ? "Write the monitoring plan or return-visit instructions..."
        : "Write monitoring notes if useful...";

  const wizardVisitDate = dateOfVisit
    ? new Date(`${dateOfVisit}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";
  const wizardVisitTime = formatDisplayTime(timeOfVisit, "Not set");

  // ---- Step navigation (New Consultation) --------------------------------
  function scrollWorkflowToTop() {
    window.requestAnimationFrame(() => {
      // Pinned layout scrolls the form column; stacked layout scrolls the page.
      for (const selector of ["[data-consult-scroll]", ".akay-content-scroll"]) {
        document.querySelector(selector)?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  /**
   * Accepts either a screen key (a program form, assessment, treatment) or a
   * global progress-bar key; "Service Details" opens the first service.
   */
  function goToStepKey(key, { scroll = true } = {}) {
    const target = key === PROGRAMS_STEP ? programFormSteps[0]?.key : key;
    const isServiceForm = programFormSteps.some((step) => step.key === target);
    const phase = formSequence.includes(target) || isServiceForm
      ? "form"
      : consultationSteps.find((item) => item.key === target)?.phase;
    if (!phase) return;

    closeDateTimePopovers();
    // Opening a service form from any other screen remembers that screen.
    if (isServiceForm && !activeProgramStep) setServiceFormOrigin(getServiceFormReturnTarget(currentStepKey));
    if (phase === "form") setFormStep(target);
    // Care Plan and Monitoring Details are the two screens of the Next phase.
    if (phase === "next") setNextScreen(target === MONITORING_STEP ? MONITORING_STEP : NEXT_STEP);
    goToWizardPhase(WIZARD_PHASE_FOR_STEP[phase]);
    if (scroll) scrollWorkflowToTop();
  }

  /**
   * Whether the user may leave a step going forward. Only the step's own
   * fields block it; anything owned by an EARLIER step means that screen was
   * left incomplete (e.g. a restored draft), so the user is sent back there.
   * Uses the page's existing validation - no rules are added or dropped.
   */
  function checkStepGate(stepKey) {
    if (stepKey === INTERVIEW_STEP && !chiefComplaint.trim()) {
      setValidationErrorsAndFocus({ chiefComplaint: "Chief complaint is required." });
      return false;
    }
    // Program completion, disposition and referral requirements apply only at finalization.
    setValidationErrorsAndFocus({});
    return true;
  }

  // Same idea for Save: an error that belongs to another screen is shown there.
  function revealErrorStep(errors) {
    const target = findFirstErrorStepKey(errors, stepOrder);
    if (!target || target === currentStepKey) return false;
    setValidationErrorsAndFocus(errors);
    goToStepKey(target, { scroll: false });
    return true;
  }

  function handleFormStepNext(event) {
    event?.preventDefault();
    closeDateTimePopovers();
    // A service form is a detour: Done goes back to where it was opened. It
    // never blocks - an unfinished form shows as Incomplete in the panel and
    // is caught again when the visit is reviewed and saved.
    if (activeProgramStep) {
      goToStepKey(getServiceFormReturnTarget(serviceFormOrigin));
      return;
    }
    if (!checkStepGate(activeFormStep)) return;
    goToStepKey(getNextStepKey(formSequence, activeFormStep));
  }

  // Previous reverses the form order. From the first screen it returns to the
  // fixed patient's profile; the leave guard flushes the current draft.
  function handleFormStepPrevious() {
    closeDateTimePopovers();
    if (activeProgramStep) {
      goToStepKey(getServiceFormReturnTarget(serviceFormOrigin));
      return;
    }
    const target = getPreviousStepKey(formSequence, activeFormStep);
    if (target === EXIT_STEP) {
      navigate(`${basePath}/patients/${selectedPatientId}`);
      return;
    }
    goToStepKey(target);
  }

  function handleNextActionContinue() {
    closeDateTimePopovers();
    if (!checkStepGate(NEXT_STEP)) return;
    if (nextScreen === NEXT_STEP) {
      // A stop reason belongs to this screen: ask for it before moving on.
      const carePlanErrors = validateCarePlan({
        diagnoses, continuedMonitorings, stops: monitoringStops, registry: clinicalRegistry,
      });
      if (setValidationErrorsAndFocus(carePlanErrors)) return;
    }
    goToStepKey(nextPhaseForwardTarget(nextScreen, monitoringDetailKeys));
  }

  // ---- Wizard view models -------------------------------------------------
  const wizardPrograms = Object.entries(PROGRAM_CLASSIFICATIONS).map(([key, classification]) => {
    const eligibility = key === "Maternal" ? getMaternalEligibility(selectedPatient)
      : key === "Family Planning" ? familyPlanningEligibility
      : key === "EPI" && immunizationPatientInfo.mode === "adult" ? { eligible: false, message: getAdultImmunizationMessage(immunizationPatientInfo.age) }
      : { eligible: true, message: "" };
    return { key, title: key === "Maternal" ? "Maternal Care" : key, description: key === "EPI" ? "Immunization and child vaccination services." : RECORD_TYPE_DETAILS[classification]?.description,
      icon: RECORD_TYPE_DETAILS[classification]?.icon || Stethoscope, disabled: !eligibility.eligible, disabledReason: eligibility.message };
  });

  function closeDraftDecision() {
    if (draftDecisionBusy) return;
    setDraftDecision(null);
    setDraftDecisionError("");
  }

  async function discardConflictingDraftAndStart() {
    setDraftDecisionBusy(true);
    setDraftDecisionError("");
    try {
      await discardHealthRecordDraft(draftDecision.id);
      setHealthRecordDrafts((current) =>
        current.filter((item) => item.id !== draftDecision.id),
      );
      setDraftDecision(null);
    } catch (error) {
      setDraftDecisionError(
        isConnectionError(error)
          ? "Unable to reach the server. Please check your connection and try again."
          : error?.message || "Unable to discard this unfinished consultation. Please try again.",
      );
    } finally {
      setDraftDecisionBusy(false);
    }
  }

  async function continueConflictingDraft() {
    const draftId = draftDecision.id;
    setDraftDecision(null);
    await handleResumeDraft(draftId);
  }

  function handleProgramSelect(option) {
    if (wizardPrograms.find(program => program.key === option)?.disabled) return;
    const next = toggleConsultationProgram(selectedPrograms, primaryProgram, option);
    setSelectedPrograms(next.selectedPrograms);
    setPrimaryProgram(next.primaryProgram);
    // No separate general/program toggle any more: selecting nothing IS a
    // general consultation. consultationMode still records it, because the
    // draft payload and the saved record read it exactly as before.
    setConsultationMode(next.selectedPrograms.length ? "program" : "general");
    setHealthRecordType(PROGRAM_CLASSIFICATIONS[next.primaryProgram] || "General Consultation");
  }

  // The step flow's Next phase: Care Plan & Next Steps, then Monitoring
  // Details when a condition monitored in this visit needs it.
  const monitoringDetailErrors = Object.values(pickErrorsForStep(validationErrors, MONITORING_STEP)).filter(Boolean);
  const carePlanScreen = nextScreen === MONITORING_STEP ? (
    <LockedFormContent locked={patientGateLocked}>
      {monitoringDetailErrors.length > 0 && (
        <div role="alert" className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]">
          {monitoringDetailErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <MonitoringDetailsForms
        detailKeys={monitoringDetailKeys}
        tbData={tbData}
        onTbDataChange={(next) => {
          setTbData(next);
          setValidationErrors((current) => Object.fromEntries(
            Object.entries(current).filter(([key]) => !key.startsWith("tbData.")),
          ));
        }}
        recordId={null}
      />
    </LockedFormContent>
  ) : (
    <CarePlanSection
      diagnoses={diagnoses}
      continuedMonitorings={continuedMonitorings}
      activeMonitorings={activeMonitorings}
      stops={monitoringStops}
      registry={clinicalRegistry}
      followUp={{ date: followUpDate, time: followUpTime, reason: followUpReason }}
      referral={{ reason: referralForm.reasonForReferral, urgencyLevel: referralForm.urgencyLevel }}
      referralFacilityField={
        <ReferralFacilityField
          value={receivingRhuId}
          error={validationErrors.receivingRhuId}
          disabled={patientGateLocked}
          onChange={(id) => {
            clearValidationError("receivingRhuId");
            setReceivingRhuId(id);
          }}
        />
      }
      showsFollowUp={carePlanFollowUp.shows}
      needsReferral={carePlanDisposition.needsReferral}
      errors={validationErrors}
      // A locked review is already disabled by the workspace fieldset.
      disabled={patientGateLocked}
      onCarePlanChange={(id, value) => {
        setDiagnoses((current) => current.map((entry) => (entry.id === id ? { ...entry, carePlan: value } : entry)));
      }}
      onReportAsChange={handleReportAsChange}
      onSurveillanceChange={handleSurveillanceChange}
      onStopChange={(monitoringId, reason) => {
        clearValidationError(`carePlanStop.${monitoringId}`);
        setMonitoringStops((current) => setMonitoringStop(current, monitoringId, reason));
      }}
      onFollowUpChange={(field, value) => {
        const [errorKey, setter] = {
          date: ["followUpDate", setFollowUpDate],
          time: ["followUpTime", setFollowUpTime],
          reason: ["followUpReason", setFollowUpReason],
        }[field];
        clearValidationError(errorKey);
        setter(value);
      }}
      onReferralChange={(field, value) =>
        handleReferralFormChange(field === "reason" ? "reasonForReferral" : field, value)
      }
      // Additional Clinical Notes (monitoringNotes on the record).
      notes={monitoringNotes}
      notesLabel={monitoringNotesLabel}
      notesPlaceholder={monitoringNotesPlaceholder}
      onNotesChange={setMonitoringNotes}
    />
  );


  const isGeneralOnly =
    !isImmunization &&
    !isFamilyPlanning &&
    !isMaternal &&
    !isTb;

  // The Treatment step has ONE "Treatment / Action Taken" field. It keeps writing
  // exactly what each selected program's own field wrote before (Maternal also
  // mirrors into `medication`, as it always did), so saved
  // records and drafts keep the same shape. The first binding - the primary
  // program's - supplies the value that is displayed.
  const treatmentBindingFor = {
    Maternal: {
      value: maternalData.treatment,
      set: (value) => {
        handleMaternalChange("treatment", value);
        setMedication(value);
      },
    },
    "Family Planning": {
      value: familyPlanningData.actionTaken,
      set: (value) => handleFamilyPlanningChange("actionTaken", value),
    },
  };
  const treatmentBindings = isGeneralOnly
    ? [{ value: medication, set: setMedication }]
    : programFormSteps
        .map((step) => treatmentBindingFor[step.classification])
        .filter(Boolean);
  const treatmentValue = medication || treatmentBindings[0]?.value || "";
  const handleTreatmentChange = (value) => {
    setMedication(value);
    treatmentBindings.forEach((binding) => binding.set(value));
  };

  // Reporting is per condition, inside that condition's Care Plan row. Two
  // independent decisions: report it as Morbidity or Notifiable (or not at
  // all), and include it in the Surveillance Report or not - neither gates the
  // other. Both reuse this same consultation's patient/encounter data; nothing
  // extra is created, and the visit itself is counted from its own record.
  function handleReportAsChange(id, reportAs) {
    setDiagnoses((current) => setDiagnosisReportAs(current, id, reportAs));
  }
  function handleSurveillanceChange(id, value) {
    setDiagnoses((current) => current.map((d) => (d.id === id ? { ...d, includeInSurveillance: value } : d)));
  }

  const autosaveStatus = canSaveCurrentDraft ? (
    <span role="status" aria-live="polite" className="text-xs text-gray-500">
      {draftSyncStatus === "syncing" ? "Syncing..." : draftAutosaveStatus === "saving" ? "Saving..." : draftAutosaveStatus === "saved" ? "Saved automatically" : ""}
    </span>
  ) : null;

  // ---- Consultation workspace (screen 2) ---------------------------------
  const inConsultationWorkspace =
    [WIZARD_FORM, WIZARD_NEXT, WIZARD_REVIEW].includes(wizardPhase);
  const isReviewStep = wizardPhase === WIZARD_REVIEW;
  const isFirstConsultationStep =
    wizardPhase === WIZARD_FORM &&
    activeFormStep === INTERVIEW_STEP;

  // Interview is the first step: Back returns to the fixed patient's profile,
  // while the leave guard flushes the current draft.
  function handleWorkspacePrevious() {
    handleStepBack();
  }

  function handleWorkspaceContinue() {
    if (activeDraft?.reviewState === "review" && !canFinalize) return;
    if (wizardPhase === WIZARD_FORM) return handleFormStepNext();
    if (wizardPhase === WIZARD_NEXT) return handleNextActionContinue();
    return handleSave();
  }

  // Heading for the current screen. The wizard still knows its position; that
  // position is simply not shown while the progress UI is switched off.
  const stepSubtitles = {
    [INTERVIEW_STEP]:
      "Record the patient's reason for visit, present illness and background.",
    [ASSESSMENT_STEP]:
      "Record the vital signs and examination findings, the suspected case, and the actions taken for this visit.",
    [NEXT_STEP]:
      "Plan each suspected case, then any referral and the next follow-up, and classify it for reporting.",
    [MONITORING_STEP]:
      "Details a monitored condition needs beyond this consultation record.",
    [REVIEW_STEP]: "Confirm the consultation details below before saving.",
  };
  // Every screen keeps its own heading whatever programs are selected; only
  // the Program / Service Details step shows a program-specific title.
  const stepHeading = resolveStepHeading({
    currentGlobalStepKey,
    activeProgramStep,
    steps: consultationSteps,
    subtitles: stepSubtitles,
  });
  // The fixed right-hand column changes with the step: Barangay Health Services
  // (the visit's service context) is chosen on Patient Interview only;
  // Physical Exam & Assessment shows the 2D body preview instead. Every other
  // step runs full width. The review summary lists the chosen programs.
  const sidePanelAllowed =
    wizardPhase === WIZARD_FORM &&
    !(activeDraft?.reviewState === "review" && !canFinalize);
  const showProgramPanel = sidePanelAllowed && activeFormStep === INTERVIEW_STEP;
  // Service forms: Back / Done both return to where the form was opened from.
  const serviceFormReturnLabel =
    getServiceFormReturnTarget(serviceFormOrigin) === REVIEW_STEP
      ? "Back to Review"
      : "Back to Patient Interview";
  const showBodyPanel = sidePanelAllowed && activeFormStep === ASSESSMENT_STEP;
  const showSidePanel = showProgramPanel || showBodyPanel;
  // Program panel: one status per form step, attached to each selected program
  // that step covers.
  const programStatusByKey = {};
  if (showProgramPanel && programFormSteps.length > 0) {
    const invalidKeys = Object.keys(getClinicalValidationErrors({ finalizing: true }));
    programFormSteps.forEach((step) => {
      const incomplete = invalidKeys.some((key) => getErrorOwnerStepKey(key) === step.key);
      const started =
        step.classification === "Family Planning" ? Boolean(familyPlanningData.methodUsed || familyPlanningData.remarks || familyPlanningData.concern)
        : step.classification === "TB DOTS / TB Monitoring" ? Boolean(tbData.diagnosis.tbCaseNumber || tbData.phases.intensiveStart)
        : step.classification === "Immunization" ? Boolean(immunizationVaccineEntries.length || consultationNotes.trim())
        : true;
      const status = incomplete ? (started ? "Incomplete" : "Not Started") : "Completed";
      step.programs.forEach((programKey) => {
        programStatusByKey[programKey] = { status, stepKey: step.key };
      });
    });
  }
  // Same lock the whole form used to sit under: a review awaiting a finalizer
  // who cannot correct records is read-only.
  const workspaceLocked = activeDraft?.reviewState === "review" && !(canFinalize && (currentUser?.permissions || []).includes("records.correct"));
  const programPanel = (
    <ConsultationProgramPanel
      programs={wizardPrograms}
      selected={selectedPrograms}
      primary={primaryProgram}
      statusByProgram={programStatusByKey}
      onSelect={handleProgramSelect}
      onPrimaryChange={(key) => {
        setPrimaryProgram(key);
        setHealthRecordType(PROGRAM_CLASSIFICATIONS[key]);
      }}
      onOpenForm={goToStepKey}
    />
  );

  const stepIndicator = (
    <ConsultationStepHeading
      title={stepHeading.title}
      subtitle={stepHeading.subtitle}
    />
  );
  // The heading is drawn once, at the top of the scrolling form column, so the
  // step screens are handed this empty slot: it stops them falling back to
  // their own titles.
  const stepHeadingSlot = <></>;

  // Read-only recap for Review & Save, built from the page's existing state.
  const vitalsSummary = [
    (systolicBp || diastolicBp) &&
      `BP ${systolicBp || "?"}/${diastolicBp || "?"} mmHg`,
    pulse && `Pulse ${pulse} bpm`,
    temp && `Temp ${temp}`,
    spo2 && `SpO2 ${spo2}%`,
    weight && `Weight ${weight} kg`,
    height && `Height ${height} cm`,
    fbs && `FBS ${fbs} mg/dL`,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
  // One block per step, in wizard order, each with an Edit shortcut back to
  // the screen that owns it. Every value is read from the page's own state -
  // nothing here is a second copy of the data.
  const reviewSections = [
    {
      key: INTERVIEW_STEP,
      title: "Patient Interview",
      stepKey: INTERVIEW_STEP,
      rows: [
        {
          label: "Patient",
          value: `${getPatientName(selectedPatient)} · #${selectedPatientId}`,
        },
        {
          label: "Visit",
          value: [
            dateOfVisit && formatLongDate(dateOfVisit, ""),
            timeOfVisit && formatDisplayTime(timeOfVisit),
          ]
            .filter(Boolean)
            .join(" · "),
        },
        { label: "Chief Complaint", value: chiefComplaint },
        { label: "History of Present Illness", value: summaryOfPresentIllness },
      ],
    },
    {
      key: "vitals",
      title: "Vital Signs",
      // A subsection of Physical Examination.
      stepKey: ASSESSMENT_STEP,
      rows: [{ label: "Measurements", value: vitalsSummary }],
    },
    // Only when a section was edited; Edit reopens the card expanded.
    ...(canViewBackground && editedSectionKeys(backgroundUpdate).length
      ? [{
          key: "patient-background",
          title: "Patient Background Changes",
          stepKey: "patient-background",
          rows: editedSectionKeys(backgroundUpdate).flatMap((section) =>
            backgroundChangeRows(selectedPatient?.medicalBackground, backgroundUpdate.sections[section], section).map((row) => ({
              label: `${BACKGROUND_SECTION_LABELS[section]} · ${row.label}`,
              value: `Before: ${row.before || "Not recorded"}\nAfter: ${row.after || "Not recorded"}`,
            })),
          ),
        }]
      : []),
    {
      key: ASSESSMENT_STEP,
      title: "Physical Exam & Assessment",
      stepKey: ASSESSMENT_STEP,
      rows: [
        { label: "Physical Exam", value: physicalExam },
        { label: "Body Findings", value: formatBodyFindings(bodyFindings) },
        { label: "Suspected Case", value: formatDiagnoses(diagnoses) || diagnosis },
        { label: "Assessment Notes", value: assessmentNotes },

        // The selection itself is listed under Program / Service Details
        // when there is one; only its absence is stated here.
        ...(programFormSteps.length === 0
          ? [{ label: "Programs / Services", value: "None — General Consultation" }]
          : []),
      ],
    },
    {
      key: "actions-taken",
      title: "Actions Taken",
      // Sits under Assessment on the same screen.
      stepKey: ASSESSMENT_STEP,
      rows: [
        { label: "Actions Taken", value: treatmentValue },
        { label: "Medicines / Supplies", value: dispensedMedicines.map(item => item.medicineName + " · " + item.quantity + " " + item.unit + " · " + (item.confirmedGiven ? "Dispensed/Given" : "Planned")).join("\n") },
      ],
    },
    // Present only when a program was chosen. Edit opens the first program
    // form; Next from there walks the rest in order.
    ...programFormSteps.map(step => ({
      key: step.key, title: step.label, stepKey: step.key,
      rows: programReviewRows({
        Maternal: maternalData,
        Immunization: { vaccineEntries: immunizationVaccineEntries, breastfeedingMonitoring: immunizationData.breastfeedingMonitoring },
        "Family Planning": familyPlanningData,
        "TB DOTS / TB Monitoring": tbData,
      }[step.classification]),
    })),
    {
      key: NEXT_STEP,
      title: "Care Plan & Next Steps",
      stepKey: NEXT_STEP,
      rows: [
        ...carePlanReviewRows({
          diagnoses,
          continuedMonitorings,
          stops: monitoringStops,
          registry: clinicalRegistry,
          referral: {
            needed: carePlanDisposition.needsReferral,
            reason: referralForm.reasonForReferral,
            priority: normalizeAttention(referralForm.urgencyLevel),
          },
          followUp: {
            shows: carePlanFollowUp.shows,
            date: followUpDate && formatLongDate(followUpDate, ""),
            time: followUpTime && formatDisplayTime(followUpTime),
            reason: followUpReason,
          },
        }),
        // The Additional Clinical Notes entered on Care Plan & Next Steps.
        ...(monitoringNotes ? [{ label: "Notes", value: monitoringNotes }] : []),
      ],
    },
    ...(monitoringDetailKeys.includes("tb_dots")
      ? [{
          key: MONITORING_STEP,
          title: "Monitoring Details · TB-DOTS Treatment Card",
          stepKey: MONITORING_STEP,
          rows: programReviewRows(tbData),
        }]
      : []),
  ];
  const reviewErrorMessages = Object.values(validationErrors).filter(Boolean);

  /**
   * Walk one screen back through the wizard.
   *
   * Every supported entry opens on the form with patient context already fixed,
   * so Back from the first screen leaves the workspace.
   */
  function goToWizardPhase(phase) {
    closeDateTimePopovers();
    setWizardPhase(phase);
  }

  function handleStepBack() {
    closeDateTimePopovers();

    if (wizardPhase === WIZARD_REVIEW) {
      goToStepKey(reviewBackTarget(monitoringDetailKeys));
      return;
    }
    if (wizardPhase === WIZARD_NEXT) {
      goToStepKey(nextPhaseBackTarget(nextScreen) || formSequence[formSequence.length - 1]);
      return;
    }
    if (wizardPhase === WIZARD_FORM) {
      handleFormStepPrevious();
      return;
    }

    navigate(`${basePath}/patients/${selectedPatientId}`);
  }

  return (
    <DashboardLayout role={userRole} title={pageTitle}>
      <div className={`ehr-consult${inConsultationWorkspace ? " ehr-consult--pinned" : ""}`}>
      <style>{keyframes}</style>
      <UnfinishedConsultationModal
        draft={draftDecision}
        selectedPatientName={getPatientName(selectedPatient)}
        busy={draftDecisionBusy || Boolean(draftResumingId)}
        error={draftDecisionError}
        onCancel={closeDraftDecision}
        onDiscardAndStart={discardConflictingDraftAndStart}
        onContinue={continueConflictingDraft}
      />



      <div className="ehr-consult__stage">
      <ConsultationWorkspaceBody>
      {/* Barangay Health Services (Interview step) or the Body Preview (Assessment
          step) lives in a fixed column to the right of the form.
          From 1024px this column stays put and only the form column
          (heading included) scrolls (see consultation-ehr.css); below that everything
          stacks and the page scrolls. Notices scroll with the form and sit
          outside the fieldset so a locked review does not disable them. */}
      <div className={`ehr-consult__grid${showSidePanel ? " ehr-consult__grid--panel lg:grid lg:grid-cols-[minmax(0,1fr)_264px] lg:items-start lg:gap-4" : ""}`}>
      <div className="@container min-w-0 ehr-consult__form" data-consult-scroll>
      {inConsultationWorkspace && stepIndicator}
      {activeDraft?.reviewState === "review" && canFinalize && <details className="mb-4 rounded-none border border-gray-200 p-4"><summary className="cursor-pointer text-sm font-medium">Return for Correction</summary><p className="my-2 text-sm text-gray-600">Use only when the encoder must verify or complete information.</p><textarea aria-label="Correction note" className="w-full rounded-none border border-gray-300 p-3" value={correctionNote} onChange={event => setCorrectionNote(event.target.value)} /><Button type="button" disabled={!correctionNote.trim()} onClick={async () => { try { if (canSaveCurrentDraft && !(await flushDraftBeforeLeave())) return; const identity = getDraftIdentity() || activeDraft; await transitionDraft(identity.id, "return", identity.version, correctionNote.trim()); bypassLeaveGuardRef.current = true; navigate("/bhc/patients/" + selectedPatientId); } catch (error) { toast.error(error.message); } }}>Return for Correction</Button></details>}
      {activeDraft?.returnNote && <div role="status" className="mb-4 rounded-none bg-amber-50 p-4 text-sm">Return for Correction: {activeDraft.returnNote}</div>}
      {draftMedicineWarnings.length > 0 && (
        <div
          className="mb-4 ml-0 mr-auto flex w-full max-w-7xl items-start gap-3 rounded-none border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Review resumed medicine selections</p>
            {draftMedicineWarnings.map((warning) => (
              <p key={warning} className="mt-1 text-xs leading-5 text-amber-800">
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}
      <fieldset disabled={workspaceLocked} className="min-w-0">
      {wizardPhase === WIZARD_NEXT ? (
        <NextActionStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          saving={false}
          saveLabel="Save Record"
          savingLabel="Saving health record..."
          title=""
          subtitle=""
          indicator={stepHeadingSlot}
        >
          {carePlanScreen}
        </NextActionStep>
      ) : wizardPhase === WIZARD_REVIEW ? (
        <ConsultationReviewStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          sections={reviewSections}
          errors={reviewErrorMessages}
          onEditStep={key => {
            if (activeDraft?.reviewState === "review" && !(currentUser?.permissions || []).includes("records.correct")) return;
            if (key === "patient-background") { setBackgroundExpanded(true); goToStepKey(INTERVIEW_STEP); return; }
            goToStepKey(key);
          }}
          indicator={stepHeadingSlot}
          notice={canViewBackground && backgroundConflicts?.length ? (
            <BackgroundConflictPanel
              key={backgroundConflicts.map((conflict) => `${conflict.section}:${conflict.revision}`).join("|")}
              conflicts={backgroundConflicts}
              update={backgroundUpdate}
              onApply={applyBackgroundConflictChoices}
            />
          ) : null}
        />
      ) : (
      <form
        onSubmit={handleFormStepNext}
        noValidate
        className="relative ml-0 mr-auto w-full max-w-5xl pb-16"
      >
        {isFirstConsultationStep ? (
          // The first step is the Patient Interview: Chief Complaint / HPI and
          // Patient Background, each section under its own heading.
          <section className={CONSULTATION_CARD_CLASS}>
            {/* HPI is marked required for a general consultation; whether that
                applies is decided at Clinical Assessment, which enforces it. */}
            <FormSection title="Chief Complaint & History of Present Illness" subtitle="Why the patient is here today, in their own words and yours." delay={3}>
            <div className="grid gap-4 @xl:grid-cols-2">
              <FieldTextarea label="Chief Complaint" required name="chiefComplaint" error={validationErrors.chiefComplaint} value={chiefComplaint} onChange={event => { clearValidationError("chiefComplaint"); setChiefComplaint(event.target.value); }} placeholder="Describe the patient's chief complaint..." rows={3} />
              <FieldTextarea label="History of Present Illness" name="summaryOfPresentIllness" error={validationErrors.summaryOfPresentIllness} value={summaryOfPresentIllness} onChange={event => { clearValidationError("summaryOfPresentIllness"); setSummaryOfPresentIllness(event.target.value); }}  rows={3} />
            </div>
            </FormSection>

            {/* Patient Background: history taking belongs with the interview,
                so it sits after Chief Complaint / HPI. */}
            <FormSection title="Patient Background" subtitle="Past medical, family, and personal & social history. Changes are saved when the consultation is finalized." delay={4}>
              <ConsultationBackgroundCard
                locked={!canViewBackground}
                loading={selectedPatientLoading}
                background={selectedPatient?.medicalBackground}
                update={backgroundUpdate}
                onUpdateChange={setBackgroundUpdate}
                expanded={backgroundExpanded}
                onExpandedChange={setBackgroundExpanded}
              />
            </FormSection>
          </section>
        ) : (
        <div className={CONSULTATION_CARD_CLASS}>
        <div className="anim-fade-up" style={stagger(2)}>
          {showMaternalPatientWarning &&
            activeFormStep === programStepKey("Maternal") && (
              <div className="pb-4">
                <MaternalClassificationWarning />
              </div>
            )}
        </div>


        {/* ImmunizationVisitFields renders its own titled sections, so it is
            placed directly in the card rather than inside a FormSection. */}
        {!patientGateLocked && isImmunization && showProgramBlock("Immunization") && (
          <div className="anim-fade-up" style={stagger(2)}>
            {immunizationVaccineEntries.length > 0 && <section className="mb-4 space-y-3 rounded-none border border-gray-200 p-4"><h3 className="text-sm font-semibold">Vaccine Administration — Inventory</h3><p className="text-xs text-gray-600">Select the matching inventory item and its stock-unit quantity. Do not repeat it in Medicines / Supplies.</p>{immunizationVaccineEntries.map((entry, index) => <fieldset key={entry.vaccineName} disabled={!(currentUser?.permissions || []).includes("items.dispense")} className="grid gap-2 border-t border-gray-100 pt-3 @xl:grid-cols-3"><legend className="text-sm font-medium">{entry.vaccineName}</legend><select aria-label={entry.vaccineName + " inventory item"} className="rounded-none border border-gray-200 p-2" value={entry.medicineId || ""} onChange={event => updateVaccineInventory(index, "medicineId", event.target.value)}><option value="">Select inventory item</option>{bhcMedicineInventory.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select><input aria-label={entry.vaccineName + " inventory quantity"} className="rounded-none border border-gray-200 p-2" type="number" min="1" step="1" placeholder="Stock-unit quantity" value={entry.inventoryQuantity || ""} onChange={event => updateVaccineInventory(index, "inventoryQuantity", event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.confirmedGiven === true} onChange={event => updateVaccineInventory(index, "confirmedGiven", event.target.checked)} />Confirmed Administered</label></fieldset>)}</section>}
            <ImmunizationVisitFields
              vaccineOptions={CHILD_VACCINE_OPTIONS}
              entries={immunizationVaccineEntries}
              epiHistoryByCode={epiHistoryByCode}
              epiCompletion={epiCompletion}
              epiHistoryLoading={epiHistoryLoading}
              epiHistoryError={epiHistoryError}
              temperature={temp}
              pulse={pulse}
              spo2={spo2}
              weight={weight}
              height={height}
              breastfeedingMonitoring={immunizationData.breastfeedingMonitoring}
              breastfeedingMonths={BREASTFEEDING_MONTHS}
              consultationNotes={consultationNotes}
              hideBasicMonitoring
              errors={validationErrors}
              onTemperatureChange={setTemp}
              onPulseChange={setPulse}
              onSpo2Change={setSpo2}
              onWeightChange={setWeight}
              onHeightChange={setHeight}
              onBreastfeedingChange={handleBreastfeedingChange}
              onToggleVaccine={handleVaccineToggle}
              onNotesChange={setConsultationNotes}
              medicinesSlot={null}
            />
          </div>
        )}


        {!patientGateLocked && isMaternal && !selectedPatientIsMale && showProgramBlock("Maternal") && (
          <>
            {showMaternalPatientWarning && <MaternalClassificationWarning />}

            <FormSection
              title="Pregnancy / Obstetric Information"
              subtitle="Record pregnancy and obstetric information for this prenatal consultation."
              delay={3}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="space-y-5">
                  <div>
                    <p className={MATERNAL_EYEBROW_CLASS}>Pregnancy Information</p>
                    <div className="grid gap-4 @xl:grid-cols-2">
                      <DatePickerField
                        label="LMP"
                        value={maternalData.lmp}
                        onChange={(value) => handleMaternalChange("lmp", value)}
                      />
                      {/* Filled from LMP (Naegele's rule), and still editable. */}
                      <DatePickerField
                        label="EDC"
                        value={expectedDeliveryDate}
                        onChange={setExpectedDeliveryDate}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 @xl:grid-cols-2">
                    {OB_SCORE_GP_FIELDS.map((field) => (
                      <FieldInput
                        key={field.key}
                        label={field.label}
                        type="number"
                        min="0"
                        placeholder={field.placeholder}
                        value={maternalData[field.key]}
                        onChange={(event) =>
                          handleMaternalChange(field.key, event.target.value)
                        }
                      />
                    ))}
                  </div>

                  <div>
                    <p className={MATERNAL_EYEBROW_CLASS}>OB Score (TPAL)</p>
                    <div className="grid grid-cols-2 gap-4 @xl:grid-cols-4">
                      {OB_SCORE_TPAL_FIELDS.map((field) => (
                        <FieldInput
                          key={field.key}
                          label={field.label}
                          type="number"
                          min="0"
                          placeholder="0"
                          value={maternalData[field.key]}
                          onChange={(event) =>
                            handleMaternalChange(field.key, event.target.value)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className={MATERNAL_EYEBROW_CLASS}>Current Prenatal Information</p>
                    <div className="grid gap-4 @xl:grid-cols-2">
                      {/* Calculated from LMP and the visit date, and still editable. */}
                      <FieldInput
                        label="AOG (Age of Gestation)"
                        placeholder="e.g. 28 weeks"
                        value={aog}
                        onChange={(event) => setAog(event.target.value)}
                      />
                      <FieldInput
                        label="FHT (Fetal Heart Tone)"
                        placeholder="e.g. 140 bpm"
                        value={maternalData.fht}
                        onChange={(event) =>
                          handleMaternalChange("fht", event.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Medical History"
              subtitle="Mark any risk factors and medical conditions relevant to this pregnancy."
              delay={4}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-6 @xl:grid-cols-2 @3xl:grid-cols-3">
                  {MATERNAL_RISK_GROUPS.map((group) => (
                    <RiskCodeChecklist
                      key={group.key}
                      eyebrow={group.eyebrow}
                      options={group.options}
                      values={maternalData.riskAssessment}
                      onChange={handleRiskAssessmentChange}
                    />
                  ))}
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Laboratory Results"
              subtitle="Record laboratory test results taken for this pregnancy."
              delay={5}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="overflow-x-auto rounded-none border border-[#E8ECF0]">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#EEF2F6] bg-gray-50">
                        {["Test", "Result", "Date"].map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#374151]"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MATERNAL_LAB_TESTS.map((test) => (
                        <tr
                          key={test.key}
                          className="border-b border-[#EEF2F6] last:border-b-0"
                        >
                          <th
                            scope="row"
                            className="w-1/3 px-4 py-2 text-sm font-medium text-[#1F2937]"
                          >
                            {test.label}
                          </th>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              aria-label={`${test.label} result`}
                              placeholder="Enter result..."
                              value={maternalData.laboratoryResults?.[test.key] || ""}
                              onChange={(event) =>
                                handleNestedMaternalChange(
                                  "laboratoryResults",
                                  test.key,
                                  event.target.value,
                                )
                              }
                              className={MATERNAL_TABLE_INPUT_CLASS}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <DatePickerField
                              hideLabel
                              label={`${test.label} date`}
                              value={maternalData.laboratoryResultDates?.[test.key] || ""}
                              onChange={(value) =>
                                handleNestedMaternalChange(
                                  "laboratoryResultDates",
                                  test.key,
                                  value,
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="OB History"
              subtitle="Record the client's prior family planning method use."
              delay={6}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 @xl:grid-cols-2">
                  <FieldSelect
                    label="Previous FP Method Used"
                    value={maternalData.previousFpMethodUsed}
                    onChange={(event) =>
                      handleMaternalChange(
                        "previousFpMethodUsed",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Select method...</option>
                    {PREVIOUS_FP_METHOD_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </FieldSelect>
                  {maternalData.previousFpMethodUsed === "Other" && (
                    <FieldInput
                      label="Specify FP Method"
                      value={maternalData.previousFpMethodOther}
                      onChange={(event) =>
                        handleMaternalChange(
                          "previousFpMethodOther",
                          event.target.value,
                        )
                      }
                    />
                  )}
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Immunization This Visit"
              subtitle="Record any immunization given during this prenatal visit."
              delay={7}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 @xl:grid-cols-3">
                  <FieldSelect
                    label="Immunization Type"
                    value={maternalData.immunizationThisVisit?.type || ""}
                    onChange={(event) =>
                      handleNestedMaternalChange(
                        "immunizationThisVisit",
                        "type",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Select vaccine...</option>
                    {PRENATAL_IMMUNIZATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FieldSelect>
                  <FieldInput
                    label="Dose / Status"
                    placeholder="Enter dose or status..."
                    value={maternalData.immunizationThisVisit?.doseStatus || ""}
                    onChange={(event) =>
                      handleNestedMaternalChange(
                        "immunizationThisVisit",
                        "doseStatus",
                        event.target.value,
                      )
                    }
                  />
                  <DatePickerField
                    label="Date Given"
                    value={maternalData.immunizationThisVisit?.dateGiven || ""}
                    onChange={(value) =>
                      handleNestedMaternalChange(
                        "immunizationThisVisit",
                        "dateGiven",
                        value,
                      )
                    }
                  />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Ultrasound"
              subtitle="Record the latest ultrasound result and date for this pregnancy."
              delay={8}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 @xl:grid-cols-2">
                  <FieldInput
                    label="Ultrasound Result"
                    value={maternalData.ultrasound?.result || ""}
                    onChange={(event) =>
                      handleNestedMaternalChange(
                        "ultrasound",
                        "result",
                        event.target.value,
                      )
                    }
                  />
                  <DatePickerField
                    label="Date of Ultrasound"
                    value={maternalData.ultrasound?.dateDone || ""}
                    onChange={(value) =>
                      handleNestedMaternalChange("ultrasound", "dateDone", value)
                    }
                  />
                </div>
              </LockedFormContent>
            </FormSection>
          </>
        )}

        {!patientGateLocked && isFamilyPlanning && showProgramBlock("Family Planning") && (
          <FormSection
            title="Family Planning Details"
            subtitle="Record client type, method, and visit details."
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
              <div className="grid gap-4 @xl:grid-cols-2">
                <FieldSelect
                  label="Type of Client"
                  required
                  value={familyPlanningData.clientType}
                  onChange={(event) =>
                    handleFamilyPlanningChange("clientType", event.target.value)
                  }
                >
                  <option value="">Select type of client...</option>
                  {FP_CLIENT_TYPE_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>
                <RadioChoiceGroup
                  label="Source"
                  name="familyPlanningSource"
                  inline
                  value={familyPlanningData.source}
                  options={FP_SOURCE_OPTIONS}
                  onChange={(value) =>
                    handleFamilyPlanningChange("source", value)
                  }
                />

                <FieldSelect
                  label="Previous Method"
                  value={familyPlanningData.previousMethod}
                  onChange={(event) =>
                    handleFamilyPlanningChange(
                      "previousMethod",
                      event.target.value,
                    )
                  }
                >
                  <option value="">Select previous method...</option>
                  {PREVIOUS_FP_METHOD_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>

                <FieldSelect
                  label="Method Used / Accepted"
                  required
                  name="familyPlanningMethodUsed"
                  error={validationErrors.familyPlanningMethodUsed}
                  value={familyPlanningData.methodUsed}
                  onChange={(event) => {
                    clearValidationError("familyPlanningMethodUsed");
                    handleFamilyPlanningChange(
                      "methodUsed",
                      event.target.value,
                    );
                  }}
                >
                  <option value="">Select method used / accepted...</option>
                  {applicableFamilyPlanningMethods.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                  {/* A stored method that the current filter excludes stays
                      selectable so editing a record does not blank it. */}
                  {familyPlanningData.methodUsed &&
                    !applicableFamilyPlanningMethods.includes(
                      familyPlanningData.methodUsed,
                    ) && (
                      <option key={familyPlanningData.methodUsed}>
                        {familyPlanningData.methodUsed}
                      </option>
                    )}
                </FieldSelect>
                {selectedPatientIsMale && (
                  <p className="text-[11px] leading-relaxed text-gray-500 sm:col-span-2">
                    This patient is recorded as male, so only male-applicable
                    methods are listed.
                  </p>
                )}

              </div>
            </LockedFormContent>
          </FormSection>
        )}

        {/* Clinical Assessment: one screen for every consultation. */}
        {activeFormStep === ASSESSMENT_STEP && (
          <>
            <FormSection
              title="Physical Examination"
              subtitle="Record the patient's vital signs and examination findings for this visit."
              delay={3}
            >
              <LockedFormContent locked={patientGateLocked}>
                {/* Vital Signs: recorded once, here. Program forms do not repeat
                    them. Three columns on desktop: BP | Pulse | SpO2, then
                    Weight | Height | Temperature, then BMI. */}
                <div>
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#111827]">Vital Signs</h3>
                  <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
                    <BpInputGroup name="bloodPressure" systolic={systolicBp} diastolic={diastolicBp} onSystolicChange={setSystolicBp} onDiastolicChange={setDiastolicBp} />
                    <FieldInput label="Pulse Rate" name="pulse" error={validationErrors.pulse} type="number" value={pulse} onChange={event => setPulse(event.target.value)} placeholder="bpm" />
                    <FieldInput label="SpO₂" name="spo2" error={validationErrors.spo2} type="number" value={spo2} onChange={event => setSpo2(event.target.value)} placeholder="%" />
                    <FieldInput label="Weight" name="weight" error={validationErrors.weight} type="number" value={weight} onChange={event => setWeight(event.target.value)} placeholder="kg" />
                    <FieldInput label="Height" name="height" error={validationErrors.height} type="number" value={height} onChange={event => setHeight(event.target.value)} placeholder="cm" />
                    <FieldInput label="Temperature" name="temp" error={validationErrors.temp} value={temp} onChange={event => setTemp(event.target.value)} placeholder="°C" />
                    <BmiOutputField weight={weight} height={height} />
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#374151]">Additional Measurements</p>
                    <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
                      <FieldInput label="Fasting Blood Sugar (FBS) (mg/dL)" name="fbs" data-field="vital_signs.fbs" error={validationErrors["vital_signs.fbs"] || validationErrors.fbs} type="number" inputMode="decimal" min={0} max={1000} step="any" value={fbs} onChange={event => { clearValidationError("fbs"); clearValidationError("vital_signs.fbs"); setFbs(event.target.value); }} placeholder="mg/dL" />
                    </div>
                  </div>
                </div>
                <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#111827]">Physical Findings</h3>
                  <FieldTextarea
                    label="General Examination Notes"
                    value={physicalExam}
                    onChange={(event) => setPhysicalExam(event.target.value)}
                    placeholder="Document general or non-localized examination findings for this visit..."
                    rows={4}
                  />
                  <BodyFindingsList
                    findings={bodyFindings}
                    readOnly={workspaceLocked}
                    onEdit={(item) => {
                      // Show the finding's side first; the dialog anchors to that side's dot.
                      setBodyPreviewSide(item.side);
                      setBodyFindingDialog({ region: item.region, side: item.side, anchor: null, editingId: item.id });
                    }}
                    onRemove={(id) => setBodyFindings((current) => current.filter((item) => item.id !== id))}
                  />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Assessment"
              subtitle="Record the suspected case for this visit."
              delay={3}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div data-field="diagnosis" tabIndex={-1} className="outline-none">
                  <MonitoredConditionsNote conditions={continuedMonitorings} />
                  <DiagnosisListField
                    diagnoses={diagnoses}
                    onChange={updateDiagnoses}
                    canAddToConditions={(currentUser?.permissions || []).includes("clinical.history")}
                    currentConditions={selectedPatient?.medicalBackground?.currentDiseases}
                    error={validationErrors.diagnosis}
                    defaultReportAs={defaultReportAs}
                  />
                </div>
                <FieldTextarea
                  label="Additional Assessment Notes"
                  wrapperClassName="mt-4"
                  value={assessmentNotes}
                  onChange={(event) => setAssessmentNotes(event.target.value)}
                  placeholder="Optional. Longer explanation that does not belong in the suspected case."
                  maxLength={5000}
                  rows={3}
                />
              </LockedFormContent>
            </FormSection>

            {/* Actions Taken: treatment given and inventory dispensed. It sits under
                Assessment on the same screen (it used to be its own step). */}
            {treatmentBindings.length > 0 && (
              <FormSection
                title="Actions Taken"
                subtitle="Document the treatment, medication plan, or other management for this visit."
                delay={3}
              >
                <LockedFormContent locked={patientGateLocked}>
                  <FieldTextarea
                    label="Actions Taken"
                    value={treatmentValue}
                    onChange={(event) => handleTreatmentChange(event.target.value)}
                    placeholder="Medications, procedures, advice given..."
                    rows={4}
                  />
                </LockedFormContent>
              </FormSection>
            )}
            {isFamilyPlanning && (
              <FormSection
                title="Family Planning Medicines / Supplies"
                subtitle="Record medicines or supplies given to the client."
                delay={4}
              >
                <LockedFormContent locked={patientGateLocked}>
                  <FieldTextarea
                    label="Medicines / Supplies"
                    value={familyPlanningData.medicinesSupplies}
                    onChange={(event) =>
                      handleFamilyPlanningChange(
                        "medicinesSupplies",
                        event.target.value,
                      )
                    }
                    placeholder="List items dispensed..."
                    rows={3}
                  />
                </LockedFormContent>
              </FormSection>
            )}
            <FormSection
              title="Medicines / Supplies Dispensed"
              subtitle="Optional medicines or supplies given from BHC inventory during this visit."
              delay={5}
            >
              <LockedFormContent locked={patientGateLocked}>
                <DispensedMedicinesSection
                  inventory={bhcMedicineInventory}
                  value={dispensedMedicines}
                  onChange={handleDispensedMedicinesChange}
                  pendingDraftError={validationErrors.dispensedMedicines}
                  onPendingDraftChange={handlePendingDispensedMedicineChange}
                  disabled={!(currentUser?.permissions || []).includes("items.dispense")}
                  loading={bhcMedicineInventoryLoading}
                  error={bhcMedicineInventoryError}
                  onRetry={() =>
                    setBhcMedicineInventoryReloadKey((key) => key + 1)
                  }
                />
              </LockedFormContent>
            </FormSection>
          </>
        )}




        </div>
        )}
      </form>
      )}
      </fieldset>
      </div>
      {showSidePanel && (showProgramPanel ? (
        <fieldset disabled={workspaceLocked} className="contents">
          {programPanel}
        </fieldset>
      ) : (
        // Outside the locked fieldset so the flip button still works in a
        // locked review; the panel enforces readOnly itself.
        <BodyPreviewPanel
          findings={bodyFindings}
          onChange={setBodyFindings}
          readOnly={workspaceLocked || patientGateLocked}
          dialog={bodyFindingDialog}
          onDialogChange={setBodyFindingDialog}
          sex={selectedPatient?.sex}
          side={bodyPreviewSide}
          onSideChange={setBodyPreviewSide}
        />
      ))}
      </div>
      </ConsultationWorkspaceBody>

      {inConsultationWorkspace && (
        <ConsultationActionBar
          onPrevious={handleWorkspacePrevious}
          previousLabel={
            currentStepKey === INTERVIEW_STEP
              ? "Back to Patient"
              : activeProgramStep
                ? serviceFormReturnLabel
                : "Previous"
          }
          // Autosave status stays visible throughout the consultation.
          // Review, where Save Consultation is the one action that commits.
          secondaryAction={autosaveStatus}
          onContinue={handleWorkspaceContinue}
          continueLabel={isReviewStep ? (canFinalize ? (needsReferral ? "Finalize Consultation & Submit Referral" : "Finalize Consultation") : "Submit for Review") : activeProgramStep ? "Done" : "Next"}
          continueDisabled={activeDraft?.reviewState === "review" && !canFinalize}
          continueBusy={isReviewStep ? saving : false}
          continueBusyLabel={isReviewStep ? "Saving..." : "Loading..."}
        />
      )}

      </div>
      <SuccessModal
        open={Boolean(saveSuccess)}
        title={
          saveSuccess?.referralSubmitted
              ? "Health Record and Referral Submitted"
            : "Health Record Saved"
        }
        description={
          saveSuccess?.awaitingDoctor
              ? "Consultation finalized. Referral: Awaiting Doctor Availability. Submission Status: Not Yet Submitted. Authorized BHC staff will be notified to review and manually submit when a doctor is available."
            : saveSuccess?.referralSubmitted
              ? "The health record was saved and the referral was linked for RHU review."
              : "The record is available in this patient's history and Health Records. You can view it, print it, or open the patient profile."
        }
        onClose={() => navigate(healthRecordsPath)}
        actions={[
          {
            label: "View Health Record",
            variant: "primary",
            onClick: () =>
              navigate(
                saveSuccess?.recordId
                  ? `${healthRecordsPath}/${saveSuccess.recordId}`
                  : healthRecordsPath,
              ),
          },
          ...(saveSuccess?.recordId
            ? [
                {
                  label: "Print Record",
                  onClick: () =>
                    navigate(
                      `${healthRecordsPath}/${saveSuccess.recordId}?print=1`,
                    ),
                },
              ]
            : []),
          {
            label: "Open Patient",
            onClick: () => navigate(`${basePath}/patients/${selectedPatientId}`),
          },
        ]}
      />

      <NoticeModal
        open={leaveBlocker.state === "blocked"}
        title="Leave Consultation?"
        message={leaveError || "Your progress is saved automatically and can be resumed later."}
        closeDisabled={leavingConsultation || saving}
        onClose={() => {}}
        dismissOnBackdrop={false}
        actions={[
          { label: "Continue Consultation", variant: "secondary", disabled: leavingConsultation || saving,
            onClick: () => { setLeaveError(""); leaveBlocker.reset?.(); } },
          { label: leavingConsultation ? "Saving..." : "Leave & Resume Later", disabled: leavingConsultation || saving,
            onClick: leaveAndResumeLater },
        ]}
      />
      <NoticeModal
        open={Boolean(noticeModal)}
        title={noticeModal?.title}
        message={noticeModal?.message}
        buttonText={noticeModal?.buttonLabel || "OK"}
        actions={
          noticeModal
            ? noticeModal.actions?.length
              ? noticeModal.actions
              : [
                  {
                    label: noticeModal.buttonLabel || "OK",
                    variant: "primary",
                    onClick: noticeModal.onClose,
                  },
                ]
            : []
        }
        onClose={() => setNoticeModal(null)}
      />
      {/* Connection lost mid-consultation. Reuses the existing modal rather
          than adding another: the work is already protected on this device,
          so the choice is simply keep going or try the server again now. */}
      <ConnectionIssueModal
        open={connectionLostOpen}
        title="Connection Lost"
        message={[
          draftLocalStatus === "saved"
            ? "Your current consultation is secured on this device."
            : "Your current consultation is not yet secured on this device. Keep this page open and reconnect.",
          offlineRetryNotice,
        ]
          .filter(Boolean)
          .join(" ")}
        detail={null}
        retryLabel="Retry"
        retryLoadingLabel="Syncing..."
        onContinue={dismissConnectionLost}
        onRetry={handleOfflineDraftRetry}
      />

      {/* Offered once on a fresh entry. "Not Now" leaves the encrypted copy
          in place, so declining never destroys unsynced clinical work. */}
      <NoticeModal
        open={Boolean(localRecovery)}
        title="Unfinished Consultation on This Device"
        message={`A consultation for ${localRecovery?.record?.draft?.patient?.label || "a patient"} was kept on this device when the connection dropped and has not reached the server yet. Recover it to continue where you left off.`}
        onClose={() => setLocalRecovery(null)}
        actions={[
          {
            label: "Recover Consultation",
            variant: "primary",
            onClick: handleRecoverLocalDraft,
          },
          {
            label: "Not Now",
            variant: "secondary",
            onClick: () => setLocalRecovery(null),
          },
          {
            label: "Discard",
            variant: "destructive",
            onClick: handleDiscardLocalRecovery,
          },
        ]}
      />

      <ConnectionIssueModal
        open={Boolean(connectionIssue)}
        title={connectionIssue?.title}
        message={connectionIssue?.message}
        retryDisabled={
          saving || (typeof navigator !== "undefined" && navigator.onLine === false)
        }
        retryLabel="Retry Save"
        retryLoading={saving}
        onContinue={() => setConnectionIssue(null)}
        onRetry={handleRetryFailedHealthRecord}
      />
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FORM SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FormSection({ title, subtitle, children, delay = 0, accent }) {
  return (
    <section
      className={`anim-fade-up rounded-none border border-[#E5E7EB] bg-white ${
        accent === "pink" ? "border-l-4 border-l-[#DC2626]" : ""
      }`}
      style={stagger(delay)}
    >
      <div className="border-b border-[#E5E7EB] px-4 py-2.5">
        <h2 className="text-[14px] font-bold leading-snug text-[#111827]">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
            {subtitle}
          </p>
        )}
      </div>

      <div className="p-4">{children}</div>
    </section>
  );
}

function LockedFormContent({ locked, children }) {
  if (!locked) return children;

  return (
    <fieldset disabled className="space-y-4">
      <div className="rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        Select a patient first to continue.
      </div>
      <div className="pointer-events-none opacity-60">{children}</div>
    </fieldset>
  );
}




function MaternalClassificationWarning() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">
        Please verify the selected patient before creating a maternal record.
      </p>
    </div>
  );
}

function FieldInput({
  label,
  required,
  error,
  className = "",
  wrapperClassName = "",
  ...props
}) {
  const inputClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full rounded-none border px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60 ${inputClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}

function FieldSelect({
  label,
  required,
  error,
  children,
  className = "",
  wrapperClassName = "",
  ...props
}) {
  const selectClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full appearance-none rounded-none border px-3 text-sm text-[#111827] outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${selectClass} ${className}`}
      >
        {children}
      </select>
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}

function FieldTextarea({
  label,
  required,
  error,
  rows = 3,
  className = "",
  wrapperClassName = "",
  ...props
}) {
  const textareaClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        {...props}
        aria-invalid={Boolean(error)}
        rows={rows}
        className={`w-full resize-none rounded-none border px-3 py-2 text-sm leading-relaxed text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] ${textareaClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}

function BpInputGroup({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
  required = false,
  error = "",
  name,
}) {
  return (
    <div data-field={name} tabIndex={error ? -1 : undefined}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        Blood Pressure (mmHg) {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          placeholder="Systolic"
          value={systolic}
          onChange={(event) => onSystolicChange(event.target.value)}
          className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-9 w-10 shrink-0 items-center justify-center border-y border-[#E5E7EB] bg-[#F9FAFB] text-sm font-bold text-[#6B7280]">
          /
        </div>
        <input
          type="number"
          placeholder="Diastolic"
          value={diastolic}
          onChange={(event) => onDiastolicChange(event.target.value)}
          className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>
      ) : (
        <p className="mt-1 text-[9px] text-[#BFBFBF]">Systolic / Diastolic</p>
      )}
    </div>
  );
}

/**
 * Read-only BMI derived from the weight and height already captured in Vital
 * Signs. It is display-only and never submitted: the record stores the two
 * measurements, so a stored BMI could only ever disagree with them.
 */
/**
 * A risk-code checklist column.
 *
 * An option with `children` renders them indented beneath it and only while the
 * parent is checked, matching the prenatal record where the sub-conditions
 * qualify the code rather than standing on their own.
 */
/**
 * A row of small number inputs that together make up one clinical score, with
 * the assembled shorthand shown beneath so the clinician can read back what
 * they entered without re-parsing the boxes.
 */
/**
 * One column of prenatal risk factors: a red sub-heading over a flat list of
 * checkboxes. Grouping into Risk Codes happens in the change handler, not on
 * screen.
 */
function RiskCodeChecklist({ eyebrow, options, values = {}, onChange }) {
  return (
    <div>
      <p className={MATERNAL_EYEBROW_CLASS}>{eyebrow}</p>
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const checked = Boolean(values[option.key]);
          return (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-2.5 text-sm font-medium"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(option.key, event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-none border-[#D1D5DB] accent-[#DC2626]"
              />
              <span className={checked ? "font-semibold text-[#DC2626]" : "text-gray-600"}>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function BmiOutputField({ weight, height }) {
  const bmi = calculateBmi(weight, height);
  const category = getBmiCategory(bmi);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        BMI
      </label>
      <div className="flex h-9 w-full items-center justify-between rounded-none border border-[#E5E7EB] bg-[#F9FAFB] px-3">
        <span className="text-sm font-bold text-gray-900">
          {bmi === null ? "—" : formatBmi(bmi)}
        </span>
        {category && (
          <span className="text-[11px] font-bold uppercase text-[#DC2626]">
            {category}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMMUNIZATION SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   PATIENT DISPLAY HELPERS
   ═══════════════════════════════════════════════════════════════ */
function getPatientName(patient = {}) {
  return formatPatientName(patient, "Unnamed Patient");
}

function getReferringFacilityName(user = {}) {
  return formatFacilityName(
    user.barangayHealthCenter ||
      user.barangay_health_center ||
      user.assignedBarangayHealthCenter ||
      user.facility ||
      user.facilityName ||
      user.facility_name,
    "Barangay Health Center",
  );
}

function getPatientBirthDate(patient = {}) {
  return (
    patient.birthdate ||
    patient.birthDate ||
    patient.dateOfBirth ||
    patient.date_of_birth ||
    patient.dob ||
    ""
  );
}

function getPatientAddress(patient = {}) {
  return formatDisplayValue(
    patient.address ||
      patient.streetAddress ||
      patient.street_address ||
      [
        patient.purokArea || patient.purok_area,
        patient.barangay || patient.patientBarangay,
        patient.municipality,
      ]
        .filter(Boolean)
        .join(", "),
    "",
  );
}

function getPatientPhilHealthNumber(patient = {}) {
  return formatDisplayValue(
    patient.philHealthNumber ||
      patient.philhealthNumber ||
      patient.philhealth_number,
    "",
  );
}

function getPatientPhilHealthCategory(patient = {}) {
  return formatDisplayValue(
    patient.philHealthCategory ||
      patient.philhealthCategory ||
      patient.philhealth_category ||
      patient.philHealthStatus ||
      patient.philhealthStatus ||
      patient.philhealth_status,
    "",
  );
}

function getPatientAgeSexCivilStatus(patient = {}) {
  const display = getPatientDisplay(patient);
  const age = display.age;
  const civilStatus = formatDisplayValue(
    patient.civilStatus || patient.civil_status,
    "",
  );

  return [age, civilStatus].filter(Boolean).join(" / ");
}

function getPatientDisplay(patient = {}) {
  const name = getPatientName(patient);
  const age = formatDisplayValue(
    patient.ageSex ||
      (patient.age
        ? `${patient.age} yrs${patient.sex ? ` / ${patient.sex}` : ""}`
        : patient.sex),
    "",
  );
  const cls = formatDisplayValue(
    patient.patientClassification || patient.category,
    "",
  );
  const contact = formatDisplayValue(
    patient.contactNumber || patient.contact,
    "",
  );
  const barangay = formatDisplayValue(
    patient.barangay || patient.patientBarangay,
    "",
  );
  const id = formatDisplayValue(patient.patientId || patient.id, "");

  return { name, age, cls, contact, barangay, id };
}

function getPatientSexText(patient = {}) {
  const source = patient || {};

  return String(
    source.sex ||
      source.gender ||
      source.patientSex ||
      source.patientGender ||
      source.ageSex ||
      "",
  )
    .trim()
    .toLowerCase();
}

function hasPatientSex(patient = {}) {
  return Boolean(getPatientSexText(patient || {}));
}

function isPatientMale(patient = {}) {
  const sexText = getPatientSexText(patient || {});

  return sexText === "m" || /\bmale\b/.test(sexText);
}
