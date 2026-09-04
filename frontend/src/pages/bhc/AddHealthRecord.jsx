import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  ClipboardList,
  FileClock,
  HeartPulse,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionIssueModal,
  Drawer,
  HealthRecordFormSkeleton,
  NoticeModal,
  SuccessModal,
} from "../../components/common";
import { DatePickerField } from "../../components/common/forms/DatePickerField";
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import InlineSpinner from "../../components/common/loading/InlineSpinner";
import DispensedMedicinesSection from "../../components/features/medicine/DispensedMedicinesSection";
import healthRecordService, {
  getHealthRecordById,
  getHealthRecordsByPatient,
} from "../../services/healthRecordService";
import {
  discardHealthRecordDraft,
  getHealthRecordDraft,
  listHealthRecordDrafts,
} from "../../services/healthRecordDraftService";
import useDraftAutosave from "../../hooks/useDraftAutosave";
import { useDoctorAvailability } from "../../hooks/useDoctorAvailability";
import {
  isNoProviderAvailableError,
  isPreferredProviderInvalidError,
  isPreferredProviderUnavailableError,
} from "../../services/referrals";
import {
  DEFAULT_ATTENTION,
  normalizeAttention,
} from "../../utils/referralAttention";
import { formatDisplayTime } from "../../utils/healthRecordPrograms";
import {
  FP_CLIENT_TYPE_OPTIONS,
  FP_SOURCE_OPTIONS,
  PREVIOUS_FP_METHOD_OPTIONS,
} from "../../utils/familyPlanning";
import { calculateBmi, formatBmi, getBmiCategory } from "../../utils/bmi";
import DraftSaveStatus from "../../components/features/health-records/DraftSaveStatus";
import ImmunizationVisitFields from "../../components/features/health-records/ImmunizationVisitFields";
import { ClinicalSection } from "../../components/features/health-records/fields/ClinicalFields";
import NextActionSection from "../../components/features/health-records/NextActionSection";
import {
  ConsultationSetupStep,
  FollowUpConfirmStep,
  FollowUpSelectStep,
  NextActionStep,
  ProgramSelectStep,
} from "../../components/features/health-records/wizard/HealthRecordWizardSteps";
import {
  NEXT_ACTION_NONE,
  deriveNextAction,
  getNextActionPatch,
  isLegacyFollowUpStatus,
} from "../../utils/nextAction";
import TbTreatmentCardForm, {
  EMPTY_TB_DATA,
  normalizeTbData,
} from "../../components/features/health-records/TbTreatmentCardForm";
import {
  BHC_MEDICINES_UPDATED_EVENT,
  getBhcMedicines,
  loadMedicineAvailability,
  refreshRhuMedicines,
} from "../../services/medicineService";
import { getPatientDetailsListByRole } from "../../services/patientService";
import {
  getFollowUpTask,
  getFollowUpTasks,
} from "../../services/followUpTaskService";
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
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { createIdempotencyKey } from "../../utils/idempotency";
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

const WIZARD_SETUP = "setup";
const WIZARD_PROGRAM = "program";
const WIZARD_FU_SELECT = "fuSelect";
const WIZARD_FU_CONFIRM = "fuConfirm";
const WIZARD_FORM = "form";
const WIZARD_NEXT = "next";

const RECORD_TYPE_OPTIONS = [
  "General Consultation",
  "Immunization",
  "Maternal",
  "Family Planning",
  "Hypertension / Diabetic Monitoring",
  "TB DOTS / TB Monitoring",
];
const HEALTH_RECORD_CONNECTION_LOST_MESSAGE =
  "The server did not confirm this submission. Your form remains available in this tab. Keep this page open, check the patient's recent records, and retry when the connection is stable.";
const DRAFT_SUPPORTED_RECORD_TYPES = new Set([
  "General Consultation",
  "Immunization",
  "Maternal",
  "Family Planning",
  "Hypertension / Diabetic Monitoring",
  "TB DOTS / TB Monitoring",
]);

function pickDraftFields(source = {}, keys = []) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key] ?? ""]));
}

function formatDraftDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDraftExpiry(value) {
  if (!value) return "Expiry unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Expiry unavailable";
  return `Expires ${new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
  }).format(date)}`;
}

/**
 * Display copy for the Select Program step. The KEYS are the stored
 * classification values (RECORD_TYPE_OPTIONS) and must not change - only the
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
  "Hypertension / Diabetic Monitoring": {
    title: "Hypertension / Diabetic",
    description: "Monitoring and management of chronic NCDs.",
    icon: Zap,
  },
  "TB DOTS / TB Monitoring": {
    title: "TB DOTS",
    description: "Directly observed treatment for tuberculosis.",
    icon: Syringe,
  },
};

function getDefaultMorbidityReportingStatus(recordType = "") {
  return normalizeRecordType(recordType) === "General Consultation"
    ? "morbidity"
    : "not_included";
}

function toBooleanYesNo(value) {
  const normalized = String(value || "").toLowerCase();
  return value === true || normalized === "yes" || normalized === "true";
}

function getHealthRecordPatientId(record = {}) {
  return String(
    record.patientId ||
      record.patient_id ||
      record.patient?.id ||
      record.patient?.patientId ||
      record.patient?.patient_id ||
      "",
  );
}

function normalizeMorbidityReportingStatus(value, fallback = "not_included") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["not_included", "morbidity", "notifiable"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function deriveMorbidityReportingStatus(source = {}, fallback = "not_included") {
  const monitoringData = source.monitoringData || source.monitoring_data || {};
  const status = normalizeMorbidityReportingStatus(
    source.morbidityReportingStatus ||
      source.morbidity_reporting_status ||
      monitoringData.morbidityReportingStatus ||
      monitoringData.morbidity_reporting_status,
    "",
  );

  if (status) return status;

  const included = toBooleanYesNo(
    source.includeInMorbidityReport ??
      source.include_in_morbidity_report ??
      monitoringData.includeInMorbidityReport ??
      monitoringData.include_in_morbidity_report,
  );
  const notifiable = toBooleanYesNo(
    source.isNotifiableDisease ??
      source.is_notifiable_disease ??
      monitoringData.isNotifiableDisease ??
      monitoringData.is_notifiable_disease,
  );

  if (!included) return fallback;
  return notifiable ? "notifiable" : "morbidity";
}

function getSurveillanceCategoryValue(source = {}) {
  const monitoringData = source.monitoringData || source.monitoring_data || {};
  const value =
    source.surveillanceCategory ||
    source.surveillance_category ||
    source.diseaseSurveillanceCategory ||
    source.disease_surveillance_category ||
    source.diseaseCategory ||
    source.disease_category ||
    monitoringData.surveillanceCategory ||
    monitoringData.surveillance_category ||
    monitoringData.diseaseSurveillanceCategory ||
    monitoringData.disease_surveillance_category ||
    monitoringData.diseaseCategory ||
    monitoringData.disease_category ||
    "";
  return normalizeSurveillanceCategoryValue(value);
}

function getHfmdSurveillanceValue(source = {}) {
  const monitoringData = source.monitoringData || source.monitoring_data || {};
  const explicit =
    source.hfmdSurveillance ??
    source.hfmd_surveillance ??
    monitoringData.hfmdSurveillance ??
    monitoringData.hfmd_surveillance;

  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return toBooleanYesNo(explicit);
  }

  return getSurveillanceCategoryValue(source) === "hfmd";
}

function normalizeSurveillanceCategoryValue(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized === "hfmd" ||
    normalized.includes("hand, foot") ||
    normalized.includes("hand foot") ||
    normalized.includes("mouth disease")
  ) {
    return "hfmd";
  }
  if (normalized === "other") return "other";
  return normalized;
}

function getMorbidityDecisionFlags(status) {
  const normalized = normalizeMorbidityReportingStatus(status);
  return {
    includeInMorbidityReport: normalized !== "not_included",
    isNotifiableDisease: normalized === "notifiable",
  };
}

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

const EMPTY_HYPERTENSION_DIABETIC_DATA = {
  bp: "",
  fbs: "",
  conditionType: "",
  clientStatus: "",
  dateOfLastConsultation: "",
  treatmentActionTaken: "",
};

const HYPERTENSION_DIABETIC_CONDITION_OPTIONS = [
  { value: "hpn", label: "HPN" },
  { value: "dm", label: "DM" },
  { value: "both", label: "BOTH" },
];

const HYPERTENSION_DIABETIC_CLIENT_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "old", label: "Old" },
];

const EMPTY_MATERNAL_DATA = {
  lmp: "",
  pmp: "",
  cycleDuration: "",
  gravida: "",
  para: "",
  term: "",
  preterm: "",
  abortion: "",
  living: "",
  bmi: "",
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
  tetanusToxoidStatus: {
    tt1: "",
    tt2: "",
    tt3: "",
    tt4: "",
    tt5: "",
  },
  ultrasound: {
    result: "",
    dateDone: "",
  },
};

/**
 * Prenatal risk codes, as they appear on the DOH prenatal record.
 *
 * Risk Code D and Risk Code E are parents whose children are only recorded -
 * and only shown - when the parent applies. Unchecking a parent clears its
 * children so a hidden sub-condition can never be submitted.
 */
const PREGNANCY_RISK_CODES = [
  { key: "ageRisk", label: "Risk Code A: Age < 18 or > 35" },
  { key: "heightRisk", label: "Risk Code B: Height < 145 cm" },
  {
    key: "grandMultipara",
    label: "Risk Code C: Grand multipara / 4+ pregnancies",
  },
  {
    key: "previousPregnancyComplications",
    label: "Risk Code D: Previous Pregnancy Complications",
    children: [
      { key: "previousCs", label: "Previous C/S" },
      {
        key: "recurrentMiscarriageOrStillbirth",
        label: "3 consecutive miscarriages or stillbirth",
      },
      { key: "postpartumHemorrhage", label: "Post-partum hemorrhage (PPH)" },
    ],
  },
];

const MEDICAL_CONDITION_CODES = [
  {
    key: "medicalConditions",
    label: "Risk Code E (Medical Conditions)",
    children: [
      { key: "tuberculosis", label: "Tuberculosis" },
      { key: "heartDisease", label: "Heart Disease" },
      { key: "diabetes", label: "Diabetes" },
      { key: "bronchialAsthma", label: "Bronchial Asthma" },
      { key: "goiter", label: "Goiter" },
    ],
  },
];

const OTHER_IMPORTANT_INFORMATION = [
  { key: "hypertensive", label: "Hypertensive" },
  { key: "alcoholUser", label: "Alcohol User" },
  { key: "smoker", label: "Smoker" },
];

/**
 * OB score components, recorded as separate counts rather than one string.
 *
 * These bind to the maternalData fields the record already stored, so the
 * `tpal` value sent with the record ("term-preterm-abortion-living") keeps
 * being derived from them and no new payload key is introduced.
 */
const OB_SCORE_TPAL_FIELDS = [
  { key: "term", short: "T", label: "T (Term Pregnancies)", placeholder: "0" },
  {
    key: "preterm",
    short: "P",
    label: "P (Preterm Pregnancies)",
    placeholder: "0",
  },
  {
    key: "abortion",
    short: "A",
    label: "A (Abortions / Miscarriages)",
    placeholder: "0",
  },
  { key: "living", short: "L", label: "L (Living Children)", placeholder: "0" },
];

const OB_SCORE_GP_FIELDS = [
  {
    key: "gravida",
    short: "G",
    label: "G (Gravida - Total Pregnancies)",
    placeholder: "1",
  },
  {
    key: "para",
    short: "P",
    label: "P (Para - Viable Births)",
    placeholder: "1",
  },
];

/** "T1 P0 A0 L1" / "G2 P1" - the shorthand a clinician reads back. */
function formatObScore(fields, values = {}) {
  return fields
    .map((field) => `${field.short}${values[field.key] || 0}`)
    .join(" ");
}

const TETANUS_TOXOID_FIELDS = [
  { key: "tt1", label: "TT1 Date" },
  { key: "tt2", label: "TT2 Date" },
  { key: "tt3", label: "TT3 Date" },
  { key: "tt4", label: "TT4 Date" },
  { key: "tt5", label: "TT5 Date" },
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
    tetanusToxoidStatus: {
      ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
      ...(source.tetanus_toxoid_status || {}),
      ...(source.tetanusToxoidStatus || {}),
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
  if (
    lower.includes("senior") ||
    lower.includes("ncd") ||
    lower.includes("hypertension") ||
    lower.includes("diabetic") ||
    lower.includes("diabetes") ||
    lower.includes("non communicable")
  ) {
    return "Hypertension / Diabetic Monitoring";
  }
  if (lower.includes("general") || lower.includes("consult")) {
    return "General Consultation";
  }

  return raw;
}

function normalizeHypertensionDiabeticCondition(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["hpn", "hypertension", "high blood pressure"].includes(normalized)) {
    return "hpn";
  }
  if (["dm", "diabetes", "diabetic", "diabetes mellitus"].includes(normalized)) {
    return "dm";
  }
  if (["both", "hpn/dm", "hpn dm", "hypertension diabetes"].includes(normalized)) {
    return "both";
  }
  return normalized;
}

function normalizeHypertensionDiabeticClientStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["new", "old"].includes(normalized) ? normalized : normalized;
}

function mergeHypertensionDiabeticData(data = {}, fallback = {}) {
  const source = data || {};
  return {
    ...EMPTY_HYPERTENSION_DIABETIC_DATA,
    ...source,
    bp:
      source.bp ||
      source.bloodPressure ||
      source.blood_pressure ||
      fallback.bp ||
      "",
    fbs:
      source.fbs ||
      source.fastingBloodSugar ||
      source.fasting_blood_sugar ||
      source.bloodSugar ||
      source.blood_sugar ||
      fallback.fbs ||
      "",
    conditionType: normalizeHypertensionDiabeticCondition(
      source.conditionType ||
        source.condition_type ||
        fallback.conditionType ||
        fallback.condition_type ||
        "",
    ),
    clientStatus: normalizeHypertensionDiabeticClientStatus(
      source.clientStatus ||
        source.client_status ||
        fallback.clientStatus ||
        fallback.client_status ||
        "",
    ),
    dateOfLastConsultation:
      source.dateOfLastConsultation ||
      source.date_of_last_consultation ||
      source.lastConsultationDate ||
      source.last_consultation_date ||
      fallback.dateOfLastConsultation ||
      fallback.date_of_last_consultation ||
      "",
    treatmentActionTaken:
      source.treatmentActionTaken ||
      source.treatment_action_taken ||
      source.actionTaken ||
      source.action_taken ||
      source.treatment ||
      source.medication ||
      fallback.treatmentActionTaken ||
      fallback.treatment_action_taken ||
      fallback.medication ||
      "",
  };
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

function normalizeDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function getFollowUpTaskState(task = {}) {
  const state = String(task.state || task.status || task.followUpStatus || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (state === "fulfilled" || state === "completed") return "fulfilled";
  if (state === "cancelled" || state === "canceled") return "cancelled";
  if (state === "no show") return "no_show";
  if (state === "due today") return "due_today";
  if (state === "rescheduled") return "rescheduled";
  if (state === "pending") return "pending";

  const dueDate = normalizeDateOnly(task.dueDate || task.due_date);
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate && dueDate < today) return "no_show";
  if (dueDate === today) return "due_today";
  return "pending";
}

function isActiveFollowUpTask(task = {}) {
  return ["pending", "due_today", "no_show", "rescheduled"].includes(
    getFollowUpTaskState(task),
  );
}

function getFollowUpTaskServiceType(task = {}) {
  const source =
    task.healthRecord?.category ||
    task.healthRecord?.patientClassification ||
    task.healthRecord?.recordType ||
    task.healthRecord?.record_type ||
    task.category ||
    task.patientClassification ||
    task.recordType ||
    "";
  return normalizeRecordType(source);
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

function getFamilyPlanningEligibility(patient, referenceDate) {
  if (!patient) return { eligible: true };

  if (isPatientMale(patient)) {
    return {
      eligible: false,
      message:
        "Family Planning records are for female reproductive health clients. Please choose another classification.",
    };
  }

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
export default function AddHealthRecord() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || "rhu";
  const currentUserName = formatUserName(currentUser, "");
  const currentBhcFacilityId = String(
    currentUser?.barangayHealthCenterId ||
      currentUser?.bhcId ||
      currentUser?.facilityId ||
      "",
  ).trim();
  const basePath = userRole === "bhc" ? "/bhc" : "/rhu";
  const healthRecordsPath = `${basePath}/health-records`;

  const recordId = searchParams.get("recordId");
  const followUpTaskId =
    searchParams.get("followUpId") || searchParams.get("follow_up_id") || "";
  const preselectedPatientId = searchParams.get("patientId") || "";
  const preselectedClassification = normalizeRecordType(
    searchParams.get("serviceType") ||
      searchParams.get("classification") ||
      searchParams.get("category") ||
      searchParams.get("recordType") ||
      searchParams.get("healthRecordType"),
  );
  const requestedMode =
    searchParams.get("mode") || (recordId ? "follow-up" : "create");
  const normalizedRequestedMode = requestedMode
    .toLowerCase()
    .replace(/[_-]+/g, "");
  const isFollowUpRouteMode = ["followup"].includes(normalizedRequestedMode);
  const isFollowUp = !!recordId && isFollowUpRouteMode;
  const isOrphanFollowUpRequest =
    !recordId &&
    isFollowUpRouteMode &&
    !followUpTaskId &&
    !(preselectedPatientId && preselectedClassification);
  // Editing an already-saved health record is intentionally disabled. Records are
  // read-only after saving; corrections are made via a new record or follow-up visit.
  // The ?mode=edit URL path is no longer reachable from the UI and is neutralized here.
  const isEditingRecord = false;
  const hasRouteFollowUpContext =
    !isEditingRecord &&
    isFollowUpRouteMode &&
    Boolean(followUpTaskId || (preselectedPatientId && preselectedClassification));
  const isDraftRouteEligible =
    userRole === "bhc" && !isEditingRecord && !isFollowUpRouteMode;

  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsLoadError, setPatientsLoadError] = useState("");
  const [patientsReloadKey, setPatientsReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [lastFailedSubmit, setLastFailedSubmit] = useState(null);
  const officialSubmissionRef = useRef(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  // The wizard is a single ordered phase rather than a set of booleans so that
  // "which screen am I on" has exactly one answer. Editing an existing record
  // and the route-driven follow-up entry both open straight on the form.
  const [wizardPhase, setWizardPhase] = useState(() =>
    Boolean(recordId) || Boolean(preselectedPatientId && preselectedClassification)
      ? WIZARD_FORM
      : WIZARD_SETUP,
  );
  const [consultationType, setConsultationType] = useState(null);
  const [selectedFollowUpTaskId, setSelectedFollowUpTaskId] = useState("");
  // Kept as a derived value: everything downstream (drafts, medicine warnings,
  // the header search) only ever asked "are we past the setup screens".
  const setupComplete =
    wizardPhase === WIZARD_FORM || wizardPhase === WIZARD_NEXT;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [draftsDrawerOpen, setDraftsDrawerOpen] = useState(false);
  const searchWrapperRef = useRef(null);
  const inputRef = useRef(null);
  const classificationRef = useRef(null);

  const [dateOfVisit, setDateOfVisit] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [timeOfVisit, setTimeOfVisit] = useState(
    new Date().toTimeString().split(" ")[0].slice(0, 5),
  );
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [summaryOfPresentIllness, setSummaryOfPresentIllness] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medication, setMedication] = useState("");
  const [attendingStaff, setAttendingStaff] = useState(currentUserName);
  const [consultationNotes, setConsultationNotes] = useState("");
  const [healthRecordType, setHealthRecordType] = useState(
    preselectedClassification,
  );
  const [morbidityReportingStatus, setMorbidityReportingStatus] = useState(
    getDefaultMorbidityReportingStatus(preselectedClassification),
  );
  const [hfmdSurveillance, setHfmdSurveillance] = useState(false);

  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temp, setTemp] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const [followUpStatus, setFollowUpStatus] = useState("Routine Monitoring");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [patientCondition, setPatientCondition] = useState("Improving");
  const [careDecisionStep, setCareDecisionStep] = useState(false);
  const [needsReferral, setNeedsReferral] = useState(false);
  // Same server-backed source the BHC dashboard and CreateReferral use.
  const { availability: rhuDoctorAvailability } = useDoctorAvailability();
  // The last referral submission, kept in a ref so the Decision A retry can
  // resubmit the exact same payload without re-deriving it from form state.
  const lastReferralAttemptRef = useRef(null);
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
    preferredRhuDoctorId: "",
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
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [draftListError, setDraftListError] = useState("");
  const [draftResumingId, setDraftResumingId] = useState("");
  const [draftDiscardingId, setDraftDiscardingId] = useState("");
  const [activeDraft, setActiveDraft] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftMedicineWarnings, setDraftMedicineWarnings] = useState([]);

  const loadHealthRecordDrafts = useCallback(async () => {
    if (!isDraftRouteEligible) return;
    setDraftListLoading(true);
    setDraftListError("");
    try {
      setHealthRecordDrafts(await listHealthRecordDrafts());
    } catch (error) {
      setDraftListError(
        isConnectionError(error)
          ? "Unable to load drafts. Please check your connection and try again."
          : error?.message || "Unable to load drafts right now.",
      );
    } finally {
      setDraftListLoading(false);
    }
  }, [isDraftRouteEligible]);

  useEffect(() => {
    void loadHealthRecordDrafts();
  }, [loadHealthRecordDrafts]);

  useEffect(() => {
    function clearInMemorySubmissionState() {
      officialSubmissionRef.current = null;
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
  const [hypertensionDiabeticData, setHypertensionDiabeticData] = useState(
    EMPTY_HYPERTENSION_DIABETIC_DATA,
  );
  const [tbData, setTbData] = useState(EMPTY_TB_DATA);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");
  const [followUpRecord, setFollowUpRecord] = useState(null);

  const [immunizationData, setImmunizationData] = useState(
    EMPTY_IMMUNIZATION_DATA,
  );
  const [epiHistoryRecords, setEpiHistoryRecords] = useState([]);
  const [epiHistoryLoading, setEpiHistoryLoading] = useState(false);
  const [epiHistoryError, setEpiHistoryError] = useState("");
  const [routeLinkedFollowUpTask, setRouteLinkedFollowUpTask] = useState(null);
  const [autoLinkedFollowUpTask, setAutoLinkedFollowUpTask] = useState(null);
  const [activePatientFollowUps, setActivePatientFollowUps] = useState([]);
  const [activeFollowUpLookup, setActiveFollowUpLookup] = useState({
    key: "",
    isChecking: false,
  });

  const rhuProviders = useMemo(
    () =>
      (rhuDoctorAvailability.providers || []).map((provider) => ({
        id: provider.id,
        name: provider.name,
        role: provider.specialization || "General Practitioner",
        status: provider.availabilityStatus,
        note: provider.remarks || "",
      })),
    [rhuDoctorAvailability],
  );
  // DOC-14 is computed by the server; the client only mirrors it.
  const noProviderMessage =
    "The receiving Rural Health Unit has no available doctor right now. This referral cannot be submitted until the RHU marks a doctor available.";


  useEffect(() => {
    if (!isOrphanFollowUpRequest) return undefined;

    setNoticeModal({
      title: "Original Record Required",
      message:
        "Follow-up visits must start from an existing Follow-up Required health record. Redirecting back to Health Records.",
    });

    const timer = window.setTimeout(() => navigate(healthRecordsPath), 2200);
    return () => window.clearTimeout(timer);
  }, [healthRecordsPath, isOrphanFollowUpRequest, navigate]);

  useEffect(() => {
    let active = true;

    async function loadPatients() {
      try {
        setPatientsLoading(true);
        setPatientsLoadError("");
        const parsedPatients = await getPatientDetailsListByRole("bhc", {
          search: searchTerm.trim(),
          per_page: 50,
        });
        if (!active) return;
        setPatients(parsedPatients || []);
        setPatientsLoadError("");
        if (preselectedPatientId) setSelectedPatientId(preselectedPatientId);
      } catch (error) {
        if (!active) return;
        setPatientsLoadError(
          isConnectionError(error)
            ? "Unable to load patients. Please check your connection and try again."
            : error?.message ||
                "Unable to load patients. Please check your connection and try again.",
        );
      } finally {
        if (active) setPatientsLoading(false);
      }
    }

    const timer = window.setTimeout(loadPatients, searchTerm.trim() ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [preselectedPatientId, patientsReloadKey, searchTerm]);

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

  useEffect(() => {
    if (!recordId) return;

    async function loadExistingRecord() {
      const found = await getHealthRecordById(recordId, "bhc");
      const foundPatientId = getHealthRecordPatientId(found);
      if (foundPatientId) setSelectedPatientId(foundPatientId);

      if (!found || !isEditingRecord) return;

      setDateOfVisit(
        found.dateOfVisit || new Date().toISOString().split("T")[0],
      );
      setTimeOfVisit(
        found.timeOfVisit ||
          new Date().toTimeString().split(" ")[0].slice(0, 5),
      );
      setChiefComplaint(found.chiefComplaint || "");
      setSummaryOfPresentIllness(found.summaryOfPresentIllness || "");
      setDiagnosis(found.diagnosis || "");
      setMedication(found.medication || found.initialActionsTaken || "");
      setAttendingStaff(found.attendingStaff || found.recordedBy || "");
      setConsultationNotes(found.consultationNotes || "");
      setMorbidityReportingStatus(
        deriveMorbidityReportingStatus(
          found,
          getDefaultMorbidityReportingStatus(
            found.category ||
              found.recordType ||
              found.patientClassification ||
              found.patient?.patientClassification ||
              found.patient?.category,
          ),
        ),
      );
      setHfmdSurveillance(getHfmdSurveillanceValue(found));
      setSystolicBp(found.systolicBp || "");
      setDiastolicBp(found.diastolicBp || "");
      setTemp(found.temperature || found.temp || "");
      setWeight(found.weight || "");
      setHeight(found.height || "");
      setFollowUpStatus(normalizePatientStatus(found.followUpStatus));
      setFollowUpDate(found.followUpDate || "");
      setMonitoringNotes(found.monitoringNotes || "");
      setPatientCondition(found.patientCondition || "Improving");
      const existingMaternalData = found.maternalData || found.maternal_data || {};
      setMaternalData(
        mergeMaternalData(existingMaternalData, {
          ...found,
          treatment: found.medication || found.initialActionsTaken || "",
          notes: found.consultationNotes || "",
        }),
      );
      setExpectedDeliveryDate(
        existingMaternalData.expectedDeliveryDate ||
          found.expectedDeliveryDate ||
          "",
      );
      setAog(existingMaternalData.aog || found.aog || "");
      setTbData(normalizeTbData(found.tbData || found.tb_data));
      const existingFamilyPlanningData =
        found.familyPlanningData || found.family_planning_data || {};
      setFamilyPlanningData({
        clientType:
          existingFamilyPlanningData.clientType ||
          existingFamilyPlanningData.client_type ||
          "",
        methodUsed:
          existingFamilyPlanningData.methodUsed ||
          existingFamilyPlanningData.method_used ||
          "",
        previousMethod:
          existingFamilyPlanningData.previousMethod ||
          existingFamilyPlanningData.previous_method ||
          "",
        fpVisitType:
          existingFamilyPlanningData.fpVisitType ||
          existingFamilyPlanningData.fp_visit_type ||
          existingFamilyPlanningData.visitType ||
          existingFamilyPlanningData.visit_type ||
          "",
        source: existingFamilyPlanningData.source || "",
        dateRegistered:
          existingFamilyPlanningData.dateRegistered ||
          existingFamilyPlanningData.date_registered ||
          "",
        dateOfVisit:
          existingFamilyPlanningData.dateOfVisit ||
          existingFamilyPlanningData.date_of_visit ||
          "",
        nextAppointmentDate:
          existingFamilyPlanningData.nextAppointmentDate ||
          existingFamilyPlanningData.next_appointment_date ||
          "",
        remarks: existingFamilyPlanningData.remarks || "",
        actionTaken:
          existingFamilyPlanningData.actionTaken ||
          existingFamilyPlanningData.action_taken ||
          "",
        hasClinicalConcern:
          existingFamilyPlanningData.hasClinicalConcern ||
          existingFamilyPlanningData.has_clinical_concern ||
          (existingFamilyPlanningData.fpVisitType === "Side-effect Concern"
            ? "Yes"
            : "No"),
        concern: existingFamilyPlanningData.concern || "",
        findings: existingFamilyPlanningData.findings || "",
        adviceGiven:
          existingFamilyPlanningData.adviceGiven ||
          existingFamilyPlanningData.advice_given ||
          "",
      });
      const existingMonitoringData = found.monitoringData || found.monitoring_data || {};
      const existingHypertensionDiabeticData =
        found.hypertensionDiabeticData ||
        found.hypertension_diabetic_data ||
        existingMonitoringData.hypertensionDiabeticData ||
        existingMonitoringData.hypertension_diabetic_data ||
        {};
      setHypertensionDiabeticData(
        mergeHypertensionDiabeticData(existingHypertensionDiabeticData, {
          ...existingMonitoringData,
          ...found,
          medication: found.medication || found.initialActionsTaken || "",
        }),
      );
      setHealthRecordType(
        normalizeRecordType(
          found.category ||
            found.recordType ||
            found.patientClassification ||
            found.patient?.patientClassification ||
            found.patient?.category,
        ),
      );
      if (found.immunizationData) setImmunizationData(found.immunizationData);
    }

    loadExistingRecord();
  }, [recordId, isEditingRecord]);

  useEffect(() => {
    async function loadFollowUpPreview() {
      if (!isFollowUp) {
        if (!routeLinkedFollowUpTask?.healthRecord) {
          setFollowUpRecord(null);
        }
        return;
      }

      const found = (await getHealthRecordById(recordId, "bhc")) || null;
      setFollowUpRecord(found);
      const foundPatientId = getHealthRecordPatientId(found);
      if (foundPatientId) setSelectedPatientId(foundPatientId);
      setHealthRecordType(
        normalizeRecordType(
          found?.category ||
            found?.recordType ||
            found?.patientClassification ||
            found?.patient?.patientClassification ||
            found?.patient?.category,
        ),
      );
    }

    loadFollowUpPreview();
  }, [isFollowUp, recordId, routeLinkedFollowUpTask]);

  useEffect(() => {
    let active = true;

    async function loadRouteFollowUpTask() {
      if (!hasRouteFollowUpContext || !followUpTaskId) {
        setRouteLinkedFollowUpTask(null);
        return;
      }

      try {
        const task = await getFollowUpTask(followUpTaskId);
        if (!active) return;

        setRouteLinkedFollowUpTask(task || null);

        if (!task) return;

        if (task.patientId) setSelectedPatientId(String(task.patientId));
        const taskServiceType = getFollowUpTaskServiceType(task);
        if (taskServiceType) {
          setHealthRecordType(taskServiceType);
        }
        if (task.healthRecord) {
          setFollowUpRecord(task.healthRecord);
        }
        setConsultationType("followup");
        setSelectedFollowUpTaskId(String(task.id));
        setWizardPhase(WIZARD_FORM);
      } catch {
        if (active) setRouteLinkedFollowUpTask(null);
      }
    }

    loadRouteFollowUpTask();

    return () => {
      active = false;
    };
  }, [followUpTaskId, hasRouteFollowUpContext]);

  const selectedPatientFromList = patients.find(
    (patient) => String(patient.id) === String(selectedPatientId),
  );
  const selectedPatient =
    selectedPatientFromList ||
    (routeLinkedFollowUpTask?.patient &&
    String(routeLinkedFollowUpTask.patientId) === String(selectedPatientId)
      ? routeLinkedFollowUpTask.patient
      : null) ||
    (isFollowUp &&
    followUpRecord?.patient &&
    getHealthRecordPatientId(followUpRecord) === String(selectedPatientId)
      ? followUpRecord.patient
      : null);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const matchingPatients = useMemo(() => {
    const source = patients || [];

    if (!normalizedSearch) return source;

    return source.filter((patient) =>
      getPatientSearchText(patient).includes(normalizedSearch),
    );
  }, [patients, normalizedSearch]);
  const visiblePatientLimit = normalizedSearch ? 8 : 6;
  const filteredPatients = matchingPatients.slice(0, visiblePatientLimit);

  const visitType = isFollowUp ? "follow_up_visit" : "initial_consultation";
  const followUpPatientName =
    getPatientName(selectedPatient) ||
    routeLinkedFollowUpTask?.patientName ||
    routeLinkedFollowUpTask?.patient?.name ||
    followUpRecord?.patientName ||
    followUpRecord?.patient?.name ||
    "Selected patient";

  useEffect(() => {
    if (!searchExpanded) return undefined;

    function handleClickOutside(event) {
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(event.target)
      ) {
        closeHeaderSearch();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeHeaderSearch();
        return;
      }

      if (!dropdownOpen) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((prev) =>
          filteredPatients.length === 0
            ? -1
            : prev < filteredPatients.length - 1
              ? prev + 1
              : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((prev) =>
          filteredPatients.length === 0
            ? -1
            : prev > 0
              ? prev - 1
              : filteredPatients.length - 1,
        );
        return;
      }

      if (
        event.key === "Enter" &&
        highlightIndex >= 0 &&
        highlightIndex < filteredPatients.length
      ) {
        event.preventDefault();
        selectPatient(filteredPatients[highlightIndex].id);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    searchExpanded,
    dropdownOpen,
    filteredPatients,
    highlightIndex,
  ]);

  useEffect(() => {
    setHighlightIndex(filteredPatients.length > 0 ? 0 : -1);
  }, [searchTerm, filteredPatients.length]);

  function closeHeaderSearch() {
    setDropdownOpen(false);
    setHighlightIndex(-1);
    setSearchExpanded(false);
  }


  function resetClassificationSpecificState() {
    setHealthRecordType("");
    setMorbidityReportingStatus("not_included");
    setHfmdSurveillance(false);
    setMaternalData(EMPTY_MATERNAL_DATA);
    setDispensedMedicines([]);
    setExpectedDeliveryDate("");
    setAog("");
    setImmunizationData(EMPTY_IMMUNIZATION_DATA);
    setFamilyPlanningData(EMPTY_FAMILY_PLANNING_DATA);
    setHypertensionDiabeticData(EMPTY_HYPERTENSION_DIABETIC_DATA);
    setTbData(EMPTY_TB_DATA);
    setDraftMedicineWarnings([]);
  }

  function selectPatient(id) {
    clearValidationError("selectedPatientId");
    if (id !== selectedPatientId) {
      resetClassificationSpecificState();
      setWizardPhase(WIZARD_SETUP);
      setConsultationType(null);
      setSelectedFollowUpTaskId("");
      setCareDecisionStep(false);
      setNeedsReferral(false);
      setAutoLinkedFollowUpTask(null);
      setActivePatientFollowUps([]);
    }
    setSelectedPatientId(id);
    setSearchTerm("");
    setDropdownOpen(false);
    setHighlightIndex(-1);
    setSearchExpanded(false);
  }



  const normalizedHealthRecordType = normalizeRecordType(healthRecordType);
  const activeFollowUpLookupKey =
    !isFollowUp &&
    !isEditingRecord &&
    !hasRouteFollowUpContext &&
    selectedPatientId
      ? String(selectedPatientId)
      : "";
  const isResolvingFollowUpMode =
    Boolean(activeFollowUpLookupKey) &&
    (activeFollowUpLookup.isChecking ||
      activeFollowUpLookup.key !== activeFollowUpLookupKey);
  const recordTypeKey = normalizedHealthRecordType.toLowerCase();
  const isImmunization = recordTypeKey === "immunization";
  const isMaternal = recordTypeKey === "maternal";
  const isFamilyPlanning = recordTypeKey === "family planning";
  const isHypertensionDiabetic =
    recordTypeKey === "hypertension / diabetic monitoring";
  const isTb = recordTypeKey === "tb dots / tb monitoring";
  const effectiveLinkedFollowUpTask =
    routeLinkedFollowUpTask || (isFollowUp ? null : autoLinkedFollowUpTask);
  const effectiveFollowUpParentRecordId = isFollowUp
    ? recordId
    : effectiveLinkedFollowUpTask?.healthRecordId || "";
  const effectiveFollowUpTaskId =
    effectiveLinkedFollowUpTask?.id || followUpTaskId || "";
  const isFollowUpVisitMode =
    isFollowUp ||
    Boolean(effectiveLinkedFollowUpTask) ||
    Boolean(hasRouteFollowUpContext);
  const isLinkedFollowUpVisit =
    isFollowUp || Boolean(effectiveLinkedFollowUpTask);
  const isGeneralConsultationFollowUp =
    isFollowUpVisitMode && recordTypeKey === "general consultation";
  const patientGateLocked = !isFollowUpVisitMode && !selectedPatientId;
  const selectedPatientIsMale =
    !isFollowUpVisitMode && isPatientMale(selectedPatient);
  const selectedPatientSexMissing =
    !isFollowUpVisitMode &&
    Boolean(selectedPatientId) &&
    !hasPatientSex(selectedPatient);
  const followUpPatientHasMaternalMismatch =
    isFollowUpVisitMode &&
    isMaternal &&
    isPatientMale(selectedPatient || followUpRecord?.patient || followUpRecord);
  const showMaternalPatientWarning =
    isMaternal &&
    (followUpPatientHasMaternalMismatch ||
      (!isFollowUpVisitMode && selectedPatientSexMissing));
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
  const showFollowUpMonitoringFields =
    normalizedPatientStatus === "Follow-up Required" && !needsReferral;
  const nextAction = deriveNextAction({ needsReferral, followUpStatus });
  // A record saved before the Next Action step existed can hold "Routine
  // Monitoring", which no card represents. It displays as No Follow-up, but the
  // stored status is left alone until the user actually picks a card - see
  // handleNextActionChange.
  const showsLegacyFollowUpStatus =
    nextAction === NEXT_ACTION_NONE && isLegacyFollowUpStatus(followUpStatus);
  const usesCareDecisionStep = false;
  const immunizationPatientInfo = getImmunizationPatientMode(
    selectedPatient,
    dateOfVisit,
    followUpRecord,
    followUpRecord?.patient,
  );
  const familyPlanningEligibility = getFamilyPlanningEligibility(
    selectedPatient,
    dateOfVisit,
  );
  const immunizationVaccineEntries = getVaccineEntries(immunizationData);
  const epiHistoryByCode = useMemo(
    () =>
      compileEpiHistory(epiHistoryRecords, {
        excludeRecordId: isEditingRecord ? recordId : "",
      }),
    [epiHistoryRecords, isEditingRecord, recordId],
  );
  const epiCompletion = useMemo(
    () => getEpiCompletionState(epiHistoryByCode, immunizationVaccineEntries),
    [epiHistoryByCode, immunizationVaccineEntries],
  );
  const epiWillComplete = isImmunization && epiCompletion.completeAfterSave;
  const epiNeedsNextFollowUp =
    isImmunization && !needsReferral && !epiWillComplete;
  const canSaveCurrentDraft =
    isDraftRouteEligible &&
    setupComplete &&
    Boolean(selectedPatientId) &&
    DRAFT_SUPPORTED_RECORD_TYPES.has(normalizedHealthRecordType) &&
    !isFollowUpVisitMode;

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
      dateOfVisit,
      timeOfVisit,
      chiefComplaint,
      summaryOfPresentIllness,
      diagnosis,
      medication,
      attendingStaff,
      consultationNotes,
      systolicBp,
      diastolicBp,
      temp,
      weight,
      height,
      followUpStatus,
      followUpDate,
      followUpTime,
      monitoringNotes,
      patientCondition,
      morbidityReportingStatus,
      hfmdSurveillance,
      needsReferral,
      careDecisionStep,
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
        laboratoryResults: pickDraftFields(maternalData.laboratoryResults, [
          "hemoglobin",
          "cbc",
          "hbsag",
          "bloodType",
          "hiv",
          "syphilis",
          "urinalysis",
        ]),
        tetanusToxoidStatus: pickDraftFields(
          maternalData.tetanusToxoidStatus,
          ["tt1", "tt2", "tt3", "tt4", "tt5"],
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
      hypertensionDiabeticData: pickDraftFields(hypertensionDiabeticData, [
        "bp",
        "fbs",
        "conditionType",
        "clientStatus",
        "dateOfLastConsultation",
        "treatmentActionTaken",
      ]),
      tbData,
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
        "preferredRhuDoctorId",
      ]),
      dispensedMedicines: dispensedMedicines.map((item) => ({
        medicineId: Number(item.medicineId),
        quantity: Number(item.quantity),
      })),
    };
  }

  function restoreHealthRecordDraft(draft) {
    const payload = draft.payload || {};
    setSelectedPatientId(draft.patient.id);
    setHealthRecordType(normalizeRecordType(draft.classification));
    setDateOfVisit(payload.dateOfVisit || toDateInputValue());
    setTimeOfVisit(payload.timeOfVisit || toTimeInputValue());
    setChiefComplaint(payload.chiefComplaint || "");
    setSummaryOfPresentIllness(payload.summaryOfPresentIllness || "");
    setDiagnosis(payload.diagnosis || "");
    setMedication(payload.medication || "");
    setAttendingStaff(payload.attendingStaff || currentUserName);
    setConsultationNotes(payload.consultationNotes || "");
    setSystolicBp(payload.systolicBp || "");
    setDiastolicBp(payload.diastolicBp || "");
    setTemp(payload.temp || "");
    setWeight(payload.weight || "");
    setHeight(payload.height || "");
    setFollowUpStatus(payload.followUpStatus || "Routine Monitoring");
    setFollowUpDate(payload.followUpDate || "");
    setFollowUpTime(payload.followUpTime || "");
    setMonitoringNotes(payload.monitoringNotes || "");
    setPatientCondition(payload.patientCondition || "Improving");
    setMorbidityReportingStatus(payload.morbidityReportingStatus || "not_included");
    setHfmdSurveillance(Boolean(payload.hfmdSurveillance));
    setNeedsReferral(Boolean(payload.needsReferral));
    setCareDecisionStep(Boolean(payload.careDecisionStep));
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
    setHypertensionDiabeticData({
      ...EMPTY_HYPERTENSION_DIABETIC_DATA,
      ...(payload.hypertensionDiabeticData || {}),
    });
    setTbData(normalizeTbData(payload.tbData));
    setReferralForm((current) => ({
      ...current,
      ...(payload.referralForm || {}),
    }));

    const warnings = [];
    setDispensedMedicines(
      draft.medicineSelections.map((selection) => {
        if (selection.warning) warnings.push(selection.warning);
        const medicine = selection.medicine;
        return {
          medicineId: String(selection.medicine_id),
          medicineName: medicine?.name || "Unavailable medicine",
          category: medicine?.category || "Unavailable",
          availableStock: medicine?.quantity ?? 0,
          quantity: selection.quantity,
          unit: medicine?.unit || "",
          remarks: "",
        };
      }),
    );
    setDraftMedicineWarnings(Array.from(new Set(warnings)));
    setActiveDraft({ id: draft.id, version: draft.version });
    setDraftSavedAt(draft.lastSavedAt);
    setWizardPhase(WIZARD_FORM);
    setValidationErrors({});
  }

  const handleDraftAutosaved = useCallback((saved) => {
    setActiveDraft({ id: saved.id, version: saved.version });
    setDraftSavedAt(saved.lastSavedAt || "");
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
  const draftAutosaveSectionKey = `${normalizedHealthRecordType}|${wizardPhase}|${needsReferral}`;
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

  const draftAutosave = useDraftAutosave({
    enabled: canSaveCurrentDraft,
    patientId: selectedPatientId,
    classification: normalizedHealthRecordType,
    payload: draftAutosavePayload,
    draft: draftIdentity,
    sectionKey: draftAutosaveSectionKey,
    onDraftSaved: handleDraftAutosaved,
  });

  const {
    status: draftAutosaveStatus,
    hasPendingChanges: draftHasPendingChanges,
    conflict: draftConflict,
    error: draftAutosaveError,
    saveNow: saveDraftNow,
    resolveConflict: resolveDraftConflict,
  } = draftAutosave;

  const handleManualSaveDraft = useCallback(() => {
    if (!canSaveCurrentDraft) return;
    void saveDraftNow();
  }, [canSaveCurrentDraft, saveDraftNow]);

  // Non-destructive conflict dialog: never silently overwrite a newer draft.
  useEffect(() => {
    if (!draftConflict) return;
    setNoticeModal({
      title: "Draft Updated Elsewhere",
      message:
        "This draft was updated in another tab or device. Reload the latest version (your unsaved edits here will be discarded) or keep editing without saving.",
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
      title: "Draft Not Saved",
      message:
        draftAutosaveError.message ||
        "Some entries could not be saved. Your form remains available on this page.",
    });
  }, [draftAutosaveError]);

  // Warn before leaving while unsaved changes are still only in memory.
  useEffect(() => {
    if (!draftHasPendingChanges) return undefined;
    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftHasPendingChanges]);

  async function handleResumeDraft(draftId) {
    if (!draftId || draftResumingId) return;
    setDraftResumingId(draftId);
    try {
      restoreHealthRecordDraft(await getHealthRecordDraft(draftId));
    } catch (error) {
      setNoticeModal({
        title: "Unable to Resume Draft",
        message: isConnectionError(error)
          ? "Unable to reach the server. Please check your connection and try again."
          : error?.message || "This draft is no longer available.",
      });
      void loadHealthRecordDrafts();
    } finally {
      setDraftResumingId("");
    }
  }

  function handleDiscardDraft(draft) {
    setNoticeModal({
      title: "Discard Draft?",
      message: `Discard the ${draft.classification} draft for ${draft.patient.label}? This cannot be restored.`,
      actions: [
        {
          label: "Discard Draft",
          onClick: async () => {
            setDraftDiscardingId(draft.id);
            try {
              await discardHealthRecordDraft(draft.id);
              setHealthRecordDrafts((current) =>
                current.filter((item) => item.id !== draft.id),
              );
              if (activeDraft?.id === draft.id) {
                setActiveDraft(null);
                setDraftSavedAt("");
              }
            } catch (error) {
              setNoticeModal({
                title: "Draft Not Discarded",
                message: isConnectionError(error)
                  ? "Unable to reach the server. Please check your connection and try again."
                  : error?.message || "Unable to discard this draft.",
              });
            } finally {
              setDraftDiscardingId("");
            }
          },
        },
        { label: "Keep Draft", variant: "secondary" },
      ],
    });
  }

  useEffect(() => {
    let active = true;

    async function detectActiveFollowUp() {
      if (!activeFollowUpLookupKey) {
        setAutoLinkedFollowUpTask(null);
        setActivePatientFollowUps([]);
        setActiveFollowUpLookup({ key: "", isChecking: false });
        return;
      }

      setAutoLinkedFollowUpTask(null);
      setActivePatientFollowUps([]);
      setActiveFollowUpLookup({
        key: activeFollowUpLookupKey,
        isChecking: true,
      });

      try {
        const tasks = await getFollowUpTasks({
          patient_id: selectedPatientId,
          active: 1,
        });
        if (!active) return;

        setActivePatientFollowUps(
          (Array.isArray(tasks) ? tasks : []).filter(isActiveFollowUpTask),
        );
      } catch {
        if (active) {
          setAutoLinkedFollowUpTask(null);
          setActivePatientFollowUps([]);
        }
      } finally {
        if (active) {
          setActiveFollowUpLookup({
            key: activeFollowUpLookupKey,
            isChecking: false,
          });
        }
      }
    }

    detectActiveFollowUp();

    return () => {
      active = false;
    };
  }, [
    activeFollowUpLookupKey,
    selectedPatientId,
  ]);


  function recordScheduledFollowUp(task) {
    const serviceType = getFollowUpTaskServiceType(task);
    setAutoLinkedFollowUpTask(task);
    setFollowUpRecord(task.healthRecord || null);
    setHealthRecordType(serviceType);
    setSelectedFollowUpTaskId(String(task.id));
    setConsultationType("followup");
    setWizardPhase(WIZARD_FORM);
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
        setEpiHistoryRecords(
          [
            ...(Array.isArray(records) ? records : []),
            followUpRecord || null,
          ].filter(Boolean),
        );
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
  }, [followUpRecord, isImmunization, selectedPatientId]);

  useEffect(() => {
    if (!isImmunization || needsReferral) return;
    if (epiWillComplete) {
      clearValidationError("followUpDate");
      setFollowUpDate("");
      setFollowUpTime("");
      setFollowUpStatus("Completed");
      return;
    }
    setFollowUpStatus("Follow-up Required");
  }, [epiWillComplete, isImmunization, needsReferral]);

  const formattedBp = (() => {
    const sys = systolicBp || "N/A";
    const dia = diastolicBp || "N/A";
    return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
  })();

  const consultationVitalSigns =
    `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | ` +
    `Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;

  const maternalTpalPreview = formatObScore(OB_SCORE_TPAL_FIELDS, maternalData);
  const maternalGravidaParaPreview = formatObScore(
    OB_SCORE_GP_FIELDS,
    maternalData,
  );

  function handleClassificationSelect(nextType) {
    clearValidationError("healthRecordType");
    const normalizedNextType = normalizeRecordType(nextType);
    const config = RECORD_TYPE_DETAILS[nextType] || {};

    if (patientGateLocked) {
      setValidationErrors((current) => ({
        ...current,
        selectedPatientId: "Please select a patient first before choosing a record type.",
      }));
      setSearchExpanded(true);
      setDropdownOpen(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (config.comingSoon) {
      setNoticeModal({
        title: "Form Not Available",
        message: "TB DOTS / TB Monitoring form is not yet available.",
      });
      return;
    }

    // The card is rendered disabled for a male patient; this is the guard for
    // every other path into the classification (drafts, route params, edit).
    if (normalizedNextType === "Maternal") {
      const maternalEligibility = getMaternalEligibility(selectedPatient);
      if (!maternalEligibility.eligible) {
        setNoticeModal({
          title: "Prenatal Care Unavailable",
          message: `${maternalEligibility.message} Please choose another program.`,
        });
        return;
      }
    }

    if (normalizedNextType !== normalizedHealthRecordType) {
      setMaternalData(EMPTY_MATERNAL_DATA);
      setDispensedMedicines([]);
      setExpectedDeliveryDate("");
      setAog("");
      setImmunizationData(EMPTY_IMMUNIZATION_DATA);
      setFamilyPlanningData(EMPTY_FAMILY_PLANNING_DATA);
      setHypertensionDiabeticData(EMPTY_HYPERTENSION_DIABETIC_DATA);
      setTbData(EMPTY_TB_DATA);
    }

    setHealthRecordType(nextType);
  }


  useEffect(() => {
    if (isMaternal) {
      setFollowUpStatus("Routine Monitoring");
    }
  }, [isMaternal]);

  useEffect(() => {
    if (isEditingRecord) return;
    setMorbidityReportingStatus(
      getDefaultMorbidityReportingStatus(normalizedHealthRecordType),
    );
  }, [isEditingRecord, normalizedHealthRecordType]);

  useEffect(() => {
    if (isFollowUp && !showFollowUpMonitoringFields) {
      setFollowUpDate("");
      setFollowUpTime("");
      if (!isFollowUp) setPatientCondition("");
    }
  }, [showFollowUpMonitoringFields, isFollowUp]);

  function handlePatientStatusChange(value) {
    clearValidationError("followUpStatus");
    const normalizedStatus = normalizePatientStatus(value);
    setFollowUpStatus(normalizedStatus);
    if (normalizedStatus === "Completed") {
      setNeedsReferral(false);
    }
    if (normalizedStatus !== "Follow-up Required") {
      setFollowUpDate("");
      setFollowUpTime("");
      if (!isFollowUp) setPatientCondition("");
    }
  }

  /**
   * Apply one Next Action card. This is the ONLY path that rewrites
   * followUpStatus from this step, which is what lets a legacy
   * "Routine Monitoring" record survive being viewed here untouched.
   */
  function handleNextActionChange(action) {
    clearValidationError("followUpStatus");
    const patch = getNextActionPatch(action);

    setNeedsReferral(patch.needsReferral);
    setFollowUpStatus(patch.followUpStatus);

    if (patch.clearFollowUpSchedule) {
      clearValidationError("followUpDate");
      clearValidationError("followUpTime");
      setFollowUpDate("");
      setFollowUpTime("");
      if (!isFollowUp) setPatientCondition("");
    }
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

  function getClinicalValidationErrors() {
    const errors = {};

    const requiresFollowUp =
      !needsReferral &&
      (normalizePatientStatus(followUpStatus) === "Follow-up Required" ||
        Boolean(followUpDate) ||
        epiNeedsNextFollowUp);
    if (requiresFollowUp && !followUpDate) {
      errors.followUpDate = "Follow-up date is required.";
    }
    if (
      recordTypeKey === "general consultation" &&
      requiresFollowUp &&
      !followUpTime
    ) {
      errors.followUpTime = "Follow-up time is required.";
    }
    if (hasPendingDispensedMedicineDraft) {
      errors.dispensedMedicines =
        'Click "Add Medicine" before saving so this item is included in the visit.';
    }
    if (isGeneralConsultationFollowUp) {
      if (!chiefComplaint.trim()) {
        errors.chiefComplaint = "Chief complaint is required.";
      }
      if (!summaryOfPresentIllness.trim()) {
        errors.summaryOfPresentIllness = "Follow-up findings are required.";
      }
      return errors;
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
      if (epiNeedsNextFollowUp && !followUpDate) {
        errors.followUpDate =
          "Next follow-up date is required because there are still remaining EPI vaccines/services.";
      }

      return errors;
    }

    if (isFamilyPlanning) {
      return errors;
    }

    if (isHypertensionDiabetic) {
      if (!String(hypertensionDiabeticData.bp || "").trim()) {
        errors["hypertensionDiabeticData.bp"] = "Blood pressure is required.";
      }
      if (!String(hypertensionDiabeticData.conditionType || "").trim()) {
        errors["hypertensionDiabeticData.conditionType"] =
          "Condition type is required.";
      }
      if (!String(hypertensionDiabeticData.clientStatus || "").trim()) {
        errors["hypertensionDiabeticData.clientStatus"] =
          "Client status is required.";
      }
      return errors;
    }

    if (isMaternal) return errors;

    if (isTb) {
      if (!String(tbData.diagnosis.tbCaseNumber || "").trim()) {
        errors["tbData.diagnosis.tbCaseNumber"] = "TB case number is required.";
      }
      if (!String(tbData.phases.intensiveStart || "").trim()) {
        errors["tbData.phases.intensiveStart"] =
          "Intensive phase start date is required.";
      }
      return errors;
    }

    if (!chiefComplaint.trim()) {
      errors.chiefComplaint = "Chief complaint is required.";
    }
    if (!summaryOfPresentIllness.trim()) {
      errors.summaryOfPresentIllness =
        "Summary of present illness is required.";
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
  function handleRiskAssessmentChange(key, checked, childKeys = []) {
    setMaternalData((previous) => {
      const riskAssessment = {
        ...(previous.riskAssessment || {}),
        [key]: checked,
      };

      if (!checked) {
        childKeys.forEach((childKey) => {
          riskAssessment[childKey] = false;
        });
      }

      return { ...previous, riskAssessment };
    });
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

  function handleHypertensionDiabeticChange(field, value) {
    clearValidationError(`hypertensionDiabeticData.${field}`);
    setHypertensionDiabeticData((prev) => ({ ...prev, [field]: value }));
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

  async function refreshFollowUpConflictState(taskId = "") {
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

    try {
      const tasks = await getFollowUpTasks();
      const refreshedTask = tasks.find(
        (task) => String(task.id) === String(taskId),
      );
      if (refreshedTask) {
        if (isFollowUp) setRouteLinkedFollowUpTask(refreshedTask);
        else setAutoLinkedFollowUpTask(refreshedTask);
      }
    } catch {
      // The saved record remains authoritative if follow-up refresh is unavailable.
    }
  }

  function showFollowUpAlreadyProcessed(error) {
    const taskId = error?.payload?.follow_up_task_id || effectiveFollowUpTaskId;
    const latestRecordId = error?.payload?.health_record_id || "";
    setConnectionIssue(null);
    void refreshFollowUpConflictState(taskId);
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
          onClick: () => void refreshFollowUpConflictState(taskId),
        },
      ],
    });
  }

  async function saveHealthRecord(formData, submission = null) {
    const savedRecord = isEditingRecord
      ? await healthRecordService.updateHealthRecordById(
          recordId,
          formData,
          "bhc",
        )
      : isLinkedFollowUpVisit
        ? await healthRecordService.createFollowUpHealthRecord(
            {
              ...formData,
              previousRecordId: effectiveFollowUpParentRecordId,
              parentHealthRecordId: effectiveFollowUpParentRecordId,
              parent_health_record_id: effectiveFollowUpParentRecordId,
              visitType: "follow_up_visit",
              visit_type: "follow_up_visit",
              recordType: "Follow-up",
              isFollowUp: true,
            },
            "bhc",
            {
              idempotencyKey: submission?.idempotencyKey,
              draftId: activeDraft?.id,
            },
          )
        : await healthRecordService.createHealthRecord(formData, "bhc", {
            idempotencyKey: submission?.idempotencyKey,
            draftId: activeDraft?.id,
          });
    if (!isEditingRecord && activeDraft?.id) {
      setHealthRecordDrafts((current) =>
        current.filter((item) => item.id !== activeDraft.id),
      );
      setActiveDraft(null);
      setDraftSavedAt("");
    }
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
            followUpRecord?.patient ||
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
        dispensedMedicines
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
        recordId ||
        "";
      setConnectionIssue(null);
      setLastFailedSubmit(null);
      clearOfficialSubmission();
      setCareDecisionStep(false);
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
        isFollowUp: isLinkedFollowUpVisit,
        isEditingRecord,
      });
    } catch (error) {
      if (isFollowUpAlreadyProcessed(error)) {
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
    event.preventDefault();
    closeDateTimePopovers();

    const isReferralContinuation =
      needsReferral &&
      userRole === "bhc" &&
      !isFollowUpVisitMode &&
      !isEditingRecord;

    if (isOrphanFollowUpRequest) {
      setNoticeModal({
        title: "Original Record Required",
        message:
          "Follow-up visits must start from an existing Follow-up Required health record.",
      });
      return;
    }

    if (
      isFollowUp &&
      followUpRecord &&
      normalizePatientStatus(
        followUpRecord.followUpStatus || followUpRecord.status,
      ) !== "Follow-up Required" &&
      !(
        followUpRecord.followUpDate ||
        followUpRecord.follow_up_date ||
        followUpRecord.monitoringData?.followUpDate ||
        followUpRecord.monitoring_data?.followUpDate ||
        followUpRecord.monitoring_data?.follow_up_date
      )
    ) {
      setNoticeModal({
        title: "Follow-up Not Available",
        message:
          "Record Follow-up Visit is only available for records with a scheduled follow-up date.",
      });
      return;
    }

    if (!selectedPatientId) {
      setValidationErrorsAndFocus({
        selectedPatientId: isFollowUp
          ? "Patient details are still loading. Please try again."
          : "Please select a patient first.",
      });
      return;
    }

    const effectiveHealthRecordType =
      normalizedHealthRecordType ||
      normalizeRecordType(
        followUpRecord?.category ||
          followUpRecord?.recordType ||
          followUpRecord?.patientClassification,
      ) ||
      (isFollowUp ? "General Consultation" : "");

    if (!effectiveHealthRecordType) {
      setValidationErrorsAndFocus({
        healthRecordType: "Select a classification first.",
      });
      return;
    }

    const clientErrors = getClinicalValidationErrors();

    if (setValidationErrorsAndFocus(clientErrors)) return;

    if (
      !isFollowUpVisitMode &&
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
      !isFollowUpVisitMode &&
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
      !isFollowUpVisitMode &&
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
    const finalNeedsReferral =
      !isFollowUpVisitMode && Boolean(needsReferral);
    const effectiveVisitType = isLinkedFollowUpVisit
      ? "follow_up_visit"
      : visitType;
    const linkedParentRecordId = effectiveFollowUpParentRecordId;
    const immunizationWillComplete =
      effectiveHealthRecordType === "Immunization" &&
      epiCompletion.completeAfterSave;
    const effectiveFollowUpDate =
      finalNeedsReferral || immunizationWillComplete
        ? ""
        : followUpDate || immunizationNextScheduleDate || "";
    const effectiveFollowUpTime =
      finalNeedsReferral || immunizationWillComplete ? "" : followUpTime;

    if (
      effectiveHealthRecordType === "Immunization" &&
      !finalNeedsReferral &&
      !immunizationWillComplete &&
      !followUpDate &&
      immunizationNextScheduleDate
    ) {
      setFollowUpDate(immunizationNextScheduleDate);
    }

    const finalChiefComplaint =
      isLinkedFollowUpVisit && !chiefComplaint
        ? followUpRecord?.chiefComplaint ||
          effectiveLinkedFollowUpTask?.healthRecord?.chiefComplaint ||
          "Return consultation"
        : isImmunization && !chiefComplaint
          ? "Vaccination Visit"
          : effectiveHealthRecordType === "Family Planning" && !chiefComplaint
            ? familyPlanningData.fpVisitType === "Side-effect Concern"
              ? familyPlanningData.concern || "Family Planning Concern"
              : "Family Planning Visit"
          : effectiveHealthRecordType === "Maternal" && !chiefComplaint
            ? "Prenatal Visit"
          : effectiveHealthRecordType === "Hypertension / Diabetic Monitoring" &&
              !chiefComplaint
            ? "Hypertension / Diabetic Monitoring Visit"
          : effectiveHealthRecordType === "TB DOTS / TB Monitoring" &&
              !chiefComplaint
            ? "TB DOTS / TB Monitoring Visit"
          : chiefComplaint;

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
      tetanusToxoidStatus: {
        ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
        ...(maternalData.tetanus_toxoid_status || {}),
        ...(maternalData.tetanusToxoidStatus || {}),
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

    const recordHypertensionDiabeticData = {
      ...hypertensionDiabeticData,
      conditionType: normalizeHypertensionDiabeticCondition(
        hypertensionDiabeticData.conditionType,
      ),
      condition_type: normalizeHypertensionDiabeticCondition(
        hypertensionDiabeticData.conditionType,
      ),
      clientStatus: normalizeHypertensionDiabeticClientStatus(
        hypertensionDiabeticData.clientStatus,
      ),
      client_status: normalizeHypertensionDiabeticClientStatus(
        hypertensionDiabeticData.clientStatus,
      ),
      dateOfLastConsultation:
        hypertensionDiabeticData.dateOfLastConsultation || "",
      date_of_last_consultation:
        hypertensionDiabeticData.dateOfLastConsultation || "",
      treatmentActionTaken:
        hypertensionDiabeticData.treatmentActionTaken || "",
      treatment_action_taken:
        hypertensionDiabeticData.treatmentActionTaken || "",
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
    const morbidityDecision = getMorbidityDecisionFlags(
      morbidityReportingStatus,
    );
    const finalHfmdSurveillance = Boolean(hfmdSurveillance);
    const finalSurveillanceCategory = finalHfmdSurveillance ? "hfmd" : null;

    const formData = {
      patientId: selectedPatientId,
      patientName: isFollowUpVisitMode
        ? followUpPatientName
        : getPatientName(selectedPatient),
      category: effectiveHealthRecordType,
      recordType: effectiveHealthRecordType,
      patientClassification: effectiveHealthRecordType,
      visitType: effectiveVisitType,
      visit_type: effectiveVisitType,
      parentHealthRecordId: linkedParentRecordId || null,
      parent_health_record_id: linkedParentRecordId || null,
      previousRecordId: linkedParentRecordId || "",
      followUpTaskId: effectiveFollowUpTaskId || null,
      follow_up_task_id: effectiveFollowUpTaskId || null,
      dateOfVisit: dateOfVisit || toDateInputValue(),
      timeOfVisit: timeOfVisit || toTimeInputValue(),
      chiefComplaint: finalChiefComplaint,
      summaryOfPresentIllness,
      diagnosis,
      vitalSigns: consultationVitalSigns,
      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      temperature: temp || null,
      weight: weight || null,
      height: height || null,
      medication:
        effectiveHealthRecordType === "Maternal"
          ? recordMaternalData.treatment || medication
          : effectiveHealthRecordType === "Hypertension / Diabetic Monitoring"
            ? recordHypertensionDiabeticData.treatmentActionTaken || medication
          : medication,
      attendingStaff: attendingStaff || currentUserName,
      consultationNotes,
      followUpStatus: finalPatientStatus,
      followUpDate: effectiveFollowUpDate,
      followUpTime: effectiveFollowUpTime,
      monitoringNotes,
      patientCondition:
        isLinkedFollowUpVisit || effectiveFollowUpDate ? patientCondition : "",
      morbidityReportingStatus,
      includeInMorbidityReport: morbidityDecision.includeInMorbidityReport,
      isNotifiableDisease: morbidityDecision.isNotifiableDisease,
      surveillanceCategory: finalSurveillanceCategory,
      surveillance_category: finalSurveillanceCategory,
      diseaseSurveillanceCategory: finalSurveillanceCategory,
      disease_surveillance_category: finalSurveillanceCategory,
      hfmdSurveillance: finalHfmdSurveillance,
      hfmd_surveillance: finalHfmdSurveillance,
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
        effectiveHealthRecordType === "Family Planning"
          ? recordFamilyPlanningData
          : null,
      hypertensionDiabeticData:
        effectiveHealthRecordType === "Hypertension / Diabetic Monitoring"
          ? recordHypertensionDiabeticData
          : null,
      tbData:
        effectiveHealthRecordType === "TB DOTS / TB Monitoring" ? tbData : null,
      monitoringData: {
        hypertensionDiabeticData:
          effectiveHealthRecordType === "Hypertension / Diabetic Monitoring"
            ? recordHypertensionDiabeticData
            : null,
      },
      createdByRole: userRole,
      linkedTrackingId: isFollowUpVisitMode
        ? followUpRecord?.linkedTrackingId || ""
        : "",
      dispensedMedicines: isEditingRecord ? [] : dispensedMedicines,
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
      // urgency falls back to the default, no doctor is preferred).
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
      const submission = isEditingRecord
        ? null
        : beginOfficialSubmission(formData);
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
        recordId ||
        "";
      const savedStatus = normalizePatientStatus(
        savedRecord?.followUpStatus ||
          savedRecord?.status ||
          savedRecord?.data?.followUpStatus ||
          savedRecord?.data?.status ||
          formData.followUpStatus,
      );

      setCareDecisionStep(false);
      setLastFailedSubmit(null);
      clearOfficialSubmission();
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: savedStatus,
        needsReferral: formData.needs_referral === true,
        isFollowUp: isLinkedFollowUpVisit,
        isEditingRecord,
      });
    } catch (error) {
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
   * would otherwise race React state. The last attempt is remembered so the
   * REF-SLIP-05c "Continue Anyway" retry can resubmit it unchanged.
   */
  async function submitHealthRecordWithReferral({
    formData,
    referralOverrides = {},
    acknowledgeUnavailable = false,
  } = {}) {
    closeDateTimePopovers();

    const attempt = formData
      ? { formData, referralOverrides }
      : lastReferralAttemptRef.current;

    if (!attempt?.formData) {
      setNoticeModal({
        title: "Health Record Draft Missing",
        message:
          "The health record draft is no longer available. Please review the health record form again.",
      });
      return;
    }

    lastReferralAttemptRef.current = attempt;
    const referral = { ...referralForm, ...attempt.referralOverrides };

    if (!String(referral.reasonForReferral || "").trim()) {
      setValidationErrorsAndFocus({
        reasonForReferral: "Reason for referral is required.",
      });
      return;
    }

    const referralUrgency = normalizeAttention(referral.urgencyLevel);
    const preferredProvider = rhuProviders.find(
      (provider) => String(provider.id) === String(referral.preferredRhuDoctorId),
    );
    const referralRemarks = referral.clinicalSummary || "";
    const officialPayload = {
      ...attempt.formData,
      referral: {
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
        preferredDoctor: preferredProvider?.name || null,
        // REF-SLIP-05 / REF-SLIP-05c - the preference and, on a retry past the
        // Decision A warning, the acknowledgment the server records.
        preferredProviderId: preferredProvider?.id || null,
        acknowledgedUnavailablePreference: acknowledgeUnavailable,
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

      lastReferralAttemptRef.current = null;
      setCareDecisionStep(false);
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
        referralSubmitted: true,
        referralTrackingId,
        isFollowUp,
        isEditingRecord,
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
      // REF-SLIP-05c (Decision A) - warn, then continue or reselect.
      if (isPreferredProviderUnavailableError(error)) {
        clearOfficialSubmission();
        const provider = error.payload?.provider || {};
        setNoticeModal({
          title: "Doctor Currently Unavailable",
          message: `${provider.name || "The selected doctor"} is currently unavailable${
            provider.remarks ? ` - ${provider.remarks}` : ""
          }. The RHU may assign another doctor on arrival. You can continue with this preference or choose another.`,
          actions: [
            {
              label: "Choose Another Doctor",
              onClick: () => {
                setReferralForm((prev) => ({
                  ...prev,
                  preferredRhuDoctorId: "",
                }));
                setNoticeModal(null);
              },
            },
            {
              label: "Continue Anyway",
              variant: "primary",
              onClick: () => {
                setNoticeModal(null);
                // Resubmit with the acknowledgment. DOC-14 is re-checked on
                // this attempt too, so continuing cannot bypass the hard block.
                void submitHealthRecordWithReferral({
                  acknowledgeUnavailable: true,
                });
              },
            },
          ],
        });
        return;
      }
      if (isPreferredProviderInvalidError(error)) {
        clearOfficialSubmission();
        setReferralForm((prev) => ({ ...prev, preferredRhuDoctorId: "" }));
        setNoticeModal({
          title: "Doctor No Longer Available",
          message:
            error?.message ||
            "The selected doctor is no longer available at the receiving RHU. Please choose another.",
        });
        return;
      }
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

  const isPrimaryActionLoading = saving;
  // Only blank the page for the skeleton once we are on the record itself.
  // On the setup step the same lookup is expected and is surfaced inline as
  // "Checking for active follow-ups..." on the Follow-up Visit card, so
  // choosing a patient must not replace the wizard with a loading state.
  const isResolvingClinicalMode = isResolvingFollowUpMode && setupComplete;
  /**
   * Heading on the record form card: the program being recorded.
   *
   * The visit date and time it replaced are still captured - they default to
   * now and are shown on the wizard steps before this one - but the form no
   * longer offers them as editable fields.
   */
  const formHeaderTitle = isFollowUpVisitMode
    ? "Follow-up Visit"
    : RECORD_TYPE_DETAILS[normalizedHealthRecordType]?.title ||
      normalizedHealthRecordType ||
      "New Consultation";
  const pageTitle = isResolvingClinicalMode
    ? "Health Record"
    : isFollowUpVisitMode
      ? "Follow-up Visit"
      : isEditingRecord
        ? "Edit Health Record"
        : "Add Health Record";
  const monitoringNotesLabel =
    normalizedPatientStatus === "Completed"
      ? "Outcome Notes"
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

  /**
   * Leave the clinical form for the Next Action step.
   *
   * Validates the clinical fields only. The follow-up date/time rules are
   * skipped here because the disposition they depend on has not been chosen
   * yet - handleSave re-runs the full set before saving.
   */
  function handleContinueToNextAction(event) {
    event?.preventDefault();
    closeDateTimePopovers();

    const clinicalErrors = { ...getClinicalValidationErrors() };
    delete clinicalErrors.followUpDate;
    delete clinicalErrors.followUpTime;
    delete clinicalErrors.followUpStatus;

    if (setValidationErrorsAndFocus(clinicalErrors)) return;

    goToWizardPhase(WIZARD_NEXT);
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  // ---- Wizard view models -------------------------------------------------
  // Built here so the step components stay presentational and never reach for
  // this page's patient/record helpers.
  const wizardPatientRows = (
    normalizedSearch ? matchingPatients : patients
  )
    .slice(0, normalizedSearch ? 20 : 12)
    .map((patient) => {
      const display = getPatientDisplay(patient);
      return {
        id: patient.id,
        name: display.name,
        meta: [display.id && `ID ${display.id}`, display.age]
          .filter(Boolean)
          .join(" · "),
      };
    });

  const wizardPrograms = RECORD_TYPE_OPTIONS.map((option) => {
    const eligibility =
      option === "Maternal"
        ? getMaternalEligibility(selectedPatient)
        : { eligible: true, message: "" };

    return {
      key: option,
      title: RECORD_TYPE_DETAILS[option]?.title || option,
      description: RECORD_TYPE_DETAILS[option]?.description || "",
      icon: RECORD_TYPE_DETAILS[option]?.icon || Stethoscope,
      disabled: !eligibility.eligible,
      disabledReason: eligibility.message,
    };
  });

  const wizardFollowUpRows = activePatientFollowUps.map((task) => ({
    id: task.id,
    label: `FU-${task.id}`,
    fromRecord: `#${task.healthRecordId || task.originalHealthRecordId || "—"}`,
    serviceType:
      getFollowUpTaskServiceType(task) || "Not recorded",
    dueLabel: formatFollowUpSchedule(task),
  }));

  const selectedFollowUpTask =
    activePatientFollowUps.find(
      (task) => String(task.id) === String(selectedFollowUpTaskId),
    ) || null;

  const wizardConfirmFields = selectedFollowUpTask
    ? [
        { label: "Follow-up ID", value: `FU-${selectedFollowUpTask.id}` },
        {
          label: "Next Follow-up Date",
          value: formatFollowUpSchedule(selectedFollowUpTask),
        },
        {
          label: "From Record",
          value: `#${selectedFollowUpTask.healthRecordId || "—"}`,
        },
        {
          label: "Service Type",
          value: getFollowUpTaskServiceType(selectedFollowUpTask),
        },
        { label: "Patient", value: getPatientName(selectedPatient) },
        {
          label: "Chief Complaint",
          value:
            selectedFollowUpTask.healthRecord?.chiefComplaint ||
            selectedFollowUpTask.healthRecord?.chief_complaint ||
            "",
        },
      ]
    : [];

  // A patient with no active task cannot record a follow-up visit: the server
  // rejects visit_type=follow_up_visit without a task id.
  const followUpUnavailableReason = activeFollowUpLookup.isChecking
    ? "Checking for active follow-ups..."
    : activePatientFollowUps.length === 0
      ? "This patient has no active follow-ups."
      : "";

  function handleConsultationTypeChange(type) {
    clearValidationError("consultationType");
    setConsultationType(type);
    if (type === "new") {
      setSelectedFollowUpTaskId("");
      setAutoLinkedFollowUpTask(null);
    }
  }

  function handleSetupNext() {
    if (!selectedPatientId || !consultationType) return;
    goToWizardPhase(
      consultationType === "followup" ? WIZARD_FU_SELECT : WIZARD_PROGRAM,
    );
  }

  function handleProgramSelect(option) {
    handleClassificationSelect(option);
    goToWizardPhase(WIZARD_FORM);
  }

  function handleFollowUpConfirm() {
    if (!selectedFollowUpTask) return;
    recordScheduledFollowUp(selectedFollowUpTask);
  }

  /**
   * One Next Action step, rendered by every program that used to carry its own
   * "Follow-up & Referral" block. Built once here so the programs cannot drift
   * apart again the way the five previous copies did.
   */
  const nextActionSection = (
    <NextActionSection
      action={nextAction}
      followUpDate={followUpDate}
      followUpTime={followUpTime}
      monitoringNotes={monitoringNotes}
      monitoringNotesLabel={monitoringNotesLabel}
      monitoringNotesPlaceholder={monitoringNotesPlaceholder}
      referralForm={referralForm}
      errors={validationErrors}
      disabled={patientGateLocked}
      // The server only requires a follow-up time for General Consultation
      // (HealthRecordRequest::withValidator). Marking it required everywhere
      // would block saves the API would have accepted.
      requireFollowUpTime={recordTypeKey === "general consultation"}
      requireFollowUpDate={!epiWillComplete}
      scheduleNotice={
        epiWillComplete ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-700">
            No next follow-up date is needed because the EPI record will be
            complete after saving.
          </div>
        ) : null
      }
      legacyStatusNote={
        showsLegacyFollowUpStatus ? (
          <p className="mt-2 text-[11px] leading-relaxed text-[#64748B]">
            This record is currently saved as &ldquo;Routine Monitoring&rdquo;.
            It stays that way unless you choose an option above.
          </p>
        ) : null
      }
      onActionChange={handleNextActionChange}
      onFollowUpDateChange={(value) => {
        clearValidationError("followUpDate");
        setFollowUpDate(value);
      }}
      onFollowUpTimeChange={(value) => {
        clearValidationError("followUpTime");
        setFollowUpTime(value);
      }}
      onMonitoringNotesChange={setMonitoringNotes}
      onReferralFieldChange={handleReferralFormChange}
    />
  );

  /**
   * Walk one screen back through the wizard.
   *
   * Editing an existing record and the route-driven follow-up entry both open
   * on the form with no wizard behind them, so Back leaves the page instead of
   * stepping into setup screens that were never shown.
   */
  function goToWizardPhase(phase) {
    closeDateTimePopovers();
    setDropdownOpen(false);
    setWizardPhase(phase);
  }

  function handleStepBack() {
    closeDateTimePopovers();

    if (wizardPhase === WIZARD_NEXT) {
      goToWizardPhase(WIZARD_FORM);
      return;
    }

    if (wizardPhase === WIZARD_FORM && !isFollowUpVisitMode && !isEditingRecord) {
      goToWizardPhase(
        consultationType === "followup" ? WIZARD_FU_CONFIRM : WIZARD_PROGRAM,
      );
      return;
    }

    if (wizardPhase === WIZARD_FU_CONFIRM) {
      goToWizardPhase(WIZARD_FU_SELECT);
      return;
    }

    if (
      wizardPhase === WIZARD_PROGRAM ||
      wizardPhase === WIZARD_FU_SELECT
    ) {
      goToWizardPhase(WIZARD_SETUP);
      return;
    }

    navigate(healthRecordsPath);
  }

  return (
    <DashboardLayout role={userRole} title={pageTitle}>
      <style>{keyframes}</style>

      {canSaveCurrentDraft && draftAutosaveStatus === "offline" && (
        <div className="anim-fade-up mb-4 ml-0 mr-auto w-full max-w-7xl">
          <DraftSaveStatus
            status={draftAutosaveStatus}
            lastSavedAt={draftAutosave.lastSavedAt}
          />
        </div>
      )}

      {isDraftRouteEligible && (
        <DraftsDrawer
          open={draftsDrawerOpen}
          onClose={() => setDraftsDrawerOpen(false)}
          drafts={healthRecordDrafts}
          loading={draftListLoading}
          error={draftListError}
          resumingId={draftResumingId}
          discardingId={draftDiscardingId}
          activeDraftId={activeDraft?.id || ""}
          onRetry={loadHealthRecordDrafts}
          onResume={handleResumeDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      {setupComplete && draftMedicineWarnings.length > 0 && (
        <div
          className="mb-4 ml-0 mr-auto flex w-full max-w-7xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900"
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

      {isResolvingClinicalMode ? (
        <div className="ml-0 mr-auto w-full max-w-7xl">
          <HealthRecordFormSkeleton message="Loading health record..." />
        </div>
      ) : wizardPhase === WIZARD_SETUP ? (
        <ConsultationSetupStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          patients={wizardPatientRows}
          selectedPatientId={selectedPatientId}
          onSelectPatient={selectPatient}
          consultationType={consultationType}
          onConsultationTypeChange={handleConsultationTypeChange}
          searchOpen={searchExpanded}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onToggleSearch={() => setSearchExpanded((open) => !open)}
          draftCount={healthRecordDrafts.length}
          onOpenDrafts={() => setDraftsDrawerOpen(true)}
          showDrafts={isDraftRouteEligible}
          patientsLoading={patientsLoading && patients.length === 0}
          patientsLoadError={patientsLoadError}
          onRetryLoadPatients={() => setPatientsReloadKey((key) => key + 1)}
          followUpUnavailableReason={
            selectedPatientId ? followUpUnavailableReason : ""
          }
          error={validationErrors.consultationType}
          onBack={handleStepBack}
          onNext={handleSetupNext}
        />
      ) : wizardPhase === WIZARD_PROGRAM ? (
        <ProgramSelectStep
          programs={wizardPrograms}
          selected={healthRecordType}
          onSelect={handleProgramSelect}
          error={validationErrors.healthRecordType}
          onBack={handleStepBack}
        />
      ) : wizardPhase === WIZARD_FU_SELECT ? (
        <FollowUpSelectStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          tasks={wizardFollowUpRows}
          selectedTaskId={selectedFollowUpTaskId}
          onSelect={(taskId) => setSelectedFollowUpTaskId(String(taskId))}
          loading={activeFollowUpLookup.isChecking}
          onBack={handleStepBack}
          onNext={() => goToWizardPhase(WIZARD_FU_CONFIRM)}
        />
      ) : wizardPhase === WIZARD_FU_CONFIRM ? (
        <FollowUpConfirmStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          fields={wizardConfirmFields}
          onBack={handleStepBack}
          onContinue={handleFollowUpConfirm}
        />
      ) : wizardPhase === WIZARD_NEXT ? (
        <NextActionStep
          visitDate={wizardVisitDate}
          visitTime={wizardVisitTime}
          saving={saving}
          saveLabel={saving ? "Saving health record..." : "Save Record"}
          onBack={handleStepBack}
          onSave={handleSave}
        >
          {nextActionSection}
        </NextActionStep>
      ) : (
      <>
      {careDecisionStep && usesCareDecisionStep ? (
        <CareDecisionStep
          patientName={getPatientName(selectedPatient)}
          patientMeta={getPatientDisplay(selectedPatient).age}
          classification={normalizedHealthRecordType}
          dateOfVisit={dateOfVisit}
          timeOfVisit={timeOfVisit}
          status={followUpStatus}
          followUpDate={followUpDate}
          needsReferral={needsReferral}
          saving={saving}
          referralLabel="Needs RHU Referral"
          errors={validationErrors}
          onStatusChange={handlePatientStatusChange}
          onFollowUpDateChange={(value) => {
            clearValidationError("followUpDate");
            setFollowUpDate(value);
          }}
          onNeedsReferralChange={setNeedsReferral}
          onSave={handleSave}
        />
      ) : (
      <form
        onSubmit={handleContinueToNextAction}
        noValidate
        className="relative ml-0 mr-auto w-full max-w-7xl"
      >
        <div className="space-y-5 rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
        {/* The form opens on the program it is recording. Visit date, time and
            practitioner are no longer edited here - see formHeaderTitle. */}
        <div className="anim-fade-up pb-5" style={stagger(2)}>
          <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
            {formHeaderTitle}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
            Complete the form below for this visit.
          </p>
          {showMaternalPatientWarning && (
            <div className="mt-4">
              <MaternalClassificationWarning />
            </div>
          )}
        </div>

        {isGeneralConsultationFollowUp && (
          <>
            <FormSection
              title="Clinical Assessment"
              subtitle="Record the patient's current complaint, condition, and updated clinical findings."
              delay={3}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldSelect
                  label="Current Condition"
                  value={patientCondition}
                  onChange={(event) => setPatientCondition(event.target.value)}
                >
                  <option value="">Select condition</option>
                  <option>Improving</option>
                  <option>Stable</option>
                  <option>No Improvement Observed</option>
                  <option>Needs Further Review</option>
                  <option>Recovered</option>
                </FieldSelect>
                <FieldInput
                  label="Chief Complaint"
                  placeholder="e.g. Persistent cough, improving fever"
                  required
                  name="chiefComplaint"
                  error={validationErrors.chiefComplaint}
                  value={chiefComplaint}
                  onChange={(event) => {
                    clearValidationError("chiefComplaint");
                    setChiefComplaint(event.target.value);
                  }}
                />
              </div>
              <div className="mt-4">
                <FieldTextarea
                  label="Follow-up Findings"
                  required
                  name="summaryOfPresentIllness"
                  error={validationErrors.summaryOfPresentIllness}
                  value={summaryOfPresentIllness}
                  onChange={(event) =>
                    {
                      clearValidationError("summaryOfPresentIllness");
                      setSummaryOfPresentIllness(event.target.value);
                    }
                  }
                  placeholder="Record the patient's current symptoms, progress, examination findings, or changes since the original visit..."
                  rows={5}
                />
              </div>
              <div className="mt-4">
                <FieldInput
                  label="Diagnosis / Assessment"
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  placeholder="Updated diagnosis or clinical assessment"
                />
              </div>
            </FormSection>

            <FormSection
              title="Vital Signs"
              subtitle="Record updated physiological measurements for this follow-up visit."
              delay={4}
            >
              <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]">
                <BpInputGroup
                  systolic={systolicBp}
                  diastolic={diastolicBp}
                  onSystolicChange={setSystolicBp}
                  onDiastolicChange={setDiastolicBp}
                />
                <FieldInput
                  label="Temperature"
                  placeholder="e.g. 36.5 °C"
                  value={temp}
                  onChange={(event) => setTemp(event.target.value)}
                />
                <FieldInput
                  label="Weight"
                  type="number"
                  placeholder="e.g. 60"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                />
                <FieldInput
                  label="Height"
                  type="number"
                  placeholder="e.g. 165"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                />
              </div>
            </FormSection>

            <FormSection
              title="Treatment & Actions"
              subtitle="Document what was done during the follow-up visit."
              delay={5}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldInput
                  label="Treatment / Action Taken"
                  value={medication}
                  onChange={(event) => setMedication(event.target.value)}
                />
                <FieldTextarea
                  label="Follow-up Notes"
                  value={consultationNotes}
                  onChange={(event) => setConsultationNotes(event.target.value)}
                  placeholder="Write additional instructions, advice, or return visit notes..."
                  rows={3}
                />
              </div>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Medicines / Supplies Dispensed
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#64748B]">
                    Optional medicines or supplies given from BHC inventory
                    during this follow-up visit.
                  </p>
                </div>
                <DispensedMedicinesSection
                  inventory={bhcMedicineInventory}
                  value={dispensedMedicines}
                  onChange={handleDispensedMedicinesChange}
                  pendingDraftError={validationErrors.dispensedMedicines}
                  onPendingDraftChange={
                    handlePendingDispensedMedicineChange
                  }
                  disabled={isEditingRecord}
                  loading={bhcMedicineInventoryLoading}
                  error={bhcMedicineInventoryError}
                  onRetry={() =>
                    setBhcMedicineInventoryReloadKey((key) => key + 1)
                  }
                />
              </div>
            </FormSection>

          </>
        )}

        {/* ImmunizationVisitFields renders its own titled sections, so it is
            placed directly in the card rather than inside a FormSection. */}
        {!patientGateLocked && isImmunization && (
          <div className="anim-fade-up" style={stagger(2)}>
            <ImmunizationVisitFields
              vaccineOptions={CHILD_VACCINE_OPTIONS}
              entries={immunizationVaccineEntries}
              epiHistoryByCode={epiHistoryByCode}
              epiCompletion={epiCompletion}
              epiHistoryLoading={epiHistoryLoading}
              epiHistoryError={epiHistoryError}
              temperature={temp}
              weight={weight}
              height={height}
              breastfeedingMonitoring={immunizationData.breastfeedingMonitoring}
              breastfeedingMonths={BREASTFEEDING_MONTHS}
              consultationNotes={consultationNotes}
              errors={validationErrors}
              onTemperatureChange={setTemp}
              onWeightChange={setWeight}
              onHeightChange={setHeight}
              onBreastfeedingChange={handleBreastfeedingChange}
              onToggleVaccine={handleVaccineToggle}
              onNotesChange={setConsultationNotes}
              medicinesSlot={
                <ClinicalSection
                  title="Medicines / Supplies Dispensed"
                  subtitle="Optional medicines or supplies given from BHC inventory during this visit."
                >
                  <DispensedMedicinesSection
                    inventory={bhcMedicineInventory}
                    value={dispensedMedicines}
                    onChange={handleDispensedMedicinesChange}
                    disabled={isEditingRecord}
                    loading={bhcMedicineInventoryLoading}
                    error={bhcMedicineInventoryError}
                    onRetry={() =>
                      setBhcMedicineInventoryReloadKey((key) => key + 1)
                    }
                  />
                </ClinicalSection>
              }
            />
          </div>
        )}


        {!patientGateLocked && isMaternal && !selectedPatientIsMale && (
          <>
            {showMaternalPatientWarning && <MaternalClassificationWarning />}

            <FormSection
              title="Patient Information"
              subtitle="Record the client's pregnancy dating, OB score, and measurements for this visit."
              delay={3}
            >
              <LockedFormContent locked={patientGateLocked}>
                {/* 12-column grid. LMP / EDC / BP take thirds, the two OB
                    score groups take halves so their inline number inputs stay
                    legible, and WT / BMI / HT take quarters. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <DatePickerField
                      label="LMP (Last Menstrual Period)"
                      value={maternalData.lmp}
                      onChange={(value) => handleMaternalChange("lmp", value)}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <DatePickerField
                      label="EDC (Expected Date of Confinement)"
                      value={expectedDeliveryDate}
                      onChange={setExpectedDeliveryDate}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <BpInputGroup
                      systolic={systolicBp}
                      diastolic={diastolicBp}
                      onSystolicChange={setSystolicBp}
                      onDiastolicChange={setDiastolicBp}
                    />
                  </div>

                  <div className="sm:col-span-6">
                    <ScoreInputGroup
                      label="OB Score (TPAL)"
                      columnsClassName="grid-cols-4"
                      fields={OB_SCORE_TPAL_FIELDS}
                      values={maternalData}
                      onChange={handleMaternalChange}
                      preview={maternalTpalPreview}
                    />
                  </div>
                  <div className="sm:col-span-6">
                    <ScoreInputGroup
                      label="G/P (Gravida/Para)"
                      columnsClassName="grid-cols-2"
                      fields={OB_SCORE_GP_FIELDS}
                      values={maternalData}
                      onChange={handleMaternalChange}
                      preview={maternalGravidaParaPreview}
                    />
                  </div>

                  <FieldInput
                    label="WT (Weight)"
                    type="number"
                    placeholder="kg"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    wrapperClassName="sm:col-span-3"
                  />
                  <FieldInput
                    label="BMI"
                    value={maternalData.bmi}
                    onChange={(event) =>
                      handleMaternalChange("bmi", event.target.value)
                    }
                    wrapperClassName="sm:col-span-3"
                  />
                  <FieldInput
                    label="HT (Height)"
                    type="number"
                    placeholder="cm"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    wrapperClassName="sm:col-span-3"
                  />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Medical History / Risk Codes"
              subtitle="Mark pregnancy risk codes and medical conditions from the prenatal record."
              delay={4}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <RiskCodeChecklist
                      eyebrow="Pregnancy Risk Codes"
                      options={PREGNANCY_RISK_CODES}
                      values={maternalData.riskAssessment}
                      onChange={handleRiskAssessmentChange}
                    />
                    <RiskCodeChecklist
                      eyebrow="Other Important Information"
                      options={OTHER_IMPORTANT_INFORMATION}
                      values={maternalData.riskAssessment}
                      onChange={handleRiskAssessmentChange}
                    />
                  </div>
                  <RiskCodeChecklist
                    eyebrow="Medical Conditions"
                    options={MEDICAL_CONDITION_CODES}
                    values={maternalData.riskAssessment}
                    onChange={handleRiskAssessmentChange}
                  />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Additional Health Information"
              subtitle="Record any family planning method used before this pregnancy."
              delay={5}
            >
              <LockedFormContent locked={patientGateLocked}>
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
                  <option value="">Select FP Method Used...</option>
                  {PREVIOUS_FP_METHOD_OPTIONS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </FieldSelect>
                {maternalData.previousFpMethodUsed === "Other" && (
                  <div className="mt-4">
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
                  </div>
                )}
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Tetanus Toxoid (TT) Status"
              subtitle="Record TT1-TT5 dates given."
              delay={6}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {TETANUS_TOXOID_FIELDS.map((field) => (
                    <DatePickerField
                      key={field.key}
                      label={field.label}
                      value={maternalData.tetanusToxoidStatus?.[field.key] || ""}
                      onChange={(value) =>
                        handleNestedMaternalChange(
                          "tetanusToxoidStatus",
                          field.key,
                          value,
                        )
                      }
                    />
                  ))}
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Ultrasound Result"
              subtitle="Enter the latest ultrasound result and date."
              delay={7}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 sm:grid-cols-2">
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

            <FormSection
              title="Treatment/Action Taken"
              subtitle="Document treatment given for this visit."
              delay={8}
            >
              <LockedFormContent locked={patientGateLocked}>
                <FieldTextarea
                  label="Treatment/Action Taken"
                  value={maternalData.treatment}
                  onChange={(event) => {
                    handleMaternalChange("treatment", event.target.value);
                    setMedication(event.target.value);
                  }}
                  placeholder="Enter treatment or action taken..."
                  rows={3}
                />
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Medicines / Supplies Dispensed"
              subtitle="Optional medicines or supplies given from BHC inventory during this visit."
              delay={9}
            >
              <LockedFormContent locked={patientGateLocked}>
                <DispensedMedicinesSection
                  inventory={bhcMedicineInventory}
                  value={dispensedMedicines}
                  onChange={handleDispensedMedicinesChange}
                  pendingDraftError={validationErrors.dispensedMedicines}
                  onPendingDraftChange={handlePendingDispensedMedicineChange}
                  disabled={isEditingRecord}
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

        {!patientGateLocked && isFamilyPlanning && (
          <FormSection
            title="Family Planning Details"
            subtitle="Record client type, method, and visit details."
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <FieldSelect
                  label="Source"
                  value={familyPlanningData.source}
                  onChange={(event) =>
                    handleFamilyPlanningChange("source", event.target.value)
                  }
                >
                  <option value="">Select source...</option>
                  {FP_SOURCE_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>

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

                <FieldInput
                  label="Method Used / Accepted"
                  required
                  placeholder="e.g. DMPA / Injectable, Pills..."
                  value={familyPlanningData.methodUsed}
                  onChange={(event) =>
                    handleFamilyPlanningChange("methodUsed", event.target.value)
                  }
                />

                <div className="sm:col-span-2">
                  <FieldTextarea
                    label="Treatment/Action Taken"
                    value={familyPlanningData.actionTaken}
                    onChange={(event) =>
                      handleFamilyPlanningChange(
                        "actionTaken",
                        event.target.value,
                      )
                    }
                    placeholder="Enter treatment or action taken..."
                    rows={3}
                  />
                </div>
              </div>
            </LockedFormContent>
          </FormSection>
        )}

        {!patientGateLocked && isFamilyPlanning && (
          <FormSection
            title="Medicines / Supplies Dispensed"
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

        {!patientGateLocked && isTb && (
          <FormSection
            title="DS-TB Treatment Card (DOH Form 4b)"
            subtitle="Digitized National TB Control Program treatment card — case finding, diagnosis, regimen, treatment supporter, dose calendar, and adverse events."
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
              <TbTreatmentCardForm
                value={tbData}
                onChange={setTbData}
                recordId={isEditingRecord ? recordId : null}
              />
            </LockedFormContent>
          </FormSection>
        )}

        {!patientGateLocked && isHypertensionDiabetic && (
          <>
            <FormSection
              title="Monitoring Details"
              subtitle="Record the official Hypertension and Diabetic Club monitoring sheet details for this visit."
              delay={3}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldInput
                  label="Blood Pressure (BP)"
                  required
                  name="hypertensionDiabeticData.bp"
                  error={validationErrors["hypertensionDiabeticData.bp"]}
                  value={hypertensionDiabeticData.bp}
                  onChange={(event) =>
                    handleHypertensionDiabeticChange("bp", event.target.value)
                  }
                  placeholder="e.g. 120/80 mmHg"
                />
                <FieldInput
                  label="Fasting Blood Sugar (FBS)"
                  value={hypertensionDiabeticData.fbs}
                  onChange={(event) =>
                    handleHypertensionDiabeticChange("fbs", event.target.value)
                  }
                  placeholder="e.g. 95 mg/dL"
                />
                <RadioChoiceGroup
                  label="Condition Type"
                  name="hypertensionDiabeticData.conditionType"
                  required
                  value={hypertensionDiabeticData.conditionType}
                  error={validationErrors["hypertensionDiabeticData.conditionType"]}
                  helperText="Select HPN for hypertension, DM for diabetes, or BOTH if both conditions apply."
                  options={HYPERTENSION_DIABETIC_CONDITION_OPTIONS}
                  onChange={(value) =>
                    handleHypertensionDiabeticChange("conditionType", value)
                  }
                />
                <RadioChoiceGroup
                  label="Client Status"
                  name="hypertensionDiabeticData.clientStatus"
                  required
                  value={hypertensionDiabeticData.clientStatus}
                  error={validationErrors["hypertensionDiabeticData.clientStatus"]}
                  options={HYPERTENSION_DIABETIC_CLIENT_STATUS_OPTIONS}
                  onChange={(value) =>
                    handleHypertensionDiabeticChange("clientStatus", value)
                  }
                />
                <FieldInput
                  label="Date of Last Consultation"
                  type="date"
                  value={hypertensionDiabeticData.dateOfLastConsultation}
                  onChange={(event) =>
                    handleHypertensionDiabeticChange(
                      "dateOfLastConsultation",
                      event.target.value,
                    )
                  }
                  wrapperClassName="lg:col-span-2"
                />
              </div>
            </FormSection>

            <FormSection
              title="Treatment / Action Taken"
              subtitle="Record clinical action, advice, or care plan for this monitoring visit."
              delay={4}
            >
              <FieldTextarea
                label="Treatment / Action Taken"
                value={hypertensionDiabeticData.treatmentActionTaken}
                onChange={(event) => {
                  handleHypertensionDiabeticChange(
                    "treatmentActionTaken",
                    event.target.value,
                  );
                  setMedication(event.target.value);
                }}
                placeholder="Record advice, treatment, monitoring plan, or care instructions..."
                rows={4}
              />
            </FormSection>

            <FormSection
              title="Medicines / Supplies Dispensed"
              subtitle="Optional medicines or supplies given from BHC inventory."
              delay={5}
            >
              <DispensedMedicinesSection
                inventory={bhcMedicineInventory}
                value={dispensedMedicines}
                onChange={handleDispensedMedicinesChange}
                pendingDraftError={validationErrors.dispensedMedicines}
                onPendingDraftChange={handlePendingDispensedMedicineChange}
                disabled={isEditingRecord}
                loading={bhcMedicineInventoryLoading}
                error={bhcMedicineInventoryError}
                onRetry={() => setBhcMedicineInventoryReloadKey((key) => key + 1)}
              />
            </FormSection>

          </>
        )}

        {!isFollowUpVisitMode && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && !isTb && (
          <>
            <FormSection
              title="Clinical Assessment"
              subtitle="Record the patient's complaint, clinical findings, and diagnosis."
              delay={3}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div>
                  <FieldInput
                    label="Chief Complaint"
                    placeholder="e.g. Fever, vomiting, cough"
                    required
                    name="chiefComplaint"
                    error={validationErrors.chiefComplaint}
                    value={chiefComplaint}
                    onChange={(event) => {
                      clearValidationError("chiefComplaint");
                      setChiefComplaint(event.target.value);
                    }}
                  />
                </div>
                <div className="mt-4">
                  <FieldTextarea
                    label="Signs & Symptoms"
                    required
                    name="summaryOfPresentIllness"
                    error={validationErrors.summaryOfPresentIllness}
                    value={summaryOfPresentIllness}
                    onChange={(event) => {
                      clearValidationError("summaryOfPresentIllness");
                      setSummaryOfPresentIllness(event.target.value);
                    }}
                    placeholder="Record symptoms, assessment findings, history, and physical examination findings here..."
                    rows={3}
                  />
                </div>
                <div className="mt-4">
                  <FieldTextarea
                    label="Diagnosis / Assessment"
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                    placeholder="Initial diagnosis or clinical assessment"
                    rows={3}
                  />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Vital Signs"
              subtitle="Record the patient's vital signs for this visit."
              delay={4}
            >
              <LockedFormContent locked={patientGateLocked}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <BpInputGroup
                    systolic={systolicBp}
                    diastolic={diastolicBp}
                    onSystolicChange={setSystolicBp}
                    onDiastolicChange={setDiastolicBp}
                  />
                  <FieldInput
                    label="Temperature"
                    placeholder="e.g. 36.8&#176;C"
                    value={temp}
                    onChange={(event) => setTemp(event.target.value)}
                  />
                  <FieldInput
                    label="Weight"
                    type="number"
                    placeholder="kg"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                  <FieldInput
                    label="Height"
                    type="number"
                    placeholder="cm"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                  <BmiOutputField weight={weight} height={height} />
                </div>
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Treatment/Action Taken"
              subtitle="Document treatment given for this visit."
              delay={5}
            >
              <LockedFormContent locked={patientGateLocked}>
                <FieldTextarea
                  label="Treatment/Action Taken"
                  value={medication}
                  onChange={(event) => setMedication(event.target.value)}
                  placeholder="Medications, procedures, advice given..."
                  rows={3}
                />
              </LockedFormContent>
            </FormSection>

            <FormSection
              title="Medicines / Supplies Dispensed"
              subtitle="Optional medicines or supplies given from BHC inventory during this consultation."
              delay={6}
            >
              <LockedFormContent locked={patientGateLocked}>
                <DispensedMedicinesSection
                  inventory={bhcMedicineInventory}
                  value={dispensedMedicines}
                  onChange={handleDispensedMedicinesChange}
                  pendingDraftError={validationErrors.dispensedMedicines}
                  onPendingDraftChange={handlePendingDispensedMedicineChange}
                  disabled={isEditingRecord}
                  loading={bhcMedicineInventoryLoading}
                  error={bhcMedicineInventoryError}
                  onRetry={() =>
                    setBhcMedicineInventoryReloadKey((key) => key + 1)
                  }
                />
              </LockedFormContent>
            </FormSection>

            {/* Two reporting decisions, side by side. They are one row rather
                than two stacked FormSections because each is a single short
                control and they are decided together. */}
            <div
              className="anim-fade-up grid gap-8 border-t border-[#F1F5F9] pt-5 pb-1 lg:grid-cols-2"
              style={stagger(7)}
            >
              <div>
                <h2 className="text-sm font-bold text-[#1A1A1A]">
                  Morbidity / Notifiable Disease Record
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
                  Choose whether this visit should appear in the morbidity or
                  notifiable diseases daily log.
                </p>
                <div className="mt-4">
                  <LockedFormContent locked={patientGateLocked}>
                    <MorbidityNotifiableReportingSection
                      value={morbidityReportingStatus}
                      onChange={setMorbidityReportingStatus}
                    />
                  </LockedFormContent>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-[#1A1A1A]">
                  Community-Based Surveillance
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
                  Decide whether this visit should be included in the HFMD
                  surveillance list.
                </p>
                <div className="mt-4">
                  <LockedFormContent locked={patientGateLocked}>
                    <YesNoRadioGroup
                      label="Include in HFMD Surveillance List?"
                      name="hfmdSurveillance"
                      value={hfmdSurveillance ? "Yes" : "No"}
                      onChange={(value) =>
                        setHfmdSurveillance(value === "Yes" || value === true)
                      }
                    />
                  </LockedFormContent>
                </div>
              </div>
            </div>

          </>
        )}


        <div
          className="anim-fade-up flex flex-col gap-3 pt-1 pb-4 sm:flex-row sm:items-center sm:justify-between"
          style={stagger(7)}
        >
          <div>
            <button
              type="button"
              onClick={handleStepBack}
              className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
            >
              Back
            </button>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {canSaveCurrentDraft && (
              <button
                type="button"
                onClick={handleManualSaveDraft}
                disabled={draftAutosaveStatus === "saving" || saving}
                aria-busy={draftAutosaveStatus === "saving"}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {draftAutosaveStatus === "saving" ? <ButtonSpinner /> : null}
                {draftAutosaveStatus === "saving"
                  ? "Saving draft..."
                  : activeDraft
                    ? "Update Draft"
                    : "Save as Draft"}
              </button>
            )}
            <button
              type="button"
              onClick={handleContinueToNextAction}
              disabled={isPrimaryActionLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPrimaryActionLoading ? <ButtonSpinner /> : null}
              Next
            </button>
          </div>
        </div>
        </div>
      </form>
      )}
      </>
      )}

      <SuccessModal
        open={Boolean(saveSuccess)}
        title={
          saveSuccess?.isFollowUp
            ? "Follow-up Visit Saved"
            : saveSuccess?.referralSubmitted
              ? "Health Record and Referral Submitted"
            : "Health Record Saved"
        }
        description={
          saveSuccess?.isFollowUp
            ? "The follow-up visit has been saved and linked to the original health record."
            : saveSuccess?.referralSubmitted
              ? "The health record was saved and the referral was linked for RHU review."
              : "The record has been added to this patient's history. You can print it or start another entry."
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
            label: "Add Another Record",
            onClick: () => {
              setSaveSuccess(null);
              lastReferralAttemptRef.current = null;
              setWizardPhase(WIZARD_SETUP);
              setConsultationType(null);
              setSelectedFollowUpTaskId("");
              setHealthRecordType("");
              setSelectedPatientId("");
            },
          },
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
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PATIENT SEARCH DROPDOWN
   ═══════════════════════════════════════════════════════════════ */


function formatFollowUpSchedule(task = {}) {
  const dateValue = task.dueDate || task.due_date;
  if (!dateValue) return "Not recorded";
  const parsed = new Date(`${dateValue}T00:00:00`);
  const date = Number.isNaN(parsed.getTime())
    ? dateValue
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "long" }).format(parsed);
  return task.dueTime ? `${date}, ${task.dueTime}` : date;
}


function DraftsDrawer({
  open,
  onClose,
  drafts,
  loading,
  error,
  resumingId,
  discardingId,
  activeDraftId,
  onRetry,
  onResume,
  onDiscard,
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={<FileClock size={18} />}
      title="Saved Drafts"
      description="Resume an incomplete record saved securely to AKAY."
    >
      {loading ? (
        <div className="px-5 py-5" role="status">
          <InlineSpinner label="Loading saved drafts..." />
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3 px-5 py-5">
          <div className="flex items-start gap-2 text-sm text-[#64748B]">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-[#DDE3E9] bg-white px-3 text-xs font-semibold text-[#475569] transition hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/15"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : drafts.length === 0 ? (
        <div className="px-5 py-5 text-sm text-[#64748B]">
          No active drafts. Select a patient and classification to start a new
          health record.
        </div>
      ) : (
        <div className="divide-y divide-[#EEF2F6]">
          {drafts.map((draft) => {
            const resumeBusy = resumingId === draft.id;
            const discardBusy = discardingId === draft.id;
            return (
              <div key={draft.id} className="group px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#1E293B]">
                        {draft.patient.label}
                      </p>
                      {activeDraftId === draft.id && (
                        <span className="text-[10px] font-bold uppercase text-[#B91C1C]">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="mt-1 inline-block rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
                      {draft.classification}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDiscard(draft)}
                    disabled={Boolean(resumingId || discardingId)}
                    aria-label={`Discard draft for ${draft.patient.label}`}
                    title="Discard draft"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] opacity-0 transition hover:bg-red-50 hover:text-[#B91C1C] focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                  >
                    {discardBusy ? <ButtonSpinner /> : <Trash2 size={15} />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-[#64748B]">
                  Saved {formatDraftDateTime(draft.lastSavedAt)}
                  <span className="mx-1.5 text-[#CBD5E1]">&bull;</span>
                  {formatDraftExpiry(draft.expiresAt)}
                </p>
                <button
                  type="button"
                  onClick={() => onResume(draft.id)}
                  disabled={Boolean(resumingId || discardingId)}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-3.5 text-xs font-semibold text-white transition hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resumeBusy ? <ButtonSpinner /> : <RotateCcw size={14} />}
                  {resumeBusy ? "Opening..." : "Resume"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}





function CareDecisionStep({
  patientName,
  patientMeta,
  classification,
  dateOfVisit,
  timeOfVisit,
  status,
  followUpDate,
  needsReferral,
  saving,
  referralLabel,
  errors = {},
  onStatusChange,
  onFollowUpDateChange,
  onNeedsReferralChange,
  onSave,
}) {
  const normalizedStatus = normalizePatientStatus(status);
  const followUpRequired = normalizedStatus === "Follow-up Required";
  const completed = normalizedStatus === "Completed";
  const formattedVisitDate = dateOfVisit
    ? new Date(dateOfVisit).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Not recorded";
  const statusOptions = [
    {
      value: "Completed",
      title: "Completed",
      description: "No follow-up, monitoring, or referral needed.",
    },
    {
      value: "Routine Monitoring",
      title: "Routine Monitoring",
      description: "Patient remains under routine observation.",
    },
    {
      value: "Follow-up Required",
      title: "Follow-up Required",
      description: "Patient needs to return for another visit.",
    },
  ];

  return (
    <form
      onSubmit={onSave}
      noValidate
      className="anim-fade-up ml-0 mr-auto w-full max-w-7xl"
      style={stagger(2)}
    >
      <div className="rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm sm:p-6">
        <div className="rounded-xl border border-[#F1F5F9] bg-[#FAFBFC] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
            Patient Summary
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem label="Patient" value={patientName || "Selected patient"} />
            <SummaryItem label="Classification" value={classification || "Not selected"} />
            <SummaryItem label="Date of Visit" value={formattedVisitDate} />
            <SummaryItem label="Time of Visit" value={timeOfVisit || "Not recorded"} />
            {patientMeta && <SummaryItem label="Age / Sex" value={patientMeta} />}
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div
            data-field="followUpStatus"
            tabIndex={errors.followUpStatus ? -1 : undefined}
          >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
              Follow-up Plan
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {statusOptions.map((option) => {
                const selected = normalizedStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onStatusChange(option.value)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-[#B91C1C] bg-red-50 ring-2 ring-[#B91C1C]/10"
                        : "border-[#E8ECF0] bg-white hover:border-red-100 hover:bg-[#FEF2F2]/40"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[#0F172A]">
                        {option.title}
                      </span>
                      {selected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#B91C1C] text-white">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[#64748B]">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.followUpStatus && (
              <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">
                {errors.followUpStatus}
              </p>
            )}
          </div>

          {followUpRequired && (
            <FieldInput
              label="Follow-up Date"
              type="date"
              required
              name="followUpDate"
              error={errors.followUpDate}
              value={followUpDate}
              onChange={(event) => onFollowUpDateChange(event.target.value)}
            />
          )}

          {!completed && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                {referralLabel}
              </p>
              <div className="inline-grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-xl border border-[#E8ECF0] bg-white p-1">
                {[
                  { value: false, title: "No" },
                  { value: true, title: "Yes" },
                ].map((option) => {
                  const selected = needsReferral === option.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => onNeedsReferralChange(option.value)}
                      className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${
                        selected
                          ? "bg-[#B91C1C] text-white shadow-sm"
                          : "text-[#64748B] hover:bg-red-50 hover:text-[#B91C1C]"
                      }`}
                    >
                      {option.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <ButtonSpinner /> : <Save size={15} />}
            {saving ? "Saving health record..." : "Save Health Record"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-0.5 truncate font-semibold text-[#0F172A]">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}





// eslint-disable-next-line no-unused-vars
function PatientSelectionStep({
  selectedPatient,
  selectedPatientId,
  onCancel,
  onProceed,
  ...dropdownProps
}) {
  const display = getPatientDisplay(selectedPatient || {});
  const displayId = display.id || selectedPatientId || "Not recorded";

  return (
    <section className="anim-fade-up mx-auto w-full max-w-[720px] pt-4 sm:pt-8" style={stagger(1)}>
      <div className="relative z-[90] rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-[#B91C1C]">
            <User size={20} />
          </div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">Select Patient</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#6B7280]">
            Search and select the patient before recording a visit.
          </p>
        </div>

        <PatientSearchDropdown
          {...dropdownProps}
          selectedPatientId={selectedPatientId}
          disabled={false}
        />

        {selectedPatientId && (
          <div className="mt-4 rounded-xl border border-[#F0F2F5] bg-[#FAFBFC] px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#B91C1C]">
              Selected Patient
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-[#111827]">
                {display.name || "Selected patient"}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-mono text-[11px] font-semibold text-slate-600">
                {displayId}
              </span>
              {display.age && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-medium text-[#6B7280]">
                    {display.age}
                  </span>
                </>
              )}
              {display.barangay && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-medium text-[#6B7280]">
                    {display.barangay}
                  </span>
                </>
              )}
              {display.contact && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-medium text-[#6B7280]">
                    {display.contact}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition hover:border-[#D1D5DB] hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={!selectedPatientId}
            className="rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proceed to Health Record
          </button>
        </div>
      </div>
    </section>
  );
}

function PatientSearchDropdown({
  inputRef,
  dropdownRef,
  disabled,
  dropdownOpen,
  selectedPatientId,
  searchTerm,
  inputValue,
  patients,
  totalPatientCount,
  matchingPatientCount,
  visibleLimit,
  loading,
  loadError,
  isSearching,
  onSeeAll,
  onRetryLoad,
  highlightIndex,
  onSearchChange,
  onOpen,
  onClear,
  onSelect,
  onHighlight,
  error = "",
  dropdownAlign = "left",
  hideLabel = false,
}) {
  const dropdownPositionClass =
    dropdownAlign === "right"
      ? "right-0 left-auto w-[min(24rem,calc(100vw-2rem))]"
      : "left-0 right-0 w-full";

  return (
    <div
      className="relative z-[70] w-full"
      data-field="selectedPatientId"
      tabIndex={error ? -1 : undefined}
    >
      {!hideLabel && (
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Search Existing Patient
        </label>
      )}

      <div className="relative">

        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search patient name, ID, contact, or barangay..."
          value={inputValue}
          onChange={onSearchChange}
          onFocus={onOpen}
          disabled={disabled}
          readOnly={disabled}
          className={`h-10 w-full rounded-xl border bg-[#FAFBFC] pl-10 pr-10 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] ${
            error
              ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
              : dropdownOpen
                ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
                : "border-[#E8ECF0]"
          }`}

          
        />

        {selectedPatientId && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[#9CA3AF] transition-colors hover:bg-[#F3F4F6] hover:text-[#6B7280]"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-[11px] font-medium text-[#B91C1C]">
          {error}
        </p>
      )}

      {dropdownOpen && !disabled && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Patient search results"
          className={`anim-drop-in absolute top-full z-[99999] mt-2 max-h-[min(28rem,calc(100vh-9rem))] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-2xl shadow-slate-900/10 ${dropdownPositionClass}`}
        >
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {loadError
                ? "Unable to load"
                : loading
                ? "Loading"
                : `${matchingPatientCount} result${matchingPatientCount !== 1 ? "s" : ""}`}
            </p>
            {searchTerm && (
              <span className="max-w-[220px] truncate text-[10px] text-[#BFBFBF]">
                Searching: {searchTerm}
              </span>
            )}
          </div>

          {loadError ? (
            <div className="px-3.5 py-8 text-center">
              <AlertCircle size={22} className="mx-auto mb-2 text-[#B91C1C]" />
              <p className="text-xs font-bold text-[#0F172A]">
                Unable to load patients.
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[#64748B]">
                Please check your connection and try again.
              </p>
              <button
                type="button"
                onClick={onRetryLoad}
                className="mt-3 rounded-lg border border-[#E8ECF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="px-3.5 py-8 text-center">
              <InlineSpinner
                label={
                  isSearching
                    ? "Searching patients..."
                    : "Loading registered patients..."
                }
                className="justify-center"
              />
            </div>
          ) : patients.length === 0 ? (
            <div className="px-3.5 py-8 text-center">
              <Search size={20} className="mx-auto mb-2 text-[#D4D4D4]" />
              <p className="text-xs font-medium text-[#9CA3AF]">
                {totalPatientCount === 0
                  ? "No registered patients found"
                  : "No patients found"}
              </p>
              <p className="mt-0.5 text-[10px] text-[#D4D4D4]">
                {totalPatientCount === 0
                  ? "Registered patients will appear here once available."
                  : "Try a different name, ID, contact number, or barangay."}
              </p>
            </div>
          ) : (
            <>
            <div className="max-h-[min(20rem,calc(100vh-15rem))] divide-y divide-[#F1F5F9] overflow-y-auto overscroll-contain py-1">
              {patients.map((patient, index) => {
                const display = getPatientDisplay(patient);
                const isSelected = String(patient.id) === String(selectedPatientId);
                const isHighlighted = index === highlightIndex;

                return (
                  <button
                    key={patient.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => onHighlight(index)}
                    onFocus={() => onHighlight(index)}
                    onClick={() => onSelect(patient.id)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors duration-100 focus:bg-[#FEF2F2] ${
                      isHighlighted
                        ? "bg-[#FEF2F2]"
                        : isSelected
                          ? "bg-red-50"
                          : "bg-white hover:bg-[#FAFBFC]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className={`truncate text-sm ${
                            isSelected
                              ? "font-bold text-[#B91C1C]"
                              : "font-semibold text-[#1F2937]"
                          }`}
                        >
                          {display.name}
                        </p>
                        {display.id && (
                          <span className="shrink-0 rounded-md border border-[#E8ECF0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#0F172A]">
                            {display.id}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[10.5px] text-[#64748B]">
                        {[
                          display.age,
                          display.barangay,
                          display.contact,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    {isSelected && (
                      <Check
                        size={14}
                        className="shrink-0 text-[#B91C1C]"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {matchingPatientCount > visibleLimit && (
              <button
                type="button"
                onClick={onSeeAll}
                className="flex w-full items-center justify-center border-t border-[#F3F4F6] bg-[#FAFBFC] px-3.5 py-2.5 text-xs font-semibold text-[#B91C1C] transition-colors hover:bg-red-50"
              >
                See all patients
              </button>
            )}
            </>
          )}
        </div>
      )}

    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   FORM SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FormSection({ title, subtitle, children, delay = 0, accent }) {
  return (
    <div
      className="anim-fade-up space-y-4 border-t border-[#F1F5F9] pt-5 pb-1"
      style={stagger(delay)}
    >
      <div>
        <h2
          className={`text-sm font-bold ${
            accent === "pink" ? "text-pink-800" : "text-[#1A1A1A]"
          }`}
        >
          {title}
        </h2>

        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
            {subtitle}
          </p>
        )}
      </div>

      <div>{children}</div>
    </div>
  );
}

function LockedFormContent({ locked, children }) {
  if (!locked) return children;

  return (
    <fieldset disabled className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        Select a patient first to continue.
      </div>
      <div className="pointer-events-none opacity-60">{children}</div>
    </fieldset>
  );
}




function MaternalClassificationWarning() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">
        Please verify the selected patient before creating a maternal record.
      </p>
    </div>
  );
}

const MORBIDITY_REPORTING_OPTIONS = [
  {
    value: "not_included",
    label: "Not included",
  },
  {
    value: "morbidity",
    label: "Include in Morbidity Log",
  },
  {
    value: "notifiable",
    label: "Mark as Notifiable Disease",
  },
];

function MorbidityNotifiableReportingSection({ value, onChange }) {
  return (
    <div className="space-y-4">
      <div data-field="morbidityReportingStatus">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Reporting Status
        </p>
        <div className="grid gap-2">
          {MORBIDITY_REPORTING_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
            >
              <input
                type="radio"
                name="morbidityReportingStatus"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 accent-[#B91C1C]"
              />
              <span
                className={
                  value === option.value
                    ? "font-semibold text-[#B91C1C]"
                    : "text-[#475569]"
                }
              >
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function RadioChoiceGroup({
  label,
  name,
  value,
  options = [],
  onChange,
  helperText,
  error,
  required = false,
}) {
  return (
    <div data-field={name} tabIndex={error ? -1 : undefined}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-1 text-[#B91C1C]">*</span>}
      </p>
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                value === option.value
                  ? "font-semibold text-[#B91C1C]"
                  : "text-[#475569]"
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {helperText && (
        <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
          {helperText}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">{error}</p>}
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
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full rounded-lg border px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60 ${inputClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>
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
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full appearance-none rounded-lg border px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${selectClass} ${className}`}
      >
        {children}
      </select>
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>
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
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        {...props}
        aria-invalid={Boolean(error)}
        rows={rows}
        className={`w-full resize-none rounded-lg border px-3.5 py-3 text-sm leading-relaxed text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] ${textareaClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>
      )}
    </div>
  );
}

function YesNoRadioGroup({ label, name, value, onChange, disabled = false }) {
  return (
    <div data-field={name}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2">
        {["No", "Yes"].map((option) => (
          <label
            key={option}
            className={`flex items-center gap-2 text-sm font-medium text-[#475569] ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={(value || "No") === option}
              onChange={() => onChange(option)}
              disabled={disabled}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                (value || "No") === option
                  ? "font-semibold text-[#B91C1C]"
                  : "text-[#475569]"
              }
            >
              {option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function BpInputGroup({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        Blood Pressure (mmHg)
      </label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          placeholder="Systolic"
          value={systolic}
          onChange={(event) => onSystolicChange(event.target.value)}
          className="h-10 w-full rounded-l-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border-y border-[#E5E7EB] bg-[#F9FAFB] text-sm font-bold text-[#6B7280]">
          /
        </div>
        <input
          type="number"
          placeholder="Diastolic"
          value={diastolic}
          onChange={(event) => onDiastolicChange(event.target.value)}
          className="h-10 w-full rounded-r-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <p className="mt-1 text-[9px] text-[#BFBFBF]">Systolic / Diastolic</p>
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
function ScoreInputGroup({
  label,
  fields,
  values = {},
  onChange,
  preview,
  columnsClassName = "grid-cols-4",
}) {
  return (
    <div>
      <p className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <div className={`grid gap-3 ${columnsClassName}`}>
        {fields.map((field) => (
          <div key={field.key}>
            <label
              className="mb-1 block text-[9px] font-semibold uppercase leading-tight tracking-wider text-[#9CA3AF]"
              htmlFor={`ob-score-${field.key}`}
            >
              {field.label}
            </label>
            <input
              id={`ob-score-${field.key}`}
              type="number"
              min="0"
              inputMode="numeric"
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-center text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-[#94A3B8]">
        Format: <span className="font-bold text-[#B91C1C]">{preview}</span>
      </p>
    </div>
  );
}

function RiskCodeChecklist({ eyebrow, options, values = {}, onChange }) {
  return (
    <div>
      <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#B91C1C]">
        {eyebrow}
      </p>
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const childKeys = (option.children || []).map((child) => child.key);
          const checked = Boolean(values[option.key]);

          return (
            <div key={option.key}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange(option.key, event.target.checked, childKeys)
                  }
                  className="h-4 w-4 shrink-0 rounded border-[#D1D5DB] accent-[#B91C1C]"
                />
                <span
                  className={
                    checked ? "font-semibold text-[#B91C1C]" : "text-[#475569]"
                  }
                >
                  {option.label}
                </span>
              </label>

              {checked && childKeys.length > 0 && (
                <div className="mt-3 flex flex-col gap-3 pl-7">
                  {option.children.map((child) => {
                    const childChecked = Boolean(values[child.key]);

                    return (
                      <label
                        key={child.key}
                        className="flex cursor-pointer items-center gap-2.5 text-sm font-medium"
                      >
                        <input
                          type="checkbox"
                          checked={childChecked}
                          onChange={(event) =>
                            onChange(child.key, event.target.checked)
                          }
                          className="h-4 w-4 shrink-0 rounded border-[#D1D5DB] accent-[#B91C1C]"
                        />
                        <span
                          className={
                            childChecked
                              ? "font-semibold text-[#B91C1C]"
                              : "text-[#475569]"
                          }
                        >
                          {child.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
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
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        BMI
      </label>
      <div className="flex h-10 w-full items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3.5">
        <span className="text-sm font-bold text-[#0F172A]">
          {bmi === null ? "—" : formatBmi(bmi)}
        </span>
        {category && (
          <span className="text-[11px] font-bold uppercase text-[#B91C1C]">
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


function getPatientSearchText(patient = {}) {
  const display = getPatientDisplay(patient);

  return [
    patient.id,
    patient.patientId,
    patient.familySerialNo,
    patient.philHealthNumber,
    patient.philhealthNumber,
    display.name,
    display.age,
    display.cls,
    display.contact,
    patient.contact,
    patient.contactNumber,
    patient.address,
    patient.streetAddress,
    display.barangay,
    patient.municipality,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

