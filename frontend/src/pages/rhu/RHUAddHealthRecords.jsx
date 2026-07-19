import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  HeartPulse,
  Lock,
  Save,
  Search,
  Stethoscope,
  Syringe,
  User,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { SuccessModal } from "../../components/common";
import {
  DatePickerField,
  TimePickerField,
} from "../../components/common/forms/DatePickerField";
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import InlineSpinner from "../../components/common/loading/InlineSpinner";
import {
  createFollowUpHealthRecord,
  createRhuHealthRecord,
  getRhuHealthRecords,
  updateHealthRecordById,
} from "../../services/healthRecordService";
import { getPatientDetailsListByRole } from "../../services/patientService";
import { getCurrentUser } from "../../utils/auth";
import {
  formatDisplayValue,
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { createIdempotencyKey } from "../../utils/idempotency";

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
  "Senior Citizen",
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
    description: "For pregnancy, prenatal, postpartum, and maternal monitoring.",
    icon: HeartPulse,
  },
  Immunization: {
    title: "Child Health / EPI",
    description: "For vaccines, child care, EPI entries, and growth monitoring.",
    icon: Syringe,
  },
  "Senior Citizen": {
    title: "NCD Monitoring",
    description: "For hypertension, diabetes, maintenance monitoring, and follow-up.",
    icon: User,
  },
  "Family Planning": {
    title: "Family Planning",
    description: "For FP method, client type, counseling, and follow-up visits.",
    icon: Stethoscope,
  },
  "TB DOTS / TB Monitoring": {
    title: "TB DOTS / TB Monitoring",
    description: "For TB screening, treatment monitoring, and follow-up.",
    icon: Stethoscope,
    comingSoon: true,
  },
};

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
};

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
  vaccineEntries: [
    {
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
    },
  ],
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
  "Hepatitis B",
  "OPV 1",
  "Pentavalent 1",
  "PCV 1",
  "OPV 2",
  "Pentavalent 2",
  "PCV 2",
  "OPV 3",
  "Pentavalent 3",
  "PCV 3",
  "IPV 1",
  "IPV 2",
  "MCV 1",
  "MCV 2",
  "MMR",
  "Vitamin A",
  "Other",
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
  const lower = raw.toLowerCase();

  if (!raw) return "";
  if (lower.includes("immun")) return "Immunization";
  if (lower.includes("maternal") || lower.includes("prenatal")) return "Maternal";
  if (lower.includes("family") || lower.includes("planning")) return "Family Planning";
  if (lower.includes("senior")) return "Senior Citizen";
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
  const birthdate =
    patient.birthdate ||
    patient.birthDate ||
    patient.dateOfBirth ||
    patient.date_of_birth ||
    patient.dob;
  const ageFromBirthdate = calculateAgeInYears(birthdate, referenceDate);
  if (ageFromBirthdate !== null) return ageFromBirthdate;

  const ageText = String(patient.age || patient.ageSex || "").trim();
  const ageMatch = ageText.match(/\d+(?:\.\d+)?/);
  return ageMatch ? Number(ageMatch[0]) : null;
}

function getImmunizationPatientMode(patient, referenceDate) {
  const age = getPatientAgeInYears(patient, referenceDate);
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
  return entries;
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
  const linkedTrackingId = searchParams.get("trackingId") || "";
  const preselectedClassification = normalizeRecordType(
    searchParams.get("classification") ||
      searchParams.get("category") ||
      searchParams.get("recordType") ||
      searchParams.get("healthRecordType"),
  );
  const requestedMode = searchParams.get("mode") || "";
  const mode = requestedMode;
  const isFollowUp = !!recordId && mode === "follow-up";
  const isOrphanFollowUpRequest = !recordId && requestedMode === "follow-up";
  const isEditingRecord = !!recordId && !isFollowUp;

  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const officialSubmissionRef = useRef(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);
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

  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temp, setTemp] = useState("");
  const [pulse, setPulse] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const [followUpStatus, setFollowUpStatus] = useState("Routine Monitoring");
  const [followUpDate, setFollowUpDate] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [patientCondition, setPatientCondition] = useState("Improving");
  const [careDecisionStep, setCareDecisionStep] = useState(false);
  const [needsReferral, setNeedsReferral] = useState(false);

  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [familyPlanningData, setFamilyPlanningData] = useState(
    EMPTY_FAMILY_PLANNING_DATA,
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
        const parsedPatients = await getPatientDetailsListByRole("rhu");
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
    if (currentUserName && !attendingStaff) {
      setAttendingStaff(currentUserName);
    }
  }, [currentUserName, attendingStaff]);

  useEffect(() => {
    let active = true;

    async function loadExistingRecord() {
      if (!recordId) return;

      const records = await getRhuHealthRecords();
      const found = records.find(
        (record) => record.id === recordId || record._id === recordId,
      );

      if (!found || !active) return;

      setSelectedPatientId(found.patientId || "");
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
      setSystolicBp(found.systolicBp || "");
      setDiastolicBp(found.diastolicBp || "");
      setTemp(found.temperature || found.temp || "");
      setPulse(found.pulseRate || found.pulse || "");
      setWeight(found.weight || "");
      setHeight(found.height || "");
      setFollowUpStatus(
        normalizePatientStatus(found.followUpStatus || found.status),
      );
      setFollowUpDate(found.followUpDate || "");
      setMonitoringNotes(found.monitoringNotes || "");
      setPatientCondition(found.patientCondition || "Improving");
      const existingMaternalData = found.maternalData || found.maternal_data || {};
      setMaternalData({
        lmp: existingMaternalData.lmp || found.lmp || "",
        pmp: existingMaternalData.pmp || found.pmp || "",
        cycleDuration:
          existingMaternalData.cycleDuration || found.cycleDuration || "",
        gravida: existingMaternalData.gravida || found.gravida || "",
        para: existingMaternalData.para || found.para || "",
        term: existingMaternalData.term || found.term || "",
        preterm: existingMaternalData.preterm || found.preterm || "",
        abortion: existingMaternalData.abortion || found.abortion || "",
        living: existingMaternalData.living || found.living || "",
      });
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

    return () => {
      active = false;
    };
  }, [recordId]);

  useEffect(() => {
    async function loadFollowUpPreview() {
      if (!isFollowUp) {
        setFollowUpRecord(null);
        return;
      }

      const records = await getRhuHealthRecords();
      setFollowUpRecord(
        records.find(
          (record) => record.id === recordId || record._id === recordId,
        ) || null,
      );
    }

    loadFollowUpPreview();
  }, [isFollowUp, recordId]);

  const selectedPatient = patients.find(
    (patient) => patient.id === selectedPatientId,
  );

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
  const followUpPatientId =
    selectedPatient?.patientId ||
    selectedPatient?.id ||
    followUpRecord?.patientId ||
    followUpRecord?.patient_id ||
    "Not recorded";

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
    setMaternalData(EMPTY_MATERNAL_DATA);
    setExpectedDeliveryDate("");
    setAog("");
    setImmunizationData(EMPTY_IMMUNIZATION_DATA);
    setFamilyPlanningData(EMPTY_FAMILY_PLANNING_DATA);
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
  const isGeneralConsultationFollowUp =
    isFollowUp && !isImmunization && !isMaternal && !isFamilyPlanning;
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
  const showFollowUpMonitoringFields =
    normalizePatientStatus(followUpStatus) === "Follow-up Required";
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
  const usesCareDecisionStep = false;
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
      setExpectedDeliveryDate("");
      setAog("");
      setImmunizationData(EMPTY_IMMUNIZATION_DATA);
      setFamilyPlanningData(EMPTY_FAMILY_PLANNING_DATA);
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

  const immunizationPatientInfo = getImmunizationPatientMode(
    selectedPatient,
    dateOfVisit,
  );
  const familyPlanningEligibility = getFamilyPlanningEligibility(
    selectedPatient,
    dateOfVisit,
  );
  const immunizationVaccineEntries = getVaccineEntries(immunizationData);

  useEffect(() => {
    if (isMaternal) {
      setFollowUpStatus("Routine Monitoring");
    }
  }, [isMaternal]);

  useEffect(() => {
    if (isFollowUp && !showFollowUpMonitoringFields) {
      setFollowUpDate("");
      if (!isFollowUp) setPatientCondition("");
    }
  }, [showFollowUpMonitoringFields, isFollowUp]);

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
              dose: "Given",
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

      preparedEntries.forEach((entry, index) => {
        if (entry.vaccineName === "Other" && !entry.customVaccineName?.trim()) {
          errors[`vaccineEntries.${index}.customVaccineName`] =
            "Specify the vaccine name.";
        }
      });

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

    if (isFollowUp && isMaternal) {
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

  async function handleSave(event) {
    event.preventDefault();
    closeDateTimePopovers();

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
          ? "Patient is still loading. Try again."
          : "Select a patient first.",
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
      dose: entry.dose || "Given",
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
      const missingRequiredVaccineDetails = preparedVaccineEntries.some(
        (entry) => !String(entry.vaccineName || "").trim(),
      );

      if (preparedVaccineEntries.length === 0 && !consultationNotes.trim()) {
        setValidationErrorsAndFocus({
          vaccineEntries:
            "Select at least one vaccine or enter remarks if no vaccine was given.",
        });
        return;
      }

      if (missingRequiredVaccineDetails) {
        setValidationErrorsAndFocus(getClinicalValidationErrors());
        return;
      }
    }

    const immunizationNextScheduleDate =
      preparedVaccineEntries.find((entry) => entry.nextScheduleDate)
        ?.nextScheduleDate || "";
    const effectiveFollowUpDate = followUpDate || immunizationNextScheduleDate || "";

    if (
      effectiveHealthRecordType === "Immunization" &&
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
          : chiefComplaint;
    const formattedBp = (() => {
      const sys = systolicBp || "N/A";
      const dia = diastolicBp || "N/A";
      return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
    })();
    const vitalSigns = `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | Pulse: ${
      pulse || "N/A"
    } bpm | Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;
    const finalPatientStatus = isFollowUp
      ? normalizePatientStatus(followUpStatus)
      : effectiveFollowUpDate
        ? "Follow-up Required"
        : "Completed";
    const finalNeedsReferral = !isFollowUp && Boolean(needsReferral);

    const recordMaternalData = {
      ...maternalData,
      expectedDeliveryDate,
      aog,
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

    setSaving(true);

    try {
      const recordData = {
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
        dateOfVisit,
        timeOfVisit,
        chiefComplaint: finalChiefComplaint,
        summaryOfPresentIllness,
        diagnosis,
        vitalSigns,
        systolicBp: systolicBp || null,
        diastolicBp: diastolicBp || null,
        temperature: temp || null,
        pulseRate: pulse || null,
        weight: weight || null,
        height: height || null,
        medication,
        initialActionsTaken: medication,
        attendingStaff,
        consultationNotes,
      followUpStatus: finalPatientStatus,
      followUpDate: effectiveFollowUpDate,
        needsReferral: finalNeedsReferral,
        needs_referral: finalNeedsReferral,
        monitoringNotes,
        patientCondition:
          isFollowUp || effectiveFollowUpDate ? patientCondition : "",
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
        linkedTrackingId,
        previousRecordId: isFollowUp ? recordId : "",
        status: finalPatientStatus,
        recordedBy: attendingStaff || "RHU Staff",
        createdByRole: "rhu",
      };

      const submission = isEditingRecord
        ? null
        : officialSubmissionRef.current || {
            idempotencyKey: createIdempotencyKey(),
            payload: JSON.parse(JSON.stringify(recordData)),
          };
      if (submission) officialSubmissionRef.current = submission;

      const savedRecord = isEditingRecord
        ? await updateHealthRecordById(recordId, recordData, "rhu")
        : isFollowUp
          ? await createFollowUpHealthRecord(
              {
                ...submission.payload,
                previousRecordId: recordId,
                parentHealthRecordId: recordId,
                parent_health_record_id: recordId,
                visitType: "follow_up_visit",
                visit_type: "follow_up_visit",
                recordType: "Follow-up",
                isFollowUp: true,
              },
              "rhu",
              { idempotencyKey: submission.idempotencyKey },
            )
          : await createRhuHealthRecord(submission.payload, {
              idempotencyKey: submission.idempotencyKey,
            });
      const savedId =
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id;

      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.familyPlanningRecords("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary("rhu"),
      });
      if (selectedPatientId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.patientDetails("rhu", selectedPatientId),
        });
      }
      if (savedId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.healthRecordDetails("rhu", savedId),
        });
      }

      setCareDecisionStep(false);
      officialSubmissionRef.current = null;
      setSaveSuccess({
        recordId: savedId || recordId || "",
        patientId: selectedPatientId,
        status: finalPatientStatus,
        needsReferral: finalNeedsReferral,
        isFollowUp,
      });
    } catch (error) {
      console.error("Failed to save RHU health record:", error);
      if (
        Number(error?.status) === 409 &&
        error?.payload?.code === "FOLLOW_UP_ALREADY_PROCESSED"
      ) {
        const latestRecordId = error?.payload?.health_record_id || "";
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.healthRecords("rhu"),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.patientDetails("rhu", selectedPatientId),
          }),
        ]);
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
              label: "Back to Health Records",
              variant: "secondary",
              onClick: () => navigate(healthRecordsPath),
            },
            {
              label: "Refresh",
              variant: "secondary",
              onClick: () => {
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.healthRecords("rhu"),
                });
              },
            },
          ],
        });
        return;
      }
      if (
        Number(error?.status) === 409 &&
        error?.payload?.code === "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"
      ) {
        setNoticeModal({
          title: "Submission Conflict",
          message:
            "This submission key was already used for different health-record information. Your current form has not been submitted. Review the patient's health-record history before trying again.",
        });
        return;
      }
      if (error?.status === 422 && error?.errors) {
        officialSubmissionRef.current = null;
        const backendErrors = Object.fromEntries(
          Object.entries(error.errors).map(([field, messages]) => [
            field,
            Array.isArray(messages) ? messages[0] : String(messages),
          ]),
        );
        if (setValidationErrorsAndFocus(backendErrors)) return;
      }
      if ([403, 404, 422].includes(Number(error?.status))) {
        officialSubmissionRef.current = null;
      }
      if (Number(error?.status) >= 400 && ![502, 503, 504].includes(Number(error.status))) {
        officialSubmissionRef.current = null;
      }
      setNoticeModal({
        title: "Save Failed",
        message:
          "Unable to save the health record. Please review the form and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = isFollowUp
    ? "Follow-up Health Record"
    : isEditingRecord
      ? "Edit Health Record"
      : "Add Health Record";
  const pageStepLabel = null;
  const pageSubtitle = isFollowUp
    ? "Record what happened during the patient's scheduled return visit."
    : isEditingRecord
      ? "Correct or update details in this existing RHU health record."
      : setupComplete
          ? "Complete the clinical details for this visit."
          : "Search patient and choose the record type before recording a visit.";

  function handleStepBack() {
    closeDateTimePopovers();
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
    <DashboardLayout role={userRole} title="Add Health Record">
      <style>{keyframes}</style>

      <div
        className="anim-fade-up mb-5 ml-0 mr-auto w-full max-w-6xl"
        style={stagger(0)}
      >
        <button
          type="button"
          onClick={handleStepBack}
          className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-2xl border border-[#E8ECF0] bg-white px-5 py-4 shadow-sm">
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
            selectedPatient,
            searchTerm,
            inputValue: patientSearchInputValue,
            patients: filteredPatients,
            totalPatientCount: patients.length,
            matchingPatientCount: matchingPatients.length,
            visibleLimit: visiblePatientLimit,
            loading: patientsLoading && patients.length === 0,
            isSearching: Boolean(normalizedSearch),
            onSeeAll: () => navigate("/rhu/patients"),
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
          referralLabel="Needs Referral"
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
        className="relative ml-0 mr-auto w-full max-w-6xl"
      >
        <div className="space-y-5 rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
        {isFollowUp && (
          <FollowUpContextCard
            patientName={followUpPatientName}
            patientId={followUpPatientId}
            recordId={recordId}
            record={followUpRecord}
          />
        )}

        <FormSection
          title="Visit Overview"
          subtitle="Confirm the visit schedule and attending practitioner."
          icon={<Clock size={14} />}
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
              icon={<Stethoscope size={14} />}
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
              icon={<HeartPulse size={14} />}
              delay={4}
            >
              <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
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
              icon={<Stethoscope size={14} />}
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
              icon={<HeartPulse size={14} />}
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
            title="Child Immunization Details"
            subtitle="Select the vaccines given during this visit."
            icon={<Syringe size={14} />}
            delay={2}
          >
            <ImmunizationVisitFields
              ageInfo={immunizationPatientInfo}
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
            title="Follow-up & Referral"
            subtitle="Schedule a return visit if needed and indicate if referral is required."
            icon={<HeartPulse size={14} />}
            delay={3}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldInput
                label="Next Follow-up Date"
                type="date"
                value={followUpDate}
                name="followUpDate"
                error={validationErrors.followUpDate}
                onChange={(event) => {
                  clearValidationError("followUpDate");
                  setFollowUpDate(event.target.value);
                }}
              />
              <YesNoRadioGroup
                label="Needs Referral?"
                name="needsReferral"
                value={needsReferral ? "Yes" : "No"}
                onChange={(value) => setNeedsReferral(value === "Yes")}
              />
            </div>
          </FormSection>
        )}

        {!patientGateLocked && isMaternal && !selectedPatientIsMale && (
          <FormSection
            title="Classification-Specific Assessment"
            subtitle="Monitor pregnancy progression and maternal clinical vitals."
            icon={<HeartPulse size={14} />}
            delay={2}
            accent="pink"
          >
            <ClassificationSectionIntro
              title="Maternal & Prenatal Assessment"
              description="Pregnancy dating and obstetric profile are shown only for maternal records."
              accent="pink"
            />
            {showMaternalPatientWarning && <MaternalClassificationWarning />}
            <div className="grid gap-5 lg:grid-cols-2">
              <ClinicalFieldGroup title="Pregnancy Dating" accent="pink">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                  value={maternalData.cycleDuration}
                  onChange={(event) =>
                    handleMaternalChange("cycleDuration", event.target.value)
                  }
                />
                <FieldInput
                  label="Calculated AOG"
                  value={aog || "Calculating..."}
                  readOnly
                />
                <FieldInput
                  label="Expected Delivery Date"
                  value={expectedDeliveryDate || "Calculating..."}
                  readOnly
                />
                </div>
              </ClinicalFieldGroup>
              <ClinicalFieldGroup title="Obstetric History" accent="pink">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                </div>
              </ClinicalFieldGroup>
              </div>
          </FormSection>
        )}

        {!patientGateLocked && isFamilyPlanning && (
          <FormSection
            title="Family Planning Details"
            subtitle="Record the family planning service type, method, source, schedule, and action taken."
            icon={<Stethoscope size={14} />}
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

        {!isFollowUp && !isImmunization && !isFamilyPlanning && (
          <FormSection
            title="Consultation Information"
            subtitle="Record consultation findings and observations."
            icon={<Stethoscope size={14} />}
            delay={3}
          >
            <LockedFormContent locked={patientGateLocked}>
            <div className="grid gap-4 lg:grid-cols-2">
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
              <FieldInput
                label="Initial Diagnosis"
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
              />
            </div>
            <div className="mt-4">
              <FieldTextarea
                label="Summary of Present Illness and Physical Examination"
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
                placeholder="Record the detailed history of the present illness and physical examination findings here..."
                rows={5}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FieldInput
                label="Initial Actions Taken"
                value={medication}
                onChange={(event) => setMedication(event.target.value)}
              />
              <FieldTextarea
                label="Other Observations"
                value={consultationNotes}
                onChange={(event) => setConsultationNotes(event.target.value)}
                placeholder="Other observations not covered in the summary..."
                rows={3}
              />
            </div>
            </LockedFormContent>
          </FormSection>
        )}

        {!isFollowUp && !isImmunization && !isFamilyPlanning && (
          <>
            <FormSection
              title="Vital Signs"
              subtitle="Record the patient's physiological measurements."
              icon={<HeartPulse size={14} />}
              delay={4}
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

            {!usesCareDecisionStep && (
            <FormSection
              title="Follow-up & Referral"
              subtitle="Schedule a return visit if needed and indicate if referral is required."
              icon={<HeartPulse size={14} />}
              delay={5}
            >
          <LockedFormContent locked={patientGateLocked}>
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldInput
              label="Next Follow-up Date"
              type="date"
              value={followUpDate}
              name="followUpDate"
              error={validationErrors.followUpDate}
              onChange={(event) => {
                clearValidationError("followUpDate");
                setFollowUpDate(event.target.value);
              }}
            />
            <YesNoRadioGroup
              label="Needs Referral?"
              name="needsReferral"
              value={needsReferral ? "Yes" : "No"}
              onChange={(value) => setNeedsReferral(value === "Yes")}
            />
          </div>
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
            type="submit"
            disabled={saving}
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {saving ? (
              <ButtonSpinner />
            ) : (
              <Save
                size={15}
                className="transition-transform duration-300 group-hover:scale-110"
              />
            )}
            {saving
              ? "Saving..."
              : isFollowUp
                ? "Save Follow-up Visit"
                : "Save Health Record"}
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
            : "Record saved."
        }
        description={
          saveSuccess?.isFollowUp
            ? "The follow-up visit has been saved and linked to the original health record."
            : "The health record has been saved successfully."
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
            label: "Back to Health Records",
            onClick: () => navigate(healthRecordsPath),
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
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {(noticeModal.actions?.length
                  ? noticeModal.actions
                  : [{ label: noticeModal.buttonLabel || "OK", onClick: noticeModal.onClose }]
                ).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setNoticeModal(null);
                      action.onClick?.();
                    }}
                    className={
                      action.variant === "secondary"
                        ? "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        : "rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
      className="anim-fade-up ml-0 mr-auto w-full max-w-6xl"
      style={stagger(1)}
    >
      <div className="rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm sm:p-6">
        <div
          className={`relative z-30 rounded-xl border p-4 ${
            errors.selectedPatientId
              ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
              : "border-[#E8ECF0] bg-[#FAFBFC]"
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
      className="anim-fade-up ml-0 mr-auto w-full max-w-6xl"
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
            {saving ? "Saving..." : "Save Health Record"}
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

function PatientSearchDropdown({
  inputRef,
  dropdownRef,
  disabled,
  dropdownOpen,
  selectedPatientId,
  selectedPatient,
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
  showSelectedPreview = true,
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

        {selectedPatientId && !disabled ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[#9CA3AF] transition-colors hover:bg-[#F3F4F6] hover:text-[#6B7280]"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        ) : (
          !disabled && (
            <ChevronDown
              size={14}
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                dropdownOpen ? "text-[#B91C1C]" : "text-[#9CA3AF]"
              }`}
            />
          )
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
                        ? "bg-[#B91C1C]/[0.06]"
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
                          <span className="shrink-0 rounded-md border border-[#E8ECF0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#0B2E59]">
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

      {showSelectedPreview && selectedPatient && (
        <SelectedPatientPreview patient={selectedPatient} />
      )}
    </div>
  );
}

function SelectedPatientPreview({ patient }) {
  const display = getPatientDisplay(patient);

  return (
    <div className="anim-fade-up mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-widest text-[#B91C1C]">
        Selected Patient
      </span>
      <span className="text-slate-300">•</span>
      <span className="text-xs font-bold text-[#1A1A1A]">{display.name}</span>
      {display.age && (
        <>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-[#6B7280]">{display.age}</span>
        </>
      )}
      {display.cls && (
        <>
          <span className="text-slate-300">•</span>
          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-[#B91C1C]">
            {display.cls}
          </span>
        </>
      )}
      {display.contact && (
        <>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-[#6B7280]">{display.contact}</span>
        </>
      )}
      {display.barangay && (
        <>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-[#6B7280]">{display.barangay}</span>
        </>
      )}
      {display.id && (
        <>
          <span className="text-slate-300">•</span>
          <span className="font-mono text-[10px] font-semibold text-[#0B2E59]">
            {display.id}
          </span>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FORM SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FollowUpContextCard({ patientName, patientId, recordId, record }) {
  return (
    <div
      className="anim-fade-up rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-4 border-b border-amber-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Lock size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1A1A1A]">
              Follow-up Context
            </h2>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              This follow-up visit is linked to the original health record.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Locked Patient
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ContextItem label="Patient" value={patientName} strong />
        <ContextItem label="Patient ID" value={patientId} />
        <ContextItem label="Original Health Record ID" value={recordId} />
        <ContextItem
          label="Original Visit Date"
          value={record?.dateOfVisit || record?.dateRecorded || record?.date || ""}
        />
        <ContextItem
          label="Original Classification"
          value={normalizeRecordType(
            record?.category ||
              record?.recordType ||
              record?.patientClassification ||
              record?.classification,
          )}
        />
        <ContextItem
          label="Original Chief Complaint"
          value={record?.chiefComplaint}
          strong
        />
        <ContextItem label="Original Diagnosis" value={record?.diagnosis} />
        <ContextItem
          label="Original Status"
          value={normalizePatientStatus(
            record?.followUpStatus || record?.status || "Follow-up Required",
          )}
        />
        <ContextItem
          label="Scheduled Follow-up Date"
          value={record?.followUpDate}
        />
        <ContextItem
          label="Original Practitioner"
          value={record?.attendingStaff || record?.recordedBy}
        />
      </div>
    </div>
  );
}

function ContextItem({ label, value, strong = false }) {
  return (
    <div className="min-w-0 rounded-xl border border-amber-100/80 bg-white/75 px-3.5 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm ${
          strong ? "font-bold text-[#1F2937]" : "font-semibold text-[#475569]"
        }`}
      >
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function FormSection({ title, subtitle, icon, children, delay = 0, accent }) {
  const accentClass = accent === "pink" ? "text-pink-700 bg-pink-50" : "text-[#B91C1C] bg-red-50";

  return (
    <div
      className="anim-fade-up space-y-4 pb-6"
      style={stagger(delay)}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-md ${accentClass}`}
        >
          {icon}
        </div>
        <div>
          <h2
            className={`text-sm font-bold ${accent === "pink" ? "text-pink-800" : "text-[#1A1A1A]"}`}
          >
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[#6B7280]">{subtitle}</p>}
        </div>
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

function ClassificationSectionIntro({ title, description, accent }) {
  const titleClass = accent === "pink" ? "text-pink-800" : "text-[#1F2937]";

  return (
    <div className="mb-5">
      <p className={`text-sm font-bold ${titleClass}`}>{title}</p>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
          {description}
        </p>
      )}
    </div>
  );
}

function ClinicalFieldGroup({ title, children, accent }) {
  const titleClass = accent === "pink" ? "text-pink-700" : "text-[#B91C1C]";

  return (
    <div className="rounded-xl border border-[#EEF2F6] bg-[#FCFCFD] p-4">
      <p className={`mb-3 text-[10px] font-bold uppercase tracking-widest ${titleClass}`}>
        {title}
      </p>
      {children}
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

function ImmunizationVisitFields({
  ageInfo,
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
  const showAgeWarning = ageInfo.mode === "unknown";
  const selectedVaccines = new Set(entries.map((entry) => entry.vaccineName));

  return (
    <div className="space-y-5">
      {showAgeWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            Patient age is not available. Please verify the patient's
            birthdate before recording immunization details.
          </p>
        </div>
      )}

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
              <button
                key={vaccineName}
                type="button"
                onClick={() => onToggleVaccine(vaccineName, !checked)}
                aria-pressed={checked}
                className={`flex min-h-[46px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                  checked
                    ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] ring-1 ring-[#B91C1C]/10"
                    : "border-[#E8ECF0] bg-white text-[#475569] hover:border-[#FECACA] hover:bg-red-50/30"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    checked ? "bg-[#B91C1C] text-white" : "bg-[#F1F5F9] text-transparent"
                  }`}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>{vaccineName}</span>
              </button>
            );
          })}
        </div>

        {entries.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-[#E5E7EB] bg-white px-4 py-3 text-xs text-[#64748B]">
            Select at least one vaccine given during this visit, or enter
            remarks below if no vaccine was given.
          </p>
        )}
        {entries.map((entry, index) =>
          entry.vaccineName === "Other" ? (
            <div key="other-vaccine-name" className="mt-4 max-w-md">
              <FieldInput
                label="Other Vaccine Name"
                required
                name={`vaccineEntries.${index}.customVaccineName`}
                error={errors[`vaccineEntries.${index}.customVaccineName`]}
                value={entry.customVaccineName || ""}
                onChange={(event) =>
                  onEntryChange(index, "customVaccineName", event.target.value)
                }
                placeholder="Enter vaccine name"
              />
            </div>
          ) : null,
        )}
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
                  {entry.vaccineName === "Other" && (
                    <FieldInput
                      label="Specify Vaccine"
                      required
                      name={`vaccineEntries.${index}.customVaccineName`}
                      error={
                        errors[`vaccineEntries.${index}.customVaccineName`]
                      }
                      value={entry.customVaccineName || ""}
                      onChange={(event) =>
                        onEntryChange(index, "customVaccineName", event.target.value)
                      }
                      placeholder="Enter vaccine name"
                    />
                  )}
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
              <button
                key={month.key}
                type="button"
                onClick={() => onBreastfeedingChange(month.key, !checked)}
                aria-pressed={checked}
                className={`flex min-h-[42px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  checked
                    ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] ring-1 ring-[#B91C1C]/10"
                    : "border-[#E8ECF0] bg-white text-[#475569] hover:border-[#FECACA] hover:bg-red-50/30"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    checked ? "bg-[#B91C1C] text-white" : "bg-[#F1F5F9] text-transparent"
                  }`}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>{month.label}</span>
              </button>
            );
          })}
        </div>
      </ClinicalFieldGroup>

      <FieldTextarea
        label="Clinical Notes / Remarks"
        value={consultationNotes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder="Write immunization notes, guardian remarks, or post-vaccination observations..."
        rows={3}
      />
    </div>
  );
}
function FieldInput({ label, required, error, className = "", ...props }) {
  const inputClass = error
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
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

function FieldSelect({ label, required, error, children, className = "", ...props }) {
  const selectClass = error
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
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

function FieldTextarea({ label, required, error, rows = 3, className = "", ...props }) {
  const textareaClass = error
    ? "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10"
    : "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
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

function YesNoRadioGroup({ label, name, value, onChange }) {
  return (
    <div data-field={name}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2">
        {["No", "Yes"].map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={(value || "No") === option}
              onChange={() => onChange(option)}
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
  return String(
    patient.sex ||
      patient.gender ||
      patient.patientSex ||
      patient.patientGender ||
      patient.ageSex ||
      "",
  )
    .trim()
    .toLowerCase();
}

function hasPatientSex(patient = {}) {
  return Boolean(getPatientSexText(patient));
}

function isPatientMale(patient = {}) {
  const sexText = getPatientSexText(patient);

  return sexText === "m" || /\bmale\b/.test(sexText);
}

