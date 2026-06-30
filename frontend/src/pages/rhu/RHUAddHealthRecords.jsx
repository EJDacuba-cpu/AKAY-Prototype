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
  "Maternal",
  "Immunization",
  "Senior Citizen",
];

const RECORD_TYPE_DETAILS = {
  "General Consultation": {
    description: "For routine check-up, symptoms, and general concerns.",
    icon: Stethoscope,
  },
  Maternal: {
    description: "For prenatal, pregnancy, postpartum, and maternal monitoring.",
    icon: HeartPulse,
  },
  Immunization: {
    description: "For child vaccination schedule entries.",
    icon: Syringe,
  },
  "Senior Citizen": {
    description: "For senior citizen monitoring and related visits.",
    icon: User,
  },
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
      nextScheduleDate: "",
      siteRoute: "",
      reason: "",
      remarks: "",
    },
  ],
};

const ADULT_IMMUNIZATION_MIN_AGE_YEARS = 18;
const CHILD_VACCINE_OPTIONS = [
  "BCG",
  "Hepatitis B",
  "Pentavalent",
  "OPV",
  "PCV",
  "IPV",
  "MMR",
  "Vitamin A",
  "Other",
];
const EMPTY_VACCINE_ENTRY = {
  vaccineName: "",
  customVaccineName: "",
  dose: "",
  dateGiven: "",
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
  const visitTypeLabel = isFollowUp ? "Follow-up Visit" : "Initial Consultation";
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
  const usesCareDecisionStep = !isFollowUp && !isEditingRecord;
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

    if (patientGateLocked) {
      setNoticeModal({
        title: "Patient Required",
        message: "Select patient first.",
      });
      return;
    }

    if (normalizedNextType === "Maternal" && selectedPatientIsMale) {
      resetClassificationSpecificState();
      setNoticeModal({
        title: "Invalid Classification",
        message:
          "Maternal records are for pregnancy or prenatal consultations. This patient is recorded as male. Please choose another classification.",
        onClose: () => classificationRef.current?.focus(),
      });
      return;
    }

    if (
      normalizedNextType === "Immunization" &&
      immunizationPatientInfo.mode === "adult"
    ) {
      resetClassificationSpecificState();
      setNoticeModal({
        title: "Invalid Classification",
        message: getAdultImmunizationMessage(immunizationPatientInfo.age),
        onClose: () => classificationRef.current?.focus(),
        buttonLabel: "Okay",
      });
      return;
    }

    if (normalizedNextType !== normalizedHealthRecordType) {
      setMaternalData(EMPTY_MATERNAL_DATA);
      setExpectedDeliveryDate("");
      setAog("");
      setImmunizationData(EMPTY_IMMUNIZATION_DATA);
    }

    setHealthRecordType(nextType);
  }

  function handleProceedFromSetup() {
    closeDateTimePopovers();
    const errors = {};
    if (!selectedPatientId) errors.selectedPatientId = "Select a patient first.";
    if (!normalizedHealthRecordType) {
      errors.healthRecordType = "Select a classification first.";
    }

    if (setValidationErrorsAndFocus(errors)) return;

    setSetupComplete(true);
    setCareDecisionStep(false);
    setDropdownOpen(false);
  }

  const immunizationPatientInfo = getImmunizationPatientMode(
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
    if (!showFollowUpMonitoringFields) {
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

  function handleVaccineChange(field, value) {
    clearValidationError(field);
    setImmunizationData((prev) => {
      return { ...prev, [field]: value };
    });
  }

  function handleVaccineEntryChange(index, field, value) {
    clearValidationError(`vaccineEntries.${index}.${field}`);
    clearValidationError("vaccineEntries");
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

  function handleProceedToCareDecision(event) {
    event.preventDefault();
    closeDateTimePopovers();
    const clinicalErrors = getClinicalValidationErrors();
    if (setValidationErrorsAndFocus(clinicalErrors)) return;

    setCareDecisionStep(true);
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

    if (isFollowUp) {
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

      if (preparedEntries.length === 0) {
        errors.vaccineEntries = "Select at least one vaccine.";
      }

      preparedEntries.forEach((entry, index) => {
        if (entry.vaccineName === "Other" && !entry.customVaccineName?.trim()) {
          errors[`vaccineEntries.${index}.customVaccineName`] =
            "Specify the vaccine name.";
        }
        if (!String(entry.dose || "").trim()) {
          errors[`vaccineEntries.${index}.dose`] = "Dose is required.";
        }
        if (!String(entry.dateGiven || "").trim()) {
          errors[`vaccineEntries.${index}.dateGiven`] =
            "Date given is required.";
        }
      });

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

  function getCareDecisionValidationErrors() {
    const errors = {};
    if (!normalizePatientStatus(followUpStatus)) {
      errors.followUpStatus = "Select the patient status.";
    }
    if (showFollowUpMonitoringFields && !followUpDate) {
      errors.followUpDate = "Follow-up date is required.";
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
      ) !== "Follow-up Required"
    ) {
      setNoticeModal({
        title: "Follow-up Not Available",
        message:
          "Record Follow-up Visit is only available for records marked Follow-up Required.",
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

    const clientErrors = {
      ...getClinicalValidationErrors(),
      ...(usesCareDecisionStep ? getCareDecisionValidationErrors() : {}),
    };

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

    if (!isFollowUp && effectiveHealthRecordType === "Immunization") {
      const missingRequiredVaccineDetails = preparedVaccineEntries.some(
        (entry) =>
          !String(entry.vaccineName || "").trim() ||
          !String(entry.dose || "").trim() ||
          !String(entry.dateGiven || "").trim(),
      );

      if (preparedVaccineEntries.length === 0) {
        setValidationErrorsAndFocus({
          vaccineEntries: "Select at least one vaccine.",
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
    const effectiveFollowUpDate =
      showFollowUpMonitoringFields && !followUpDate && immunizationNextScheduleDate
        ? immunizationNextScheduleDate
        : followUpDate;

    if (
      !isFollowUp &&
      effectiveHealthRecordType === "Immunization" &&
      showFollowUpMonitoringFields &&
      !followUpDate &&
      immunizationNextScheduleDate
    ) {
      setFollowUpDate(immunizationNextScheduleDate);
    }

    if (
      !isFollowUp &&
      effectiveHealthRecordType === "Immunization" &&
      showFollowUpMonitoringFields &&
      !followUpDate &&
      !immunizationNextScheduleDate
    ) {
      setValidationErrorsAndFocus({
        followUpDate:
          "Enter a follow-up date or next schedule date for Follow-up Required status.",
      });
      return;
    }

    const finalChiefComplaint =
      isFollowUp && !chiefComplaint
        ? `Follow-up visit: ${
            followUpRecord?.chiefComplaint || "Return consultation"
          }`
        : isImmunization && !chiefComplaint
          ? "Vaccination Visit"
          : chiefComplaint;
    const formattedBp = (() => {
      const sys = systolicBp || "N/A";
      const dia = diastolicBp || "N/A";
      return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
    })();
    const vitalSigns = `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | Pulse: ${
      pulse || "N/A"
    } bpm | Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;
    const finalPatientStatus = normalizePatientStatus(followUpStatus);
    const finalNeedsReferral =
      usesCareDecisionStep &&
      finalPatientStatus !== "Completed" &&
      Boolean(needsReferral);

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
      followUpDate: showFollowUpMonitoringFields ? effectiveFollowUpDate : "",
        needsReferral: finalNeedsReferral,
        needs_referral: finalNeedsReferral,
        monitoringNotes,
        patientCondition:
          isFollowUp || showFollowUpMonitoringFields ? patientCondition : "",
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
        linkedTrackingId,
        previousRecordId: isFollowUp ? recordId : "",
        status: finalPatientStatus,
        recordedBy: attendingStaff || "RHU Staff",
        createdByRole: "rhu",
      };

      const savedRecord = isEditingRecord
        ? await updateHealthRecordById(recordId, recordData, "rhu")
        : isFollowUp
          ? await createFollowUpHealthRecord(
              {
                ...recordData,
                previousRecordId: recordId,
                parentHealthRecordId: recordId,
                parent_health_record_id: recordId,
                visitType: "follow_up_visit",
                visit_type: "follow_up_visit",
                recordType: "Follow-up",
                isFollowUp: true,
              },
              "rhu",
            )
          : await createRhuHealthRecord(recordData);
      const savedId =
        savedRecord?.id ||
        savedRecord?._id ||
        savedRecord?.data?.id ||
        savedRecord?.data?._id;

      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("rhu"),
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
      setSaveSuccess({
        recordId: savedId || recordId || "",
        patientId: selectedPatientId,
        status: finalPatientStatus,
        needsReferral: finalNeedsReferral,
        isFollowUp,
      });
    } catch (error) {
      console.error("Failed to save RHU health record:", error);
      if (error?.status === 422 && error?.errors) {
        const backendErrors = Object.fromEntries(
          Object.entries(error.errors).map(([field, messages]) => [
            field,
            Array.isArray(messages) ? messages[0] : String(messages),
          ]),
        );
        if (setValidationErrorsAndFocus(backendErrors)) return;
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
      : careDecisionStep && usesCareDecisionStep
        ? "Review & Care Decision"
        : "Add Health Record";
  const pageStepLabel = usesCareDecisionStep
    ? careDecisionStep
      ? "Step 3 of 3"
      : setupComplete
        ? "Step 2 of 3"
        : "Step 1 of 3"
    : null;
  const pageSubtitle = isFollowUp
    ? "Record what happened during the patient's scheduled return visit."
    : isEditingRecord
      ? "Correct or update details in this existing RHU health record."
      : careDecisionStep && usesCareDecisionStep
        ? "Review the visit summary and choose what should happen after this record is saved."
        : setupComplete
          ? "Complete the clinical details for this visit."
          : "Search patient and choose the record classification before recording a visit.";

  function handleStepBack() {
    closeDateTimePopovers();
    if (careDecisionStep && usesCareDecisionStep) {
      setCareDecisionStep(false);
      return;
    }

    if (setupComplete && usesCareDecisionStep) {
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
        onSubmit={usesCareDecisionStep ? handleProceedToCareDecision : handleSave}
        noValidate
        className="relative ml-0 mr-auto w-full max-w-6xl space-y-5"
      >
        {Object.keys(validationErrors).length > 0 && <ValidationAlert />}

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
          subtitle="Confirm the visit type, classification, schedule, and attending practitioner."
          icon={<Clock size={14} />}
          delay={2}
        >
          <LockedFormContent locked={patientGateLocked}>
          <div
            className={`grid gap-4 ${
              isFollowUp || isEditingRecord
                ? "lg:grid-cols-5"
                : "sm:grid-cols-2 lg:grid-cols-4"
            }`}
          >
            <FieldInput label="Visit Type" value={visitTypeLabel} readOnly />
            {(isFollowUp || isEditingRecord) && (
              <FieldInput
                label="Classification"
                value={
                  normalizedHealthRecordType ||
                  normalizeRecordType(
                    followUpRecord?.category ||
                      followUpRecord?.recordType ||
                      followUpRecord?.patientClassification,
                  ) ||
                  "General Consultation"
                }
                readOnly
              />
            )}
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
              value={attendingStaff}
              readOnly
            />
          </div>
          {showMaternalPatientWarning && <MaternalClassificationWarning />}
          </LockedFormContent>
        </FormSection>

        {isFollowUp && (
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

        {!isFollowUp && !patientGateLocked && isImmunization && (
          <FormSection
            title="Classification-Specific Assessment"
            subtitle="Record vaccines given as part of this health record visit."
            icon={<Syringe size={14} />}
            delay={2}
          >
            <ClassificationSectionIntro
              title="Child Immunization Details"
              description="Select the vaccines given during this immunization visit."
            />
            <ImmunizationVisitFields
              ageInfo={immunizationPatientInfo}
              entries={immunizationVaccineEntries}
              dateOfVisit={dateOfVisit}
              feedingStatus={immunizationData.feeding_status}
            consultationNotes={consultationNotes}
            errors={validationErrors}
            onFeedingStatusChange={(value) =>
              handleVaccineChange("feeding_status", value)
              }
              onEntryChange={handleVaccineEntryChange}
              onToggleVaccine={handleVaccineToggle}
              onNotesChange={setConsultationNotes}
            />
          </FormSection>
        )}

        {!isFollowUp && !patientGateLocked && !usesCareDecisionStep && isImmunization && (
          <FormSection
            title="Patient Monitoring"
            subtitle="Set the immunization visit outcome and follow-up schedule if another dose is needed."
            icon={<HeartPulse size={14} />}
            delay={3}
          >
            <div
              className={`grid gap-4 ${
                showFollowUpMonitoringFields ? "lg:grid-cols-3" : "lg:grid-cols-2"
              }`}
            >
              <FieldSelect
                label="Patient Status"
                value={followUpStatus}
                onChange={(event) => handlePatientStatusChange(event.target.value)}
              >
                <option>Routine Monitoring</option>
                <option>Follow-up Required</option>
                <option>Completed</option>
              </FieldSelect>
              {showFollowUpMonitoringFields && (
                <FieldInput
                  label="Follow-up Date"
                  type="date"
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
              )}
              {showFollowUpMonitoringFields && (
                <FieldSelect
                  label="Current Condition"
                  value={patientCondition}
                  onChange={(event) => setPatientCondition(event.target.value)}
                  required
                >
                  <option value="">Select condition</option>
                  <option>Improving</option>
                  <option>Stable</option>
                  <option>No Improvement Observed</option>
                  <option>Needs Further Review</option>
                  <option>Recovered</option>
                </FieldSelect>
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
        )}

        {!isFollowUp && !patientGateLocked && isMaternal && !selectedPatientIsMale && (
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

        {!isFollowUp && !isImmunization && (
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

        {!isFollowUp && !isImmunization && (
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
              title="Patient Monitoring"
              subtitle="Track patient progress and follow-up schedules."
              icon={<HeartPulse size={14} />}
              delay={5}
            >
          <LockedFormContent locked={patientGateLocked}>
          <div
            className={`grid gap-4 ${
              showFollowUpMonitoringFields ? "lg:grid-cols-3" : "lg:grid-cols-2"
            }`}
          >
            <FieldSelect
              label="Patient Status"
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
                label="Follow-up Date"
                type="date"
                value={followUpDate}
                name="followUpDate"
                error={validationErrors.followUpDate}
                onChange={(event) => {
                  clearValidationError("followUpDate");
                  setFollowUpDate(event.target.value);
                }}
                required
              />
            )}
            {showFollowUpMonitoringFields && (
              <FieldSelect
                label="Current Condition"
                value={patientCondition}
                onChange={(event) => setPatientCondition(event.target.value)}
                required
              >
                <option value="">Select condition</option>
                <option>Improving</option>
                <option>Stable</option>
                <option>No Improvement Observed</option>
                <option>Needs Further Review</option>
                <option>Recovered</option>
              </FieldSelect>
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
                : usesCareDecisionStep
                  ? "Proceed to Care Decision"
                  : "Save Health Record"}
          </button>
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
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PATIENT SEARCH DROPDOWN
   ═══════════════════════════════════════════════════════════════ */
function HealthRecordSetupStep({
  selectedPatientId,
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
        {(errors.selectedPatientId || errors.healthRecordType) && (
          <ValidationAlert />
        )}

        <div
          className={`relative z-30 rounded-xl border p-4 ${
            errors.selectedPatientId
              ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
              : "border-[#E8ECF0] bg-[#FAFBFC]"
          }`}
          data-field="selectedPatientId"
          tabIndex={errors.selectedPatientId ? -1 : undefined}
        >
          <PatientSearchDropdown {...patientSearchProps} />
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
            Choose Classification
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">
            The selected card controls which clinical fields appear next.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {RECORD_TYPE_OPTIONS.map((option) => (
              <ClassificationCard
                key={option}
                option={option}
                selected={normalizedClassification === option}
                onSelect={() => onClassificationSelect(option)}
              />
            ))}
          </div>
          {errors.healthRecordType && (
            <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">
              {errors.healthRecordType}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#F3F4F6] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-[#94A3B8]">
            {canProceed
              ? "Ready to continue to the clinical record."
              : "Select a patient and classification to continue."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onProceed}
              disabled={!canProceed}
              className="rounded-xl bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClassificationCard({ option, selected, onSelect }) {
  const config = RECORD_TYPE_DETAILS[option] || {};
  const Icon = config.icon || Stethoscope;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex min-h-[112px] rounded-xl border p-3.5 text-left shadow-sm transition-all duration-200 ${
        selected
          ? "border-[#FCA5A5] bg-[#FEF2F2] shadow-[#B91C1C]/10 ring-2 ring-[#B91C1C]/10"
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
            {option}
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
        {(errors.followUpStatus || errors.followUpDate) && <ValidationAlert />}
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
              Patient Status
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

        <div className="mt-6 flex justify-end border-t border-[#F3F4F6] pt-4">
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
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-100 ${
                      isHighlighted
                        ? "bg-[#B91C1C]/[0.06]"
                        : isSelected
                          ? "bg-red-50"
                          : "hover:bg-[#FAFBFC]"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                        isSelected
                          ? "bg-[#B91C1C] text-white"
                          : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {getPatientInitial(patient)}
                    </div>

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
  const borderClass = accent === "pink" ? "border-t-2 border-t-pink-600" : "";

  return (
    <div
      className={`anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm ${borderClass}`}
      style={stagger(delay)}
    >
      <div className="flex items-center gap-2.5 border-b border-[#F3F4F6] pb-4">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent === "pink"
              ? "bg-pink-50 text-pink-600"
              : "bg-red-50 text-[#B91C1C]"
          }`}
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
      <div className="mt-5">{children}</div>
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
  feedingStatus,
  consultationNotes,
  errors = {},
  onFeedingStatusChange,
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
              <label
                key={vaccineName}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  checked
                    ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                    : "border-[#E8ECF0] bg-white text-[#475569] hover:border-[#D1D5DB]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onToggleVaccine(vaccineName, event.target.checked)
                  }
                  className="h-4 w-4 rounded border-[#D1D5DB] text-[#B91C1C] focus:ring-[#B91C1C]"
                />
                <span>{vaccineName}</span>
              </label>
            );
          })}
        </div>

        {entries.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#E5E7EB] bg-white px-4 py-3 text-xs text-[#64748B]">
            Select at least one vaccine given during this visit.
          </p>
        ) : (
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

      <div className="max-w-sm">
        <FieldSelect
          label="Feeding Status"
          value={feedingStatus}
          onChange={(event) => onFeedingStatusChange(event.target.value)}
        >
          <option value="">Select status</option>
          <option>Breastfeeding</option>
          <option>Formula Milk</option>
          <option>Mixed Feeding</option>
        </FieldSelect>
      </div>

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
function ValidationAlert() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-[#B91C1C]">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <p className="text-xs font-medium">
        Please complete the highlighted required fields.
      </p>
    </div>
  );
}

function FieldInput({ label, required, error, className = "", ...props }) {
  const inputClass = error
    ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
    : "border-[#E8ECF0] bg-[#FAFBFC] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full rounded-xl border px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60 ${inputClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>
      )}
    </div>
  );
}

function FieldSelect({ label, required, error, children, className = "", ...props }) {
  const selectClass = error
    ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
    : "border-[#E8ECF0] bg-[#FAFBFC] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full appearance-none rounded-xl border px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${selectClass} ${className}`}
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
    ? "border-[#B91C1C] bg-[#FEF2F2]/40 ring-2 ring-[#B91C1C]/10"
    : "border-[#E8ECF0] bg-[#FAFBFC] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10";

  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        {...props}
        aria-invalid={Boolean(error)}
        rows={rows}
        className={`w-full resize-none rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] ${textareaClass} ${className}`}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>
      )}
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
          className="h-10 w-full rounded-l-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border-y border-[#E8ECF0] bg-[#F3F4F6] text-sm font-bold text-[#6B7280]">
          /
        </div>
        <input
          type="number"
          placeholder="Diastolic"
          value={diastolic}
          onChange={(event) => onDiastolicChange(event.target.value)}
          className="h-10 w-full rounded-r-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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

function getPatientInitial(patient = {}) {
  return getPatientName(patient).charAt(0).toUpperCase() || "P";
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

