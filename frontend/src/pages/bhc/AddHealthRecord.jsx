import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  HeartPulse,
  Save,
  Search,
  Stethoscope,
  Syringe,
  User,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionIssueModal, SuccessModal } from "../../components/common";
import {
  DatePickerField,
  TimePickerField,
} from "../../components/common/forms/DatePickerField";
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import InlineSpinner from "../../components/common/loading/InlineSpinner";
import DispensedMedicinesSection from "../../components/features/medicine/DispensedMedicinesSection";
import healthRecordService, {
  getHealthRecordById,
} from "../../services/healthRecordService";
import {
  BHC_MEDICINES_UPDATED_EVENT,
  getBhcMedicines,
  refreshRhuMedicines,
} from "../../services/medicineService";
import { getPatientDetailsListByRole } from "../../services/patientService";
import { createReferral } from "../../services/referrals";
import { isConnectionError } from "../../services/apiClient";
import { saveOfflineDraft } from "../../services/offlineDraftService";
import { getCurrentUser } from "../../utils/auth";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

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

const RECORD_TYPE_OPTIONS = [
  "General Consultation",
  "Immunization",
  "Maternal",
  "Family Planning",
  "Hypertension / Diabetic Monitoring",
  "TB DOTS / TB Monitoring",
];

const RECORD_TYPE_DETAILS = {
  "General Consultation": {
    title: "General Consultation",
    description:
      "For check-ups, symptoms, diagnosis, morbidity, and notifiable cases.",
    icon: Stethoscope,
  },
  Maternal: {
    title: "Maternal / Prenatal",
    description: "For prenatal, pregnancy, postpartum, and maternal monitoring.",
    icon: HeartPulse,
  },
  Immunization: {
    title: "Child Health / EPI",
    description: "For vaccines, child care, EPI entries, and growth monitoring.",
    icon: Syringe,
  },
  "Hypertension / Diabetic Monitoring": {
    title: "Hypertension / Diabetic Monitoring",
    description: "For HPN, DM, BP/FBS monitoring, medicines, and follow-up.",
    icon: User,
  },
  "Family Planning": {
    title: "Family Planning",
    description: "For counseling, method provision, follow-up, and FP service visits.",
    icon: Stethoscope,
  },
  "TB DOTS / TB Monitoring": {
    title: "TB DOTS / TB Monitoring",
    description: "For TB screening, treatment monitoring, and follow-up.",
    icon: Stethoscope,
    comingSoon: true,
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

const FAMILY_PLANNING_CLIENT_TYPES = [
  "New Acceptor",
  "Current User",
  "Returning User",
  "Changing Method",
  "Discontinued / Dropout",
  "For Counseling",
];

const FAMILY_PLANNING_METHODS = [
  "DMPA / Injectable",
  "Pills",
  "Condom",
  "Implant",
  "IUD",
  "LAM",
  "Natural Family Planning",
  "BTL",
  "NSV",
  "Other",
];

const FAMILY_PLANNING_PREVIOUS_METHODS = [
  "None",
  "Pills",
  "Injectable",
  "Condom",
  "Implant",
  "IUD",
  "LAM",
  "Natural Method",
  "Other",
];

const FAMILY_PLANNING_VISIT_TYPES = [
  "Counseling",
  "Initial Visit",
  "Follow-up",
  "Method Provided",
  "Changing Method",
  "Side-effect Concern",
  "Referral",
  "Other",
];

const FAMILY_PLANNING_SOURCES = ["Public", "Private", "Other"];

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

const PREGNANCY_RISK_OPTIONS = [
  {
    key: "ageRisk",
    label: "Age less than 18 or greater than 35",
  },
  {
    key: "heightRisk",
    label: "Height less than 145 cm",
  },
  {
    key: "grandMultipara",
    label: "Grand multipara / fourth baby or more",
  },
  {
    key: "previousCs",
    label: "Previous C/S",
  },
  {
    key: "recurrentMiscarriageOrStillbirth",
    label: "3 consecutive miscarriage or stillbirth",
  },
  {
    key: "postpartumHemorrhage",
    label: "Post-partum hemorrhage",
  },
];

const MEDICAL_HISTORY_OPTIONS = [
  { key: "tuberculosis", label: "Tuberculosis" },
  { key: "heartDisease", label: "Heart Disease" },
  { key: "diabetes", label: "Diabetes" },
  { key: "bronchialAsthma", label: "Bronchial Asthma" },
  { key: "goiter", label: "Goiter" },
  { key: "hypertensive", label: "Hypertensive" },
  { key: "alcoholUser", label: "Alcohol user" },
  { key: "smoker", label: "Smoker" },
];

const LABORATORY_RESULT_FIELDS = [
  { key: "hemoglobin", label: "Hemoglobin" },
  { key: "cbc", label: "CBC" },
  { key: "hbsag", label: "HBsAg" },
  { key: "bloodType", label: "Blood Type" },
  { key: "hiv", label: "HIV" },
  { key: "syphilis", label: "Syphilis" },
  { key: "urinalysis", label: "Urinalysis" },
];

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
  if (["completed", "complete", "recovered", "closed"].includes(compact)) {
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
  const basePath = userRole === "bhc" ? "/bhc" : "/rhu";
  const healthRecordsPath = `${basePath}/health-records`;

  const recordId = searchParams.get("recordId");
  const preselectedPatientId = searchParams.get("patientId") || "";
  const preselectedClassification = normalizeRecordType(
    searchParams.get("classification") ||
      searchParams.get("category") ||
      searchParams.get("recordType") ||
      searchParams.get("healthRecordType"),
  );
  const requestedMode =
    searchParams.get("mode") || (recordId ? "follow-up" : "create");
  const mode = requestedMode;
  const isFollowUp = !!recordId && mode === "follow-up";
  const isOrphanFollowUpRequest = !recordId && requestedMode === "follow-up";
  const isEditingRecord = !!recordId && mode === "edit";

  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [lastFailedDraft, setLastFailedDraft] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [setupComplete, setSetupComplete] = useState(
    Boolean(recordId) || Boolean(preselectedPatientId && preselectedClassification),
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef(null);
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
  const [pulse, setPulse] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const [followUpStatus, setFollowUpStatus] = useState("Routine Monitoring");
  const [followUpDate, setFollowUpDate] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [patientCondition, setPatientCondition] = useState("Improving");
  const [careDecisionStep, setCareDecisionStep] = useState(false);
  const [needsReferral, setNeedsReferral] = useState(false);
  const [referralDetailsStep, setReferralDetailsStep] = useState(false);
  const [pendingReferralDraft, setPendingReferralDraft] = useState(null);
  const [referralValidationErrors, setReferralValidationErrors] = useState({});
  const [referralForm, setReferralForm] = useState({
    receivingFacility:
      currentUser?.assignedRuralHealthUnit ||
      currentUser?.ruralHealthUnit ||
      "",
    urgencyLevel: "Non-urgent",
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
    preferredDoctor: "",
  });

  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [bhcMedicineInventory, setBhcMedicineInventory] = useState([]);
  const [dispensedMedicines, setDispensedMedicines] = useState([]);
  const [familyPlanningData, setFamilyPlanningData] = useState(
    EMPTY_FAMILY_PLANNING_DATA,
  );
  const [hypertensionDiabeticData, setHypertensionDiabeticData] = useState(
    EMPTY_HYPERTENSION_DIABETIC_DATA,
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");
  const [followUpRecord, setFollowUpRecord] = useState(null);

  const [immunizationData, setImmunizationData] = useState(
    EMPTY_IMMUNIZATION_DATA,
  );

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
        const parsedPatients = await getPatientDetailsListByRole("bhc");
        if (!active) return;
        setPatients(parsedPatients || []);
        if (preselectedPatientId) setSelectedPatientId(preselectedPatientId);
      } finally {
        if (active) setPatientsLoading(false);
      }
    }

    loadPatients();

    return () => {
      active = false;
    };
  }, [preselectedPatientId]);

  useEffect(() => {
    let active = true;

    async function loadMedicines() {
      const medicines = await refreshRhuMedicines();
      if (active) {
        setBhcMedicineInventory(medicines.filter((item) => !item.ruralHealthUnitId));
      }
    }

    function syncFromCache() {
      setBhcMedicineInventory(getBhcMedicines());
    }

    syncFromCache();
    loadMedicines();
    window.addEventListener(BHC_MEDICINES_UPDATED_EVENT, syncFromCache);

    return () => {
      active = false;
      window.removeEventListener(BHC_MEDICINES_UPDATED_EVENT, syncFromCache);
    };
  }, []);

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
      setPulse(found.pulseRate || found.pulse || "");
      setRespiratoryRate(
        found.respiratoryRate ||
          found.respiratory_rate ||
          found.vitalSigns?.respiratoryRate ||
          found.vitalSigns?.respiratory_rate ||
          found.vital_signs?.respiratoryRate ||
          found.vital_signs?.respiratory_rate ||
          "",
      );
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
        setFollowUpRecord(null);
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
  }, [isFollowUp, recordId]);

  const selectedPatientFromList = patients.find(
    (patient) => String(patient.id) === String(selectedPatientId),
  );
  const selectedPatient =
    selectedPatientFromList ||
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

  const selectedPatientLabel = selectedPatient
    ? getPatientSearchLabel(selectedPatient)
    : "";
  const patientSearchInputValue =
    dropdownOpen || !selectedPatientId ? searchTerm : selectedPatientLabel;
  const visitType = isFollowUp ? "follow_up_visit" : "initial_consultation";
  const followUpPatientName =
    getPatientName(selectedPatient) ||
    followUpRecord?.patientName ||
    followUpRecord?.patient?.name ||
    "Selected patient";

  useEffect(() => {
    if (!dropdownOpen) return;

    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        closeDropdown();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeDropdown();
        return;
      }

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

      if (event.key === "Enter") {
        if (highlightIndex >= 0 && highlightIndex < filteredPatients.length) {
          event.preventDefault();
          selectPatient(filteredPatients[highlightIndex].id);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen, filteredPatients, highlightIndex]);

  useEffect(() => {
    setHighlightIndex(filteredPatients.length > 0 ? 0 : -1);
  }, [searchTerm, filteredPatients.length]);

  function closeDropdown() {
    setDropdownOpen(false);
    setHighlightIndex(-1);
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
  }

  function selectPatient(id) {
    clearValidationError("selectedPatientId");
    if (id !== selectedPatientId) {
      resetClassificationSpecificState();
      setSetupComplete(false);
      setCareDecisionStep(false);
      setNeedsReferral(false);
    }
    setSelectedPatientId(id);
    setSearchTerm("");
    setDropdownOpen(false);
    setHighlightIndex(-1);
  }

  function clearSelectedPatient() {
    setSelectedPatientId("");
    resetClassificationSpecificState();
    setSetupComplete(false);
    setCareDecisionStep(false);
    setNeedsReferral(false);
    setSearchTerm("");
    setDropdownOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handlePatientSearchChange(event) {
    if (selectedPatientId) {
      setSelectedPatientId("");
      resetClassificationSpecificState();
      setSetupComplete(false);
      setCareDecisionStep(false);
      setNeedsReferral(false);
    }
    setSearchTerm(event.target.value);
    setDropdownOpen(true);
  }

  const normalizedHealthRecordType = normalizeRecordType(healthRecordType);
  const recordTypeKey = normalizedHealthRecordType.toLowerCase();
  const isImmunization = recordTypeKey === "immunization";
  const isMaternal = recordTypeKey === "maternal";
  const isFamilyPlanning = recordTypeKey === "family planning";
  const isHypertensionDiabetic =
    recordTypeKey === "hypertension / diabetic monitoring";
  const isGeneralConsultationFollowUp =
    isFollowUp &&
    !isImmunization &&
    !isMaternal &&
    !isFamilyPlanning &&
    !isHypertensionDiabetic;
  const patientGateLocked = !isFollowUp && !selectedPatientId;
  const selectedPatientIsMale = !isFollowUp && isPatientMale(selectedPatient);
  const selectedPatientSexMissing =
    !isFollowUp && Boolean(selectedPatientId) && !hasPatientSex(selectedPatient);
  const followUpPatientHasMaternalMismatch =
    isFollowUp &&
    isMaternal &&
    isPatientMale(selectedPatient || followUpRecord?.patient || followUpRecord);
  const showMaternalPatientWarning =
    isMaternal &&
    (followUpPatientHasMaternalMismatch ||
      (!isFollowUp && selectedPatientSexMissing));
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
  const showFollowUpMonitoringFields =
    normalizedPatientStatus === "Follow-up Required";
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

  const formattedBp = (() => {
    const sys = systolicBp || "N/A";
    const dia = diastolicBp || "N/A";
    return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
  })();

  const concatenatedVitalSigns = `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | Pulse: ${
    pulse || "N/A"
  } bpm | Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;
  const consultationVitalSigns = [
    concatenatedVitalSigns,
    `Respiratory Rate: ${respiratoryRate || "N/A"} cpm`,
  ].join(" | ");
  const maternalTpalScore = [
    maternalData.term || 0,
    maternalData.preterm || 0,
    maternalData.abortion || 0,
    maternalData.living || 0,
  ].join("-");

  function handleClassificationSelect(nextType) {
    clearValidationError("healthRecordType");
    const normalizedNextType = normalizeRecordType(nextType);
    const config = RECORD_TYPE_DETAILS[nextType] || {};

    if (patientGateLocked) {
      setNoticeModal({
        title: "Patient Required",
        message: "Please select a patient first before choosing a record type.",
      });
      return;
    }

    if (config.comingSoon) {
      setNoticeModal({
        title: "Form Not Available",
        message: "TB DOTS / TB Monitoring form is not yet available.",
      });
      return;
    }

    if (normalizedNextType !== normalizedHealthRecordType) {
      setMaternalData(EMPTY_MATERNAL_DATA);
      setDispensedMedicines([]);
      setExpectedDeliveryDate("");
      setAog("");
      setImmunizationData(EMPTY_IMMUNIZATION_DATA);
      setFamilyPlanningData(EMPTY_FAMILY_PLANNING_DATA);
      setHypertensionDiabeticData(EMPTY_HYPERTENSION_DIABETIC_DATA);
    }

    setHealthRecordType(nextType);
  }

  function handleProceedFromSetup() {
    closeDateTimePopovers();

    if (!selectedPatientId) {
      setValidationErrorsAndFocus({
        selectedPatientId: "Please select a patient first before proceeding.",
      });
      setNoticeModal({
        title: "Patient Required",
        message: "Please select a patient first before proceeding.",
      });
      return;
    }

    if (!normalizedHealthRecordType) {
      setValidationErrorsAndFocus({
        healthRecordType: "Please choose a record type before proceeding.",
      });
      setNoticeModal({
        title: "Service Type Required",
        message: "Please choose a record type before proceeding.",
      });
      return;
    }

    setSetupComplete(true);
    setCareDecisionStep(false);
    setDropdownOpen(false);
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
      if (!isFollowUp) setPatientCondition("");
    }
  }

  function handleNeedsReferralChange(value) {
    const nextNeedsReferral = value === "Yes" || value === true;
    setNeedsReferral(nextNeedsReferral);
    if (nextNeedsReferral) {
      clearValidationError("followUpDate");
      setFollowUpDate("");
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
      const selector = `[name="${firstField}"], [data-field="${firstField}"]`;
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

    if (!dateOfVisit) errors.dateOfVisit = "Date of visit is required.";
    if (!timeOfVisit) errors.timeOfVisit = "Time of visit is required.";
    if (!String(attendingStaff || "").trim()) {
      errors.attendingStaff = "Name of practitioner is required.";
    }
    if (isGeneralConsultationFollowUp) {
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

      if (preparedEntries.length === 0 && !consultationNotes.trim()) {
        errors.vaccineEntries =
          "Select at least one vaccine or enter remarks if no vaccine was given.";
      }

      return errors;
    }

    if (isFamilyPlanning) {
      const hasConcern =
        familyPlanningData.hasClinicalConcern === "Yes" ||
        familyPlanningData.fpVisitType === "Side-effect Concern";

      if (hasConcern && !String(familyPlanningData.concern || "").trim()) {
        errors.familyPlanningConcern =
          "Concern or side-effect notes are required when clinical concern is marked Yes.";
      }

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

    if (!chiefComplaint.trim()) {
      errors.chiefComplaint = "Chief complaint is required.";
    }
    if (!summaryOfPresentIllness.trim()) {
      errors.summaryOfPresentIllness =
        "Summary of present illness is required.";
    }

    return errors;
  }

  function getReferralValidationErrors() {
    const errors = {};
    if (!String(referralForm.dateOfReferral || "").trim()) {
      errors.dateOfReferral = "Date of referral is required.";
    }
    if (!String(referralForm.timeOfReferral || "").trim()) {
      errors.timeOfReferral = "Time of referral is required.";
    }
    if (!String(referralForm.referringHci || "").trim()) {
      errors.referringHci = "Name of referring HCI is required.";
    }
    if (!String(referralForm.referringPractitioner || "").trim()) {
      errors.referringPractitioner = "Referring practitioner is required.";
    }
    if (!String(referralForm.reasonForReferral || "").trim()) {
      errors.reasonForReferral = "Reason for referral is required.";
    }
    if (
      String(pendingReferralDraft?.formData?.chiefComplaint || "").trim() &&
      !String(referralForm.chiefComplaint || "").trim()
    ) {
      errors.chiefComplaint = "Chief complaint is required for this referral.";
    }
    if (
      String(pendingReferralDraft?.formData?.diagnosis || "").trim() &&
      !String(referralForm.initialDiagnosis || "").trim()
    ) {
      errors.initialDiagnosis = "Initial diagnosis is required for this referral.";
    }
    return errors;
  }

  function setReferralErrorsAndFocus(errors) {
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, value]) => Boolean(value)),
    );
    setReferralValidationErrors(nextErrors);

    const firstField = Object.keys(nextErrors)[0];
    if (!firstField) return false;

    window.requestAnimationFrame(() => {
      const selector = `[name="${firstField}"], [data-field="${firstField}"]`;
      const element = document.querySelector(selector);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof element?.focus === "function") {
        element.focus({ preventScroll: true });
      }
    });

    return true;
  }

  function handleReferralFormChange(field, value) {
    setReferralValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
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

  function handleVaccineEntryChange(index, field, value) {
    clearValidationError(`vaccineEntries.${index}.${field}`);
    clearValidationError("vaccineEntries");
    if (field === "nextScheduleDate" && value) {
      clearValidationError("followUpDate");
      setFollowUpStatus("Follow-up Required");
      setFollowUpDate(value);
    }
    setImmunizationData((prev) => {
      const entries = getVaccineEntries(prev).map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      );
      return {
        ...prev,
        vaccineEntries: entries,
        vaccinesGiven: entries,
      };
    });
  }

  function handleVaccineToggle(vaccineName, checked) {
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

  function addPregnancyHistoryRow() {
    setMaternalData((prev) => ({
      ...prev,
      previousPregnancyHistory: [
        ...(prev.previousPregnancyHistory || []),
        {
          pregnancyNo: `G${(prev.previousPregnancyHistory || []).length + 1}`,
          placeOfDelivery: "",
          year: "",
          notes: "",
        },
      ],
    }));
  }

  function updatePregnancyHistoryRow(index, field, value) {
    setMaternalData((prev) => ({
      ...prev,
      previousPregnancyHistory: (prev.previousPregnancyHistory || []).map(
        (entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function removePregnancyHistoryRow(index) {
    setMaternalData((prev) => ({
      ...prev,
      previousPregnancyHistory: (prev.previousPregnancyHistory || []).filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    }));
  }

  function handleFamilyPlanningChange(field, value) {
    setFamilyPlanningData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "fpVisitType" && value === "Side-effect Concern"
        ? { hasClinicalConcern: "Yes" }
        : {}),
      ...(field === "hasClinicalConcern" && value !== "Yes"
        ? { concern: "", findings: "", adviceGiven: "" }
        : {}),
    }));
  }

  function handleHypertensionDiabeticChange(field, value) {
    clearValidationError(`hypertensionDiabeticData.${field}`);
    setHypertensionDiabeticData((prev) => ({ ...prev, [field]: value }));
  }

  async function saveHealthRecord(formData) {
    const savedRecord = isEditingRecord
      ? await healthRecordService.updateHealthRecordById(
          recordId,
          formData,
          "bhc",
        )
      : isFollowUp
        ? await healthRecordService.createFollowUpHealthRecord(
            {
              ...formData,
              previousRecordId: recordId,
              parentHealthRecordId: recordId,
              parent_health_record_id: recordId,
              visitType: "follow_up_visit",
              visit_type: "follow_up_visit",
              recordType: "Follow-up",
              isFollowUp: true,
            },
            "bhc",
          )
        : await healthRecordService.createHealthRecord(formData, "bhc");
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails(userRole, savedId),
      });
    }
    await refreshRhuMedicines();

    return { savedRecord, savedId };
  }

  function handleSaveHealthRecordDraft() {
    if (!lastFailedDraft) return;

    saveOfflineDraft({
      moduleType: "health_record",
      formData: lastFailedDraft,
    });
    setConnectionIssue(null);
    setNoticeModal({
      title: "Draft Saved Locally",
      message:
        "This health record was saved only on this device. Review and submit it manually once the connection is stable.",
    });
  }

  async function handleRetryFailedHealthRecord() {
    if (!lastFailedDraft || saving) return;
    setSaving(true);
    try {
      const { savedRecord, savedId } = await saveHealthRecord(lastFailedDraft);
      const savedRecordId =
        savedId ||
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id ||
        recordId ||
        "";
      setConnectionIssue(null);
      setCareDecisionStep(false);
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: normalizePatientStatus(
          savedRecord?.followUpStatus ||
            savedRecord?.status ||
            lastFailedDraft.followUpStatus,
        ),
        needsReferral: lastFailedDraft.needs_referral === true,
        isFollowUp,
        isEditingRecord,
      });
    } catch (error) {
      console.error("Failed to retry health record save:", error);
      setConnectionIssue({
        title: error?.isTimeout ? "Request Timed Out" : "Connection Lost",
        message:
          error?.message ||
          "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    closeDateTimePopovers();

    const isReferralContinuation =
      needsReferral && userRole === "bhc" && !isFollowUp && !isEditingRecord;

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

    if (!isFollowUp && effectiveHealthRecordType === "Maternal" && selectedPatientIsMale) {
      setNoticeModal({
        title: "Invalid Classification",
        message:
          "Maternal records cannot be created for a patient recorded as male. Please choose another classification.",
      });
      return;
    }

    if (
      !isFollowUp &&
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
      !isFollowUp &&
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
    const finalNeedsReferral = !isFollowUp && Boolean(needsReferral);
    const effectiveFollowUpDate = finalNeedsReferral
      ? ""
      : followUpDate || immunizationNextScheduleDate || "";

    if (
      effectiveHealthRecordType === "Immunization" &&
      !finalNeedsReferral &&
      !followUpDate &&
      immunizationNextScheduleDate
    ) {
      setFollowUpDate(immunizationNextScheduleDate);
    }

    const finalChiefComplaint =
      isFollowUp && !chiefComplaint
        ? `Follow-up visit: ${
            followUpRecord?.chiefComplaint || "Return consultation"
          }`
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

    const finalPatientStatus = isFollowUp
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
      patientName: isFollowUp
        ? followUpPatientName
        : getPatientName(selectedPatient),
      category: effectiveHealthRecordType,
      recordType: effectiveHealthRecordType,
      patientClassification: effectiveHealthRecordType,
      visitType,
      visit_type: visitType,
      parentHealthRecordId: isFollowUp ? recordId : null,
      parent_health_record_id: isFollowUp ? recordId : null,
      previousRecordId: isFollowUp ? recordId : "",
      dateOfVisit,
      timeOfVisit,
      chiefComplaint: finalChiefComplaint,
      summaryOfPresentIllness,
      diagnosis,
      vitalSigns: consultationVitalSigns,
      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      temperature: temp || null,
      pulseRate: pulse || null,
      respiratoryRate: respiratoryRate || null,
      respiratory_rate: respiratoryRate || null,
      weight: weight || null,
      height: height || null,
      medication:
        effectiveHealthRecordType === "Maternal"
          ? recordMaternalData.treatment || medication
          : effectiveHealthRecordType === "Hypertension / Diabetic Monitoring"
            ? recordHypertensionDiabeticData.treatmentActionTaken || medication
          : medication,
      attendingStaff,
      consultationNotes,
      followUpStatus: finalPatientStatus,
      followUpDate: effectiveFollowUpDate,
      monitoringNotes,
      patientCondition:
        isFollowUp || effectiveFollowUpDate ? patientCondition : "",
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
      monitoringData: {
        hypertensionDiabeticData:
          effectiveHealthRecordType === "Hypertension / Diabetic Monitoring"
            ? recordHypertensionDiabeticData
            : null,
      },
      createdByRole: userRole,
      linkedTrackingId: isFollowUp ? followUpRecord?.linkedTrackingId || "" : "",
      dispensedMedicines: isEditingRecord ? [] : dispensedMedicines,
    };

    if (isReferralContinuation) {
      setPendingReferralDraft({
        formData,
        savedHealthRecordId: "",
        savedRecord: null,
      });
      setReferralForm((prev) => ({
        ...prev,
        receivingFacility:
          prev.receivingFacility || getReceivingFacilityName(currentUser),
        urgencyLevel: prev.urgencyLevel || "Non-urgent",
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
      setReferralDetailsStep(true);
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
      return;
    }

    setSaving(true);

    try {
      const { savedRecord, savedId } = await saveHealthRecord(formData);
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
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: savedStatus,
        needsReferral: formData.needs_referral === true,
        isFollowUp,
        isEditingRecord,
      });
    } catch (error) {
      console.error("Failed to save record:", error);
      if (error?.status === 422 && error?.errors) {
        const backendErrors = Object.fromEntries(
          Object.entries(error.errors).map(([field, messages]) => [
            field,
            Array.isArray(messages) ? messages[0] : String(messages),
          ]),
        );
        if (setValidationErrorsAndFocus(backendErrors)) return;
      }
      if (isConnectionError(error)) {
        setLastFailedDraft(formData);
        setConnectionIssue({
          title: error?.isTimeout ? "Request Timed Out" : "Connection Lost",
          message:
            error?.message ||
            "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
        });
        return;
      }
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

  async function handleSubmitReferralDetails(event) {
    event.preventDefault();
    closeDateTimePopovers();

    const referralErrors = getReferralValidationErrors();
    if (setReferralErrorsAndFocus(referralErrors)) return;

    if (!pendingReferralDraft?.formData) {
      setReferralDetailsStep(false);
      setNoticeModal({
        title: "Health Record Draft Missing",
        message:
          "The health record draft is no longer available. Please review the health record form again.",
      });
      return;
    }

    setSaving(true);
    let savedRecordId =
      pendingReferralDraft.savedHealthRecordId ||
      pendingReferralDraft.savedRecord?.id ||
      pendingReferralDraft.savedRecord?._id ||
      "";
    let savedRecord = pendingReferralDraft.savedRecord || null;
    const referralDraftMedicines = pendingReferralDraft.formData.dispensedMedicines || [];

    try {
      if (!savedRecordId) {
        const result = await saveHealthRecord({
          ...pendingReferralDraft.formData,
          dispensedMedicines: [],
        });
        savedRecord = result.savedRecord;
        savedRecordId =
          result.savedId ||
          savedRecord?.id ||
          savedRecord?._id ||
          savedRecord?.data?.id ||
          savedRecord?.data?._id ||
          "";

        setPendingReferralDraft((prev) => ({
          ...(prev || {}),
          savedHealthRecordId: savedRecordId,
          savedRecord,
        }));
      }

      if (!savedRecordId) {
        throw new Error("Saved health record ID was not returned.");
      }

      const referralUrgency =
        referralForm.urgencyLevel === "Urgent" ? "Urgent" : "Normal";
      const preferredDoctorNote = String(
        referralForm.preferredDoctor || "",
      ).trim();
      const referralRemarks = [
        referralForm.clinicalSummary,
        preferredDoctorNote
          ? `Preferred Doctor: ${preferredDoctorNote}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const referral = await createReferral({
        patientId: selectedPatientId,
        patientName: getPatientName(selectedPatient),
        healthRecordId: savedRecordId,
        recordId: savedRecordId,
        barangayHealthCenterId: currentUser?.barangayHealthCenterId || "",
        ruralHealthUnitId: currentUser?.ruralHealthUnitId || "",
        receivingFacility:
          referralForm.receivingFacility || getReceivingFacilityName(currentUser),
        referralCategory: pendingReferralDraft.formData.category,
        category: pendingReferralDraft.formData.category,
        urgencyLevel: referralUrgency,
        priority: referralUrgency,
        reasonForReferral: referralForm.reasonForReferral,
        chiefComplaint:
          referralForm.chiefComplaint || pendingReferralDraft.formData.chiefComplaint,
        diagnosis:
          referralForm.initialDiagnosis || pendingReferralDraft.formData.diagnosis,
        initialDiagnosis:
          referralForm.initialDiagnosis || pendingReferralDraft.formData.diagnosis,
        initialActionsTaken:
          referralForm.initialActionsTaken ||
          pendingReferralDraft.formData.medication,
        referringPractitioner:
          referralForm.referringPractitioner ||
          pendingReferralDraft.formData.attendingStaff,
        referralDate: referralForm.dateOfReferral,
        referralTime: referralForm.timeOfReferral,
        referringHci: referralForm.referringHci,
        philHealthNumber:
          referralForm.philHealthNumber ||
          getPatientPhilHealthNumber(selectedPatient),
        philHealthCategory:
          referralForm.philHealthCategory ||
          getPatientPhilHealthCategory(selectedPatient),
        birthDate: getPatientBirthDate(selectedPatient),
        patientAddress: getPatientAddress(selectedPatient),
        ageSex: getPatientAgeSexCivilStatus(selectedPatient),
        preferredRhuDoctorName: preferredDoctorNote,
        preferredDoctor: preferredDoctorNote,
        summaryOfPresentIllness: referralForm.clinicalSummary,
        remarks: referralRemarks || null,
      });

      if (referral?.trackingId) {
        try {
          await healthRecordService.updateHealthRecordById(
            savedRecordId,
            {
              linkedTrackingId: referral.trackingId,
              referralTrackingId: referral.trackingId,
            },
            "bhc",
          );
        } catch (linkError) {
          console.warn("Referral submitted, but record link update failed:", linkError);
        }
      }

      if (referralDraftMedicines.length > 0) {
        savedRecord = await healthRecordService.dispenseHealthRecordMedicines(
          savedRecordId,
          referralDraftMedicines,
        );
        await refreshRhuMedicines();
      }

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

      setReferralDetailsStep(false);
      setPendingReferralDraft(null);
      setCareDecisionStep(false);
      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: normalizePatientStatus(
          savedRecord?.followUpStatus ||
            savedRecord?.status ||
            pendingReferralDraft.formData.followUpStatus,
        ),
        needsReferral: true,
        referralSubmitted: true,
        referralTrackingId: referral?.trackingId || "",
        isFollowUp,
        isEditingRecord,
      });
    } catch (error) {
      console.error("Failed to submit health record referral:", error);
      if (isConnectionError(error)) {
        setLastFailedDraft(pendingReferralDraft.formData);
        setConnectionIssue({
          title: error?.isTimeout ? "Request Timed Out" : "Connection Lost",
          message:
            error?.message ||
            "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
        });
        return;
      }
      setNoticeModal({
        title: savedRecordId ? "Referral Submission Failed" : "Save Failed",
        message:
          error?.message ||
          (savedRecordId
            ? "The health record was saved, but the referral could not be submitted. Please try again."
            : "Unable to save the health record before submitting the referral. Please review the form and try again."),
      });
    } finally {
      setSaving(false);
    }
  }

  const isPrimaryActionLoading = saving;
  const primaryActionLabel = saving
    ? "Saving health record..."
    : isFollowUp
      ? "Save Follow-up Visit"
      : needsReferral && userRole === "bhc" && !isEditingRecord
        ? "Continue to Referral Details"
      : "Save Health Record";
  const pageStepLabel = null;
  const pageTitle = isFollowUp
    ? "Follow-up Visit"
    : isEditingRecord
      ? "Edit Health Record"
      : referralDetailsStep
        ? "Referral Details"
      : "Add Health Record";
  const pageSubtitle = isFollowUp
    ? "Record the patient's return visit and update the follow-up schedule if needed."
    : isEditingRecord
      ? "Correct or update details in this existing health record."
      : referralDetailsStep
        ? "Complete the referral details before submitting this health record and referral."
      : setupComplete
          ? "Complete the clinical details for this visit."
          : "Search patient and choose the record type before recording a visit.";
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
        ? "Write the monitoring plan or reason for follow-up..."
        : "Write monitoring notes if useful...";

  function handleStepBack() {
    closeDateTimePopovers();
    if (referralDetailsStep) {
      setReferralDetailsStep(false);
      return;
    }

    if (careDecisionStep && usesCareDecisionStep) {
      setCareDecisionStep(false);
      return;
    }

    if (setupComplete && !isFollowUp && !isEditingRecord) {
      setSetupComplete(false);
      setCareDecisionStep(false);
      setDropdownOpen(false);
      return;
    }

    navigate(healthRecordsPath);
  }

  return (
    <DashboardLayout role={userRole} title={isFollowUp ? "Follow-up Visit" : "Add Health Record"}>
      <style>{keyframes}</style>

      <div
         className="anim-fade-up mb-3 ml-0 mr-auto w-full max-w-7xl"
        style={stagger(0)}
      >
        <button
          type="button"
          onClick={handleStepBack}
          className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="px-1 py-2">
          {pageStepLabel && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#B91C1C]">
              {pageStepLabel}
            </p>
          )}
          <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
            {pageTitle}
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
            {pageSubtitle}
          </p>
          {isFollowUp && (selectedPatient || followUpRecord) && (
            <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
              This visit is linked to the original follow-up schedule.
            </p>
          )}
        </div>
      </div>

      {!isFollowUp && !isEditingRecord && !setupComplete ? (
        <HealthRecordSetupStep
          selectedPatientId={selectedPatientId}
          selectedPatient={selectedPatient}
          patientSearchProps={{
            inputRef,
            dropdownRef,
            disabled: false,
            dropdownOpen,
            selectedPatientId,
            searchTerm,
            inputValue: patientSearchInputValue,
            patients: filteredPatients,
            totalPatientCount: patients.length,
            matchingPatientCount: matchingPatients.length,
            visibleLimit: visiblePatientLimit,
            loading: patientsLoading && patients.length === 0,
            isSearching: Boolean(normalizedSearch),
            onSeeAll: () => navigate("/bhc/patients"),
            highlightIndex,
            onSearchChange: handlePatientSearchChange,
            onOpen: () => {
              setSearchTerm("");
              setDropdownOpen(true);
            },
            onClear: clearSelectedPatient,
            onSelect: selectPatient,
            onHighlight: setHighlightIndex,
          }}
          classification={healthRecordType}
          onClassificationSelect={handleClassificationSelect}
          errors={validationErrors}
          onProceed={handleProceedFromSetup}
        />
      ) : (
      <>
      {referralDetailsStep ? (
      <ReferralDetailsStep
        form={referralForm}
        errors={referralValidationErrors}
        saving={saving}
        onChange={handleReferralFormChange}
        onSubmit={handleSubmitReferralDetails}
      />
      ) : careDecisionStep && usesCareDecisionStep ? (
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
        onSubmit={handleSave}
        noValidate
        className="relative ml-0 mr-auto w-full max-w-7xl"
      >
        <div className="space-y-5 rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
        <FormSection
          title="Visit Overview"
          subtitle="Confirm the visit schedule and attending practitioner."
          delay={2}
        >
          <LockedFormContent locked={patientGateLocked}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DatePickerField
              label="Date of Visit"
              required
              name="dateOfVisit"
              error={validationErrors.dateOfVisit}
              value={dateOfVisit}
              onChange={(value) => {
                clearValidationError("dateOfVisit");
                setDateOfVisit(value);
              }}
            />
            <TimePickerField
              label="Time of Visit"
              required
              name="timeOfVisit"
              error={validationErrors.timeOfVisit}
              value={timeOfVisit}
              onChange={(value) => {
                clearValidationError("timeOfVisit");
                setTimeOfVisit(value);
              }}
            />
            <FieldInput
              label="Name of Practitioner"
              required
              name="attendingStaff"
              value={attendingStaff}
              error={validationErrors.attendingStaff}
              readOnly
            />
          </div>
          {showMaternalPatientWarning && <MaternalClassificationWarning />}
          </LockedFormContent>
        </FormSection>

        {isGeneralConsultationFollowUp && (
          <>
            <FormSection
              title="Follow-up Assessment"
              subtitle="Record the patient's condition and findings during this return visit."
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
                  label="Updated Diagnosis"
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
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
            </FormSection>

            <FormSection
              title="Vital Signs"
              subtitle="Record updated physiological measurements for this follow-up visit."
              delay={4}
            >
              <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(5,minmax(0,1fr))]">
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
                  label="Pulse Rate"
                  placeholder="e.g. 72 bpm"
                  value={pulse}
                  onChange={(event) => setPulse(event.target.value)}
                />
                <FieldInput
                  label="Respiratory Rate"
                  placeholder="e.g. 18 cpm"
                  value={respiratoryRate}
                  onChange={(event) => setRespiratoryRate(event.target.value)}
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
                  label="Action Taken"
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
            </FormSection>

            <FormSection
              title="Outcome"
              subtitle="Set the new record status after this follow-up visit."
              delay={6}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldSelect
                  label="New Health Record Status"
                  value={followUpStatus}
                  onChange={(event) =>
                    handlePatientStatusChange(event.target.value)
                  }
                >
                  <option>Routine Monitoring</option>
                  <option>Follow-up Required</option>
                  <option>Completed</option>
                </FieldSelect>
                {showFollowUpMonitoringFields && (
                  <FieldInput
                    label="Next Follow-up Date"
                    type="date"
                    value={followUpDate}
                    onChange={(event) => setFollowUpDate(event.target.value)}
                    required
                  />
                )}
              </div>
              <div className="mt-4">
                <FieldTextarea
                  label={monitoringNotesLabel}
                  value={monitoringNotes}
                  onChange={(event) => setMonitoringNotes(event.target.value)}
                  placeholder={monitoringNotesPlaceholder}
                  rows={3}
                />
              </div>
            </FormSection>
          </>
        )}

        {!patientGateLocked && isImmunization && (
          <FormSection
            title="EPI Vaccines Given"
            subtitle="Select the EPI vaccines given during this visit."
            delay={2}
          >

          <ImmunizationVisitFields
            entries={immunizationVaccineEntries}
            dateOfVisit={dateOfVisit}
            temperature={temp}
            weight={weight}
            height={height}
            breastfeedingMonitoring={immunizationData.breastfeedingMonitoring}
            consultationNotes={consultationNotes}
            errors={validationErrors}
            onTemperatureChange={setTemp}
            onWeightChange={setWeight}
            onHeightChange={setHeight}
              onBreastfeedingChange={handleBreastfeedingChange}
              onEntryChange={handleVaccineEntryChange}
              onToggleVaccine={handleVaccineToggle}
              onNotesChange={setConsultationNotes}
            />
          </FormSection>
        )}

        {!patientGateLocked && !usesCareDecisionStep && isImmunization && (
          <FormSection
            title="Medicines / Supplies Dispensed"
            subtitle="Optional medicines or supplies given from BHC inventory."
            delay={3}
          >
            <DispensedMedicinesSection
              inventory={bhcMedicineInventory}
              value={dispensedMedicines}
              onChange={setDispensedMedicines}
              disabled={isEditingRecord}
            />
          </FormSection>
        )}

        {!patientGateLocked && !usesCareDecisionStep && isImmunization && (
          <FormSection
            title="Follow-up & Referral"
            subtitle="Schedule a return visit if needed and indicate if RHU referral is required."
            delay={4}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <FieldInput
                  label="Next Follow-up Date"
                  type="date"
                  value={followUpDate}
                  name="followUpDate"
                  error={validationErrors.followUpDate}
                  disabled={needsReferral}
                  onChange={(event) => {
                    clearValidationError("followUpDate");
                    setFollowUpDate(event.target.value);
                  }}
                />
              </div>
              <YesNoRadioGroup
                label="Needs RHU Referral?"
                name="needsReferral"
                value={needsReferral ? "Yes" : "No"}
                onChange={handleNeedsReferralChange}
              />
            </div>
          </FormSection>
        )}

        {!patientGateLocked && isMaternal && !selectedPatientIsMale && (
          <>
            {showMaternalPatientWarning && <MaternalClassificationWarning />}

            <FormSection
              title="Pregnancy Details"
              subtitle="Record pregnancy dating, OB score, and key measurements from the prenatal record."
              delay={3}
              accent="pink"
            >
              <div className="space-y-5">
                <ClinicalFieldGroup title="Pregnancy Dating" accent="pink">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <FieldInput
                      label="LMP"
                      type="date"
                      value={maternalData.lmp}
                      onChange={(event) =>
                        handleMaternalChange("lmp", event.target.value)
                      }
                    />
                    <FieldInput
                      label="PMP"
                      type="date"
                      value={maternalData.pmp}
                      onChange={(event) =>
                        handleMaternalChange("pmp", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Cycle Duration"
                      type="number"
                      placeholder="e.g. 28"
                      value={maternalData.cycleDuration}
                      onChange={(event) =>
                        handleMaternalChange("cycleDuration", event.target.value)
                      }
                    />
                    <FieldInput
                      label="EDC / Expected Delivery Date"
                      value={expectedDeliveryDate || "Calculating..."}
                      readOnly
                    />
                    <FieldInput
                      label="AOG"
                      value={aog || "Calculating..."}
                      readOnly
                    />
                  </div>
                </ClinicalFieldGroup>

                <ClinicalFieldGroup title="OB Score / TPAL" accent="pink">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
                    <FieldInput
                      label="Gravida"
                      type="number"
                      value={maternalData.gravida}
                      onChange={(event) =>
                        handleMaternalChange("gravida", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Para"
                      type="number"
                      value={maternalData.para}
                      onChange={(event) =>
                        handleMaternalChange("para", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Term"
                      type="number"
                      value={maternalData.term}
                      onChange={(event) =>
                        handleMaternalChange("term", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Preterm"
                      type="number"
                      value={maternalData.preterm}
                      onChange={(event) =>
                        handleMaternalChange("preterm", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Abortion"
                      type="number"
                      value={maternalData.abortion}
                      onChange={(event) =>
                        handleMaternalChange("abortion", event.target.value)
                      }
                    />
                    <FieldInput
                      label="Living"
                      type="number"
                      value={maternalData.living}
                      onChange={(event) =>
                        handleMaternalChange("living", event.target.value)
                      }
                    />
                    <FieldInput
                      label="TPAL Score"
                      value={maternalTpalScore}
                      readOnly
                    />
                  </div>
                </ClinicalFieldGroup>

                <ClinicalFieldGroup title="Measurements" accent="pink">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <BpInputGroup
                      systolic={systolicBp}
                      diastolic={diastolicBp}
                      onSystolicChange={setSystolicBp}
                      onDiastolicChange={setDiastolicBp}
                    />
                    <FieldInput
                      label="Weight"
                      type="number"
                      placeholder="e.g. 60"
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                    />
                    <FieldInput
                      label="Height / HGT"
                      type="number"
                      placeholder="e.g. 158 cm"
                      value={height}
                      onChange={(event) => setHeight(event.target.value)}
                    />
                    <FieldInput
                      label="BMI"
                      value={maternalData.bmi}
                      onChange={(event) =>
                        handleMaternalChange("bmi", event.target.value)
                      }
                      readOnly={Boolean(weight && height)}
                    />
                  </div>
                </ClinicalFieldGroup>
              </div>
            </FormSection>

            <FormSection
              title="Previous Pregnancy / Delivery History"
              subtitle="Record previous pregnancy and delivery history from the prenatal record."
              delay={4}
              accent="pink"
            >
              <PregnancyHistoryTable
                entries={maternalData.previousPregnancyHistory || []}
                onAdd={addPregnancyHistoryRow}
                onChange={updatePregnancyHistoryRow}
                onRemove={removePregnancyHistoryRow}
              />
            </FormSection>

<FormSection
  title="Chief Complaint & Treatment"
  subtitle="Record the current complaint, treatment, and any medicine or supply actually given."
  delay={5}
  accent="pink"
>
  <div className="grid gap-4 lg:grid-cols-3">
    <FieldInput
      label="Chief Complaint"
      placeholder="e.g. Routine prenatal check-up"
      name="chiefComplaint"
      error={validationErrors.chiefComplaint}
      value={chiefComplaint}
      onChange={(event) => {
        clearValidationError("chiefComplaint");
        setChiefComplaint(event.target.value);
      }}
      wrapperClassName="lg:col-span-3"
    />

    <FieldTextarea
      label="Treatment / Advice Given"
      value={maternalData.treatment}
      onChange={(event) => {
        handleMaternalChange("treatment", event.target.value);
        setMedication(event.target.value);
      }}
      rows={3}
      wrapperClassName="lg:col-span-3"
    />
  </div>

  <div className="mt-6 border-t border-[#E8ECF0] pt-5">
    <h3 className="text-sm font-bold text-pink-800">
      Medicines / Supplies Dispensed
    </h3>
    <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
      Optional: record medicines or supplies actually released from BHC inventory during this visit.
    </p>

    <div className="mt-4">
      <DispensedMedicinesSection
        inventory={bhcMedicineInventory}
        value={dispensedMedicines}
        onChange={setDispensedMedicines}
        disabled={isEditingRecord}
      />
    </div>
  </div>
</FormSection>

            <FormSection
              title="Medical History / Risk Codes"
              subtitle="Mark pregnancy risk codes and medical conditions from the prenatal record."
              delay={6}
              accent="pink"
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <CheckboxGroup
                  title="Pregnancy Risk Codes"
                  options={PREGNANCY_RISK_OPTIONS}
                  values={maternalData.riskAssessment}
                  onChange={(key, value) =>
                    handleNestedMaternalChange("riskAssessment", key, value)
                  }
                />
                <CheckboxGroup
                  title="Medical Conditions"
                  options={MEDICAL_HISTORY_OPTIONS}
                  values={maternalData.riskAssessment}
                  onChange={(key, value) =>
                    handleNestedMaternalChange("riskAssessment", key, value)
                  }
                />
              </div>
            </FormSection>

            <FormSection
              title="Previous FP Method Used"
              subtitle="Record the patient's previous family planning method, if any."
              delay={7}
              accent="pink"
            >
              <div className="grid gap-4 lg:grid-cols-2">
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
                  <option value="">Select method</option>
                  {FAMILY_PLANNING_PREVIOUS_METHODS.map((method) => (
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
            </FormSection>

            <FormSection
              title="Laboratory Results"
              subtitle="Optional laboratory results recorded for this prenatal visit."
              delay={8}
              accent="pink"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {LABORATORY_RESULT_FIELDS.map((field) => (
                  <FieldInput
                    key={field.key}
                    label={field.label}
                    value={maternalData.laboratoryResults?.[field.key] || ""}
                    onChange={(event) =>
                      handleNestedMaternalChange(
                        "laboratoryResults",
                        field.key,
                        event.target.value,
                      )
                    }
                  />
                ))}
              </div>
            </FormSection>

            <FormSection
              title="Tetanus Toxoid Status"
              subtitle="Record tetanus toxoid dates if available."
              delay={9}
              accent="pink"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {TETANUS_TOXOID_FIELDS.map((field) => (
                  <FieldInput
                    key={field.key}
                    label={field.label}
                    type="date"
                    value={maternalData.tetanusToxoidStatus?.[field.key] || ""}
                    onChange={(event) =>
                      handleNestedMaternalChange(
                        "tetanusToxoidStatus",
                        field.key,
                        event.target.value,
                      )
                    }
                  />
                ))}
              </div>
            </FormSection>

            <FormSection
              title="Ultrasound Result"
              subtitle="Optional ultrasound result for this prenatal visit."
              delay={10}
              accent="pink"
            >
              <div className="grid gap-4 lg:grid-cols-[1.5fr_0.75fr]">
                <FieldTextarea
                  label="Ultrasound Result"
                  value={maternalData.ultrasound?.result || ""}
                  onChange={(event) =>
                    handleNestedMaternalChange(
                      "ultrasound",
                      "result",
                      event.target.value,
                    )
                  }
                  rows={3}
                />
                <FieldInput
                  label="Date Done"
                  type="date"
                  value={maternalData.ultrasound?.dateDone || ""}
                  onChange={(event) =>
                    handleNestedMaternalChange(
                      "ultrasound",
                      "dateDone",
                      event.target.value,
                    )
                  }
                />
              </div>
            </FormSection>

            <FormSection
              title="Follow-up & Referral"
              subtitle="Schedule a return visit if needed and indicate if RHU referral is required."
              delay={12}
              accent="pink"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <FieldInput
                    label="Next Follow-up Date"
                    type="date"
                    value={followUpDate}
                    name="followUpDate"
                    error={validationErrors.followUpDate}
                    disabled={needsReferral}
                    onChange={(event) => {
                      clearValidationError("followUpDate");
                      setFollowUpDate(event.target.value);
                    }}
                  />
                </div>
                <YesNoRadioGroup
                  label="Needs RHU Referral?"
                  name="needsReferral"
                  value={needsReferral ? "Yes" : "No"}
                  onChange={handleNeedsReferralChange}
                />
              </div>
            </FormSection>
          </>
        )}

        {!patientGateLocked && isFamilyPlanning && (
          <FormSection
            title="Family Planning Details"
            subtitle="Record the family planning service type, method, source, schedule, and action taken."
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
              <div className="grid gap-4 lg:grid-cols-3">
                <FieldSelect
                  label="Client Type"
                  value={familyPlanningData.clientType}
                  onChange={(event) =>
                    handleFamilyPlanningChange("clientType", event.target.value)
                  }
                >
                  <option value="">Select client type</option>
                  {FAMILY_PLANNING_CLIENT_TYPES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>
                <FieldSelect
                  label="Method Used / Accepted"
                  value={familyPlanningData.methodUsed}
                  onChange={(event) =>
                    handleFamilyPlanningChange("methodUsed", event.target.value)
                  }
                >
                  <option value="">Select method</option>
                  {FAMILY_PLANNING_METHODS.map((option) => (
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
                  <option value="">Select previous method</option>
                  {FAMILY_PLANNING_PREVIOUS_METHODS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>
                <FieldSelect
                  label="FP Visit Type"
                  value={familyPlanningData.fpVisitType}
                  onChange={(event) =>
                    handleFamilyPlanningChange("fpVisitType", event.target.value)
                  }
                >
                  <option value="">Select visit type</option>
                  {FAMILY_PLANNING_VISIT_TYPES.map((option) => (
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
                  <option value="">Select source</option>
                  {FAMILY_PLANNING_SOURCES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </FieldSelect>
                <DatePickerField
                  label="Date Registered / Date of Visit"
                  value={familyPlanningData.dateRegistered || dateOfVisit}
                  onChange={(value) => {
                    handleFamilyPlanningChange("dateRegistered", value);
                    handleFamilyPlanningChange("dateOfVisit", value);
                  }}
                />
                <DatePickerField
                  label="Next Appointment Date"
                  value={familyPlanningData.nextAppointmentDate}
                  onChange={(value) =>
                    handleFamilyPlanningChange("nextAppointmentDate", value)
                  }
                />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <FieldTextarea
                  label="Remarks"
                  value={familyPlanningData.remarks}
                  onChange={(event) =>
                    handleFamilyPlanningChange("remarks", event.target.value)
                  }
                  placeholder="Brief administrative notes for this family planning visit..."
                  rows={3}
                />
                <FieldTextarea
                  label="Action Taken"
                  value={familyPlanningData.actionTaken}
                  onChange={(event) =>
                    handleFamilyPlanningChange("actionTaken", event.target.value)
                  }
                  placeholder="Record counseling, method provision, advice, or next action..."
                  rows={3}
                />
              </div>
              <div className="mt-4">
                <YesNoRadioGroup
                  label="Has complaint, side-effect, or clinical concern?"
                  name="familyPlanningConcernToggle"
                  value={familyPlanningData.hasClinicalConcern}
                  onChange={(value) =>
                    handleFamilyPlanningChange("hasClinicalConcern", value)
                  }
                />
              </div>
              {(familyPlanningData.hasClinicalConcern === "Yes" ||
                familyPlanningData.fpVisitType === "Side-effect Concern") && (
                <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/30 p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                    Clinical Concern / Side-effect Notes
                  </p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <FieldInput
                      label="Concern / Complaint"
                      name="familyPlanningConcern"
                      error={validationErrors.familyPlanningConcern}
                      value={familyPlanningData.concern}
                      onChange={(event) => {
                        clearValidationError("familyPlanningConcern");
                        handleFamilyPlanningChange("concern", event.target.value);
                      }}
                      required
                    />
                    <FieldInput
                      label="Advice Given"
                      value={familyPlanningData.adviceGiven}
                      onChange={(event) =>
                        handleFamilyPlanningChange("adviceGiven", event.target.value)
                      }
                    />
                    <div className="lg:col-span-2">
                      <FieldTextarea
                        label="Findings / Notes"
                        value={familyPlanningData.findings}
                        onChange={(event) =>
                          handleFamilyPlanningChange("findings", event.target.value)
                        }
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              )}
            </LockedFormContent>
          </FormSection>
        )}

        {!patientGateLocked && isFamilyPlanning && (
          <FormSection
            title="Medicines / Supplies Dispensed"
            subtitle="Optional medicines, supplies, or FP commodities given from BHC inventory."
            delay={4}
          >
            <DispensedMedicinesSection
              inventory={bhcMedicineInventory}
              value={dispensedMedicines}
              onChange={setDispensedMedicines}
              disabled={isEditingRecord}
            />
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
                onChange={setDispensedMedicines}
                disabled={isEditingRecord}
              />
            </FormSection>

            <FormSection
              title="Follow-up & Referral"
              subtitle="Schedule a return visit if needed and indicate if RHU referral is required."
              delay={6}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <FieldInput
                    label="Next Follow-up Date"
                    type="date"
                    value={followUpDate}
                    name="followUpDate"
                    error={validationErrors.followUpDate}
                    disabled={needsReferral}
                    onChange={(event) => {
                      clearValidationError("followUpDate");
                      setFollowUpDate(event.target.value);
                    }}
                  />
                </div>
                <YesNoRadioGroup
                  label="Needs RHU Referral?"
                  name="needsReferral"
                  value={needsReferral ? "Yes" : "No"}
                  onChange={handleNeedsReferralChange}
                />
              </div>
            </FormSection>
          </>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <FormSection
            title="Vital Signs"
            subtitle="Record the patient's physiological measurements."
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
              <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
                <BpInputGroup
                  systolic={systolicBp}
                  diastolic={diastolicBp}
                  onSystolicChange={setSystolicBp}
                  onDiastolicChange={setDiastolicBp}
                />
                <FieldInput
                  label="Temperature"
                  placeholder="e.g. 36.5 C"
                  value={temp}
                  onChange={(event) => setTemp(event.target.value)}
                />
                <FieldInput
                  label="Pulse Rate"
                  placeholder="e.g. 72 bpm"
                  value={pulse}
                  onChange={(event) => setPulse(event.target.value)}
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
            </LockedFormContent>
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <FormSection
            title="Consultation Information"
            subtitle="Record the complaint, assessment findings, diagnosis, and treatment."
            delay={4}
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
                  rows={5}
                />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <FieldInput
                  label="Diagnosis / Assessment"
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  placeholder="Initial diagnosis"
                />
                <FieldInput
                  label="Treatment / Action Taken"
                  value={medication}
                  onChange={(event) => setMedication(event.target.value)}
                />
              </div>
            </LockedFormContent>
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <FormSection
            title="Morbidity / Notifiable Disease Record"
            subtitle="Choose whether this visit should appear in the morbidity or notifiable diseases daily log."
            delay={5}
          >
            <LockedFormContent locked={patientGateLocked}>
              <MorbidityNotifiableReportingSection
                value={morbidityReportingStatus}
                onChange={setMorbidityReportingStatus}
              />
            </LockedFormContent>
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <FormSection
            title="Community-Based Surveillance"
            subtitle="Decide whether this visit should be included in the HFMD surveillance list."
            delay={6}
          >
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
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <FormSection
            title="Medicines / Supplies Dispensed"
            subtitle="Optional medicines or supplies given from BHC inventory."
            delay={7}
          >
            <LockedFormContent locked={patientGateLocked}>
              <DispensedMedicinesSection
                inventory={bhcMedicineInventory}
                value={dispensedMedicines}
                onChange={setDispensedMedicines}
                disabled={isEditingRecord}
              />
            </LockedFormContent>
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && !isMaternal && !isHypertensionDiabetic && (
          <>
            {!usesCareDecisionStep && (
              <FormSection
                title="Follow-up & Referral"
                subtitle="Schedule a return visit if needed and indicate if RHU referral is required."
                delay={8}
              >
                <LockedFormContent locked={patientGateLocked}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <FieldInput
                        label="Next Follow-up Date"
                        type="date"
                        value={followUpDate}
                        name="followUpDate"
                        error={validationErrors.followUpDate}
                        disabled={needsReferral}
                        onChange={(event) => {
                          clearValidationError("followUpDate");
                          setFollowUpDate(event.target.value);
                        }}
                      />
                    </div>
                    <YesNoRadioGroup
                      label="Needs RHU Referral?"
                      name="needsReferral"
                      value={needsReferral ? "Yes" : "No"}
                      onChange={handleNeedsReferralChange}
                    />
                  </div>
                  {morbidityReportingStatus === "notifiable" && (
                    <p className="mt-3 text-xs leading-relaxed text-[#64748B]">
                      Notifiable or surveillance cases may require RHU
                      coordination and follow-up depending on health center
                      protocol.
                    </p>
                  )}
                </LockedFormContent>
              </FormSection>
            )}

          </>
        )}

        <div
          className="anim-fade-up flex items-center justify-end gap-3 pt-1 pb-4"
          style={stagger(7)}
        >
          {!usesCareDecisionStep && (
            <button
              type="button"
              onClick={() => navigate(healthRecordsPath)}
              className="rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPrimaryActionLoading}
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isPrimaryActionLoading ? (
              <ButtonSpinner />
            ) : (
              <Save
                size={15}
                className="transition-transform duration-300 group-hover:scale-110"
              />
            )}
            {primaryActionLabel}
          </button>
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
            : "Health Record Saved Successfully"
        }
        description={
          saveSuccess?.isFollowUp
            ? "The follow-up visit has been saved and linked to the original health record."
            : saveSuccess?.referralSubmitted
              ? "The health record was saved and the referral was linked for RHU review."
              : "Health record saved successfully."
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
          {
            label: "Add Another Record",
            onClick: () => {
              setSaveSuccess(null);
              setReferralDetailsStep(false);
              setPendingReferralDraft(null);
              setReferralValidationErrors({});
              setSetupComplete(false);
              setHealthRecordType("");
              setSelectedPatientId("");
            },
          },
        ]}
      />

      {noticeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-5 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl">
            <div className="h-1 bg-[#B91C1C]" />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
                  <AlertCircle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {noticeModal.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {noticeModal.message}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => { const onClose = noticeModal.onClose; setNoticeModal(null); onClose?.(); }}
                  className="rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
                >{noticeModal.buttonLabel || "OK"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConnectionIssueModal
        open={Boolean(connectionIssue)}
        title={connectionIssue?.title}
        message={connectionIssue?.message}
        retryDisabled={
          saving || (typeof navigator !== "undefined" && navigator.onLine === false)
        }
        onContinue={() => setConnectionIssue(null)}
        onSaveDraft={handleSaveHealthRecordDraft}
        onRetry={handleRetryFailedHealthRecord}
      />
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PATIENT SEARCH DROPDOWN
   ═══════════════════════════════════════════════════════════════ */
function HealthRecordSetupStep({
  selectedPatientId,
  selectedPatient,
  patientSearchProps,
  classification,
  onClassificationSelect,
  errors = {},
  onProceed,
}) {
  const normalizedClassification = normalizeRecordType(classification);
  const canProceed = Boolean(selectedPatientId && normalizedClassification);

  return (
    <section
      className="anim-fade-up ml-0 mr-auto w-full max-w-7xl"
      style={stagger(1)}
    >
      <div className=" p-1 ">
        <div
          className={`relative z-30 rounded-xl ${
            errors.selectedPatientId
              ? "border border-[#B91C1C] bg-[#FEF2F2]/40 p-3 ring-2 ring-[#B91C1C]/10"
              : ""
          }`}
          data-field="selectedPatientId"
          tabIndex={errors.selectedPatientId ? -1 : undefined}
        >
          <PatientSearchDropdown
            {...patientSearchProps}
            selectedPatient={selectedPatient}
            showSelectedPreview={false}
          />
          {errors.selectedPatientId && (
            <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">
              {errors.selectedPatientId}
            </p>
          )}
        </div>

        <div
          className="mt-5"
          data-field="healthRecordType"
          tabIndex={errors.healthRecordType ? -1 : undefined}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
            Select Service Type
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">
            Choose the health service to record for this patient.
          </p>

          <div className="mt-3">
            <ServiceCardGroup
              options={RECORD_TYPE_OPTIONS}
              normalizedClassification={normalizedClassification}
              onClassificationSelect={onClassificationSelect}
              cardGridClass="sm:grid-cols-2 xl:grid-cols-3"
            />
          </div>

          {errors.healthRecordType && (
            <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">
              {errors.healthRecordType}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[#94A3B8]">
              {canProceed
                ? "Ready to continue to the selected record form."
                : "Select a patient and record type to continue."}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onProceed}
              className="rounded-xl bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceCardGroup({
  title,
  helper,
  options,
  normalizedClassification,
  onClassificationSelect,
  cardGridClass = "sm:grid-cols-2 xl:grid-cols-3",
}) {
  return (
    <div>
      {title && (
        <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#0F172A]">{title}</h3>
            {helper && (
              <p className="text-[11px] leading-relaxed text-[#94A3B8]">
                {helper}
              </p>
            )}
          </div>
        </div>
      )}
      <div className={`grid gap-3 ${cardGridClass}`}>
        {options.map((option) => (
          <ClassificationCard
            key={option}
            option={option}
            selected={normalizedClassification === option}
            onSelect={() => onClassificationSelect(option)}
          />
        ))}
      </div>
    </div>
  );
}

function ClassificationCard({ option, selected, onSelect }) {
  const config = RECORD_TYPE_DETAILS[option] || {};
  const Icon = config.icon || Stethoscope;
  const comingSoon = Boolean(config.comingSoon);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-disabled={comingSoon}
      className={`group flex min-h-[124px] rounded-xl border p-3.5 text-left shadow-sm transition-all duration-200 ${
        selected
          ? "border-[#FCA5A5] bg-[#FEF2F2] shadow-[#B91C1C]/10 ring-2 ring-[#B91C1C]/10"
          : comingSoon
            ? "border-[#E8ECF0] bg-[#FAFBFC] opacity-85 hover:border-[#E2E8F0]"
            : "border-[#E8ECF0] bg-white hover:-translate-y-0.5 hover:border-[#FECACA] hover:shadow-md"
      }`}
    >
      <span
        className={`mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          selected
            ? "bg-[#B91C1C] text-white"
            : "bg-[#F8FAFC] text-[#64748B] group-hover:bg-red-50 group-hover:text-[#B91C1C]"
        }`}
      >
        <Icon size={16} />
      </span>
      <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[#0F172A]">
            {config.title || option}
          </span>
          <span className="mt-1 block text-[11.5px] leading-relaxed text-[#64748B]">
            {config.description}
          </span>
        </span>
        {selected && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B91C1C] text-white">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {comingSoon && (
          <span className="shrink-0 rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
            Coming soon
          </span>
        )}
      </span>
    </button>
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

function ReferralFormGroup({ title, description, children }) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[#1F2937]">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function ReferralDetailsStep({
  form,
  errors = {},
  saving,
  onChange,
  onSubmit,
}) {

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative ml-0 mr-auto w-full max-w-7xl"
    >
      <div className="space-y-5 rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <Stethoscope size={17} />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A1A1A]">
              Referral Details
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-[#6B7280]">
              Complete the referral form before submitting this health record
              and referral.
            </p>
          </div>
        </div>

        <div className="space-y-7">
          <ReferralFormGroup
            title="Referral Information"
            description="Referral timestamp and referring BHC details."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DatePickerField
                label="Date of Referral"
                required
                name="dateOfReferral"
                value={form.dateOfReferral}
                error={errors.dateOfReferral}
                onChange={(value) => onChange("dateOfReferral", value)}
              />
              <TimePickerField
                label="Time of Referral"
                required
                name="timeOfReferral"
                value={form.timeOfReferral}
                error={errors.timeOfReferral}
                onChange={(value) => onChange("timeOfReferral", value)}
              />
              <FieldInput
                label="Name of Referring HCI"
                required
                name="referringHci"
                value={form.referringHci}
                error={errors.referringHci}
                onChange={(event) => onChange("referringHci", event.target.value)}
                placeholder="Barangay Health Center"
                wrapperClassName="xl:col-span-2"
              />
              <FieldSelect
                label="Urgency"
                name="urgencyLevel"
                value={form.urgencyLevel}
                onChange={(event) => onChange("urgencyLevel", event.target.value)}
              >
                <option>Non-urgent</option>
                <option>Urgent</option>
              </FieldSelect>
              <FieldInput
                label="Preferred Doctor"
                name="preferredDoctor"
                value={form.preferredDoctor}
                onChange={(event) =>
                  onChange("preferredDoctor", event.target.value)
                }
                placeholder="Select or enter preferred doctor"
              />
              <FieldInput
                label="Name and Signature of Referring Practitioner"
                required
                name="referringPractitioner"
                value={form.referringPractitioner}
                error={errors.referringPractitioner}
                onChange={(event) =>
                  onChange("referringPractitioner", event.target.value)
                }
                placeholder="Referring practitioner"
                wrapperClassName="xl:col-span-2"
              />
            </div>
          </ReferralFormGroup>

          <ReferralFormGroup
            title="Clinical Referral Details"
            description="Clinical information to send to RHU for review."
          >
            <div className="space-y-4">
              <FieldInput
                label="Chief Complaint"
                name="chiefComplaint"
                value={form.chiefComplaint}
                error={errors.chiefComplaint}
                onChange={(event) =>
                  onChange("chiefComplaint", event.target.value)
                }
                placeholder="Chief complaint"
              />

              <FieldTextarea
                label="Summary of Present Illness and Physical Examination"
                name="clinicalSummary"
                value={form.clinicalSummary}
                onChange={(event) =>
                  onChange("clinicalSummary", event.target.value)
                }
                placeholder="Summarize relevant symptoms, findings, physical examination notes, or observations..."
                rows={5}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <FieldTextarea
                  label="Initial Diagnosis"
                  name="initialDiagnosis"
                  value={form.initialDiagnosis}
                  error={errors.initialDiagnosis}
                  onChange={(event) =>
                    onChange("initialDiagnosis", event.target.value)
                  }
                  placeholder="Initial diagnosis"
                  rows={3}
                />

                <FieldTextarea
                  label="Initial Actions Taken"
                  name="initialActionsTaken"
                  value={form.initialActionsTaken}
                  onChange={(event) =>
                    onChange("initialActionsTaken", event.target.value)
                  }
                  placeholder="Treatment, medication, advice, or action taken before referral"
                  rows={3}
                />
              </div>

              <FieldTextarea
                label="Reason for Referral"
                required
                name="reasonForReferral"
                value={form.reasonForReferral}
                error={errors.reasonForReferral}
                onChange={(event) =>
                  onChange("reasonForReferral", event.target.value)
                }
                placeholder="State the reason or concern requiring RHU review..."
                rows={3}
              />
            </div>
          </ReferralFormGroup>
        </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
      <button
        type="submit"
        disabled={saving}
        className="group flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {saving ? <ButtonSpinner /> : <Save size={15} />}
        {saving ? "Saving health record..." : "Save Health Record & Submit Referral"}
      </button>
    </div>
      </div>
    </form>
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
  isSearching,
  onSeeAll,
  highlightIndex,
  onSearchChange,
  onOpen,
  onClear,
  onSelect,
  onHighlight,
}) {
  return (
    <div className="relative z-[9999]">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        Search Existing Patient
      </label>

      <div className="relative" ref={inputRef}>
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
        />
        <input
          type="text"
          placeholder="Search patient name, ID, contact, or barangay..."
          value={inputValue}
          onChange={onSearchChange}
          onFocus={onOpen}
          disabled={disabled}
          readOnly={disabled}
          className={`h-10 w-full rounded-xl border bg-[#FAFBFC] pl-10 pr-10 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] ${
            dropdownOpen
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

      {dropdownOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="anim-drop-in absolute left-0 right-0 top-full z-[9999] mt-1.5 overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-xl shadow-black/[0.08]"
        >
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {loading
                ? "Loading"
                : `${matchingPatientCount} result${matchingPatientCount !== 1 ? "s" : ""}`}
            </p>
            {searchTerm && (
              <span className="max-w-[220px] truncate text-[10px] text-[#BFBFBF]">
                Searching: {searchTerm}
              </span>
            )}
          </div>

          {loading ? (
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
            <div className="max-h-80 overflow-y-auto py-1">
              {patients.map((patient, index) => {
                const display = getPatientDisplay(patient);
                const isSelected = patient.id === selectedPatientId;
                const isHighlighted = index === highlightIndex;

                return (
                  <button
                    key={patient.id}
                    type="button"
                    onMouseEnter={() => onHighlight(index)}
                    onClick={() => onSelect(patient.id)}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors duration-100 ${
                      isHighlighted
                        ? "bg-[#FEF2F2]"
                        : isSelected
                          ? "bg-red-50"
                          : "hover:bg-[#FAFBFC]"
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
                      <p className="mt-0.5 truncate text-[10px] text-[#9CA3AF]">
                        {[
                          display.age,
                          display.contact || display.barangay,
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
      className="anim-fade-up space-y-4 pb-6"
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

function ClinicalFieldGroup({ title, children, accent }) {
  const titleClass = accent === "pink" ? "text-pink-700" : "text-[#B91C1C]";

  return (
    <div className="border-t border-[#E8ECF0] pt-4">
      <p className={`mb-3 text-[10px] font-bold uppercase tracking-widest ${titleClass}`}>
        {title}
      </p>
      {children}
    </div>
  );
}

function CheckboxGroup({ title, options, values = {}, onChange }) {
  return (
    <div className="border-t border-[#E8ECF0] pt-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-pink-700">
        {title}
      </p>
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            key={option.key}
            className="flex cursor-pointer items-start gap-2.5 py-1 text-sm font-medium text-[#475569]"
          >
            <input
              type="checkbox"
              checked={Boolean(values?.[option.key])}
              onChange={(event) => onChange(option.key, event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] accent-[#B91C1C]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PregnancyHistoryTable({ entries, onAdd, onChange, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="hidden grid-cols-[0.75fr_1.5fr_0.75fr_1.5fr_44px] gap-3 border-b border-[#EEF2F6] bg-[#F8FAFC] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B] md:grid">
          <span>Pregnancy No.</span>
          <span>Place of Delivery</span>
          <span>Year</span>
          <span>Notes</span>
          <span />
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[#64748B]">
            No previous pregnancy history added.
          </div>
        ) : (
          <div className="divide-y divide-[#EEF2F6]">
            {entries.map((entry, index) => (
              <div
                key={`${entry.pregnancyNo || "pregnancy"}-${index}`}
                className="grid gap-3 px-3 py-3 md:grid-cols-[0.75fr_1.5fr_0.75fr_1.5fr_44px] md:items-start"
              >
                <FieldInput
                  label="Pregnancy No."
                  value={entry.pregnancyNo || ""}
                  onChange={(event) =>
                    onChange(index, "pregnancyNo", event.target.value)
                  }
                />
                <FieldInput
                  label="Place of Delivery"
                  value={entry.placeOfDelivery || ""}
                  onChange={(event) =>
                    onChange(index, "placeOfDelivery", event.target.value)
                  }
                />
                <FieldInput
                  label="Year"
                  inputMode="numeric"
                  value={entry.year || ""}
                  onChange={(event) =>
                    onChange(index, "year", event.target.value)
                  }
                />
                <FieldInput
                  label="Notes"
                  value={entry.notes || ""}
                  onChange={(event) =>
                    onChange(index, "notes", event.target.value)
                  }
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg border border-[#E8ECF0] text-[#94A3B8] transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] md:mt-[22px]"
                  aria-label="Remove pregnancy history row"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-semibold text-[#B91C1C] transition hover:bg-red-100"
      >
        + Add Pregnancy History
      </button>
    </div>
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

function ImmunizationVisitFields({
  entries,
  dateOfVisit,
  temperature,
  weight,
  height,
  breastfeedingMonitoring = {},
  consultationNotes,
  errors = {},
  onTemperatureChange,
  onWeightChange,
  onHeightChange,
  onBreastfeedingChange,
  onEntryChange,
  onToggleVaccine,
  onNotesChange,
}) {
  const selectedVaccines = new Set(entries.map((entry) => entry.vaccineName));

  return (
    <div className="space-y-5">
      <ClinicalFieldGroup title="Vaccines Given This Visit">
        {errors.vaccineEntries && (
          <p
            className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]"
            data-field="vaccineEntries"
            tabIndex={-1}
          >
            {errors.vaccineEntries}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {CHILD_VACCINE_OPTIONS.map((vaccineName) => {
        const checked = selectedVaccines.has(vaccineName);

        return (
            <label
              key={vaccineName}
              className="flex cursor-pointer items-center gap-2 py-1 text-sm font-medium text-[#475569]"
            >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onToggleVaccine(vaccineName, event.target.checked)
              }
              className="h-4 w-4 rounded border-[#D1D5DB] accent-[#B91C1C]"
            />

            <span>{vaccineName}</span>
          </label>
        );
      })}
        </div>

        {entries.some((entry) => entry.__legacyDetailsVisible === "showLegacyDetails") && (
          <div className="mt-4 space-y-3">
            {entries.map((entry, index) => (
              <div
                key={entry.vaccineName || `vaccine-entry-${index}`}
                className="rounded-xl border border-[#E8ECF0] bg-white p-4"
              >
                <p className="mb-3 text-xs font-bold text-[#1F2937]">
                  {entry.vaccineName}
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <FieldInput
                    label="Dose"
                    required
                    name={`vaccineEntries.${index}.dose`}
                    error={errors[`vaccineEntries.${index}.dose`]}
                    value={entry.dose}
                    onChange={(event) =>
                      onEntryChange(index, "dose", event.target.value)
                    }
                    placeholder="e.g. 1st dose, 2nd dose, booster"
                  />
                  <FieldInput
                    label="Date Given"
                    type="date"
                    required
                    name={`vaccineEntries.${index}.dateGiven`}
                    error={errors[`vaccineEntries.${index}.dateGiven`]}
                    value={entry.dateGiven || dateOfVisit}
                    onChange={(event) =>
                      onEntryChange(index, "dateGiven", event.target.value)
                    }
                  />
                  <FieldInput
                    label="Weight"
                    type="number"
                    step="0.01"
                    value={entry.weight || ""}
                    onChange={(event) =>
                      onEntryChange(index, "weight", event.target.value)
                    }
                    placeholder="kg"
                  />
                  <FieldInput
                    label="Height"
                    type="number"
                    step="0.01"
                    value={entry.height || ""}
                    onChange={(event) =>
                      onEntryChange(index, "height", event.target.value)
                    }
                    placeholder="cm"
                  />
                  <FieldInput
                    label="Temperature"
                    type="number"
                    step="0.1"
                    value={entry.temperature || ""}
                    onChange={(event) =>
                      onEntryChange(index, "temperature", event.target.value)
                    }
                    placeholder="°C"
                  />
                  <FieldInput
                    label="Next Schedule Date"
                    type="date"
                    value={entry.nextScheduleDate}
                    onChange={(event) =>
                      onEntryChange(index, "nextScheduleDate", event.target.value)
                    }
                  />
                  <FieldInput
                    label="Remarks"
                    value={entry.remarks}
                    onChange={(event) =>
                      onEntryChange(index, "remarks", event.target.value)
                    }
                    placeholder="Optional remarks"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ClinicalFieldGroup>

      <ClinicalFieldGroup title="Basic Monitoring">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldInput
            label="Weight"
            type="number"
            step="0.01"
            value={weight}
            onChange={(event) => onWeightChange(event.target.value)}
            placeholder="kg"
          />
          <FieldInput
            label="Height"
            type="number"
            step="0.01"
            value={height}
            onChange={(event) => onHeightChange(event.target.value)}
            placeholder="cm"
          />
          <FieldInput
            label="Temperature"
            type="number"
            step="0.1"
            value={temperature}
            onChange={(event) => onTemperatureChange(event.target.value)}
            placeholder="C"
          />
        </div>
      </ClinicalFieldGroup>

      <ClinicalFieldGroup title="Exclusive Breastfeeding Monitoring">
        <p className="mb-3 text-xs leading-relaxed text-[#64748B]">
          Select the months where exclusive breastfeeding was confirmed.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BREASTFEEDING_MONTHS.map((month) => {
          const checked =
            breastfeedingMonitoring?.[month.key] === true ||
            breastfeedingMonitoring?.[month.key] === "yes";

          return (
              <label
                key={month.key}
                className="flex cursor-pointer items-center gap-2 py-1 text-sm font-medium text-[#475569]"
              >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onBreastfeedingChange(month.key, event.target.checked)
                }
                className="h-4 w-4 rounded border-[#D1D5DB] accent-[#B91C1C]"
              />

              <span>{month.label}</span>
            </label>
          );
        })}
        </div>
      </ClinicalFieldGroup>

      <FieldTextarea
        label="Remarks"
        value={consultationNotes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder="Write immunization notes, guardian remarks, or post-vaccination observations..."
        rows={3}
      />
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

function getReceivingFacilityName(user = {}) {
  return formatFacilityName(
    user.ruralHealthUnit ||
      user.rural_health_unit ||
      user.assignedRuralHealthUnit ||
      user.receivingFacility,
    "",
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

function getPatientSearchLabel(patient = {}) {
  const display = getPatientDisplay(patient);
  return [display.name, display.age, display.cls].filter(Boolean).join(" · ");
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

