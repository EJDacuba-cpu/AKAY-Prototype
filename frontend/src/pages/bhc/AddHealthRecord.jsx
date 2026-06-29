import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
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
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import InlineSpinner from "../../components/common/loading/InlineSpinner";
import healthRecordService, {
  getHealthRecordById,
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

const MATERNAL_SUPPLEMENT_OPTIONS = [
  {
    type: "iron_folic_acid",
    name: "Iron-Folic Acid",
    note: "Record IFA actually given during this visit.",
  },
  {
    type: "calcium_carbonate",
    name: "Calcium Carbonate",
    note: "Record if calcium was provided.",
  },
  {
    type: "iodine_supplement",
    name: "Iodine Supplement",
    note: "Record if applicable for this patient.",
  },
  {
    type: "vitamin_a",
    name: "Vitamin A",
    note: "Record postpartum vitamin A if given.",
  },
  {
    type: "other",
    name: "Other",
    note: "Use for any other supplement provided.",
  },
];

const MATERNAL_SUPPLEMENT_UNITS = [
  "tablets",
  "capsules",
  "dose",
  "bottle",
  "sachet",
  "other",
];

const EMPTY_SUPPLEMENT_ENTRY = {
  supplement_type: "",
  supplement_name: "",
  quantity: "",
  unit: "",
  date_given: "",
  remarks: "",
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

function normalizeSupplementEntries(data = {}) {
  const supplements = Array.isArray(data?.supplements_given)
    ? data.supplements_given
    : Array.isArray(data?.supplementsGiven)
      ? data.supplementsGiven
      : [];

  return supplements
    .filter(Boolean)
    .map((entry) => ({
      ...EMPTY_SUPPLEMENT_ENTRY,
      supplement_type: entry.supplement_type || entry.supplementType || "",
      supplement_name: entry.supplement_name || entry.supplementName || "",
      quantity: entry.quantity || "",
      unit: entry.unit || "",
      date_given: entry.date_given || entry.dateGiven || "",
      remarks: entry.remarks || entry.notes || "",
      given_by_id: entry.given_by_id || entry.givenById || "",
      given_by_name: entry.given_by_name || entry.givenByName || "",
    }));
}

function getSupplementOption(type) {
  return MATERNAL_SUPPLEMENT_OPTIONS.find((option) => option.type === type);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
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
  const [healthRecordType, setHealthRecordType] = useState("");

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

  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [supplementsGiven, setSupplementsGiven] = useState([]);
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
    if (currentUserName && !attendingStaff) {
      setAttendingStaff(currentUserName);
    }
  }, [currentUserName, attendingStaff]);

  useEffect(() => {
    if (!recordId) return;

    async function loadExistingRecord() {
      const found = await getHealthRecordById(recordId, "bhc");
      if (found?.patientId) setSelectedPatientId(found.patientId);

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
      setSystolicBp(found.systolicBp || "");
      setDiastolicBp(found.diastolicBp || "");
      setTemp(found.temperature || found.temp || "");
      setPulse(found.pulseRate || found.pulse || "");
      setWeight(found.weight || "");
      setHeight(found.height || "");
      setFollowUpStatus(normalizePatientStatus(found.followUpStatus));
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
      setSupplementsGiven(normalizeSupplementEntries(existingMaternalData));
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
  }, [recordId, isEditingRecord]);

  useEffect(() => {
    async function loadFollowUpPreview() {
      if (!isFollowUp) {
        setFollowUpRecord(null);
        return;
      }

      const found = (await getHealthRecordById(recordId, "bhc")) || null;
      setFollowUpRecord(found);
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
    setSupplementsGiven([]);
    setExpectedDeliveryDate("");
    setAog("");
    setImmunizationData(EMPTY_IMMUNIZATION_DATA);
  }

  function selectPatient(id) {
    if (id !== selectedPatientId) {
      resetClassificationSpecificState();
    }
    setSelectedPatientId(id);
    setSearchTerm("");
    setDropdownOpen(false);
    setHighlightIndex(-1);
  }

  function clearSelectedPatient() {
    setSelectedPatientId("");
    resetClassificationSpecificState();
    setSearchTerm("");
    setDropdownOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handlePatientSearchChange(event) {
    if (selectedPatientId) {
      setSelectedPatientId("");
      resetClassificationSpecificState();
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
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
  const showFollowUpMonitoringFields =
    normalizedPatientStatus === "Follow-up Required";
  const immunizationPatientInfo = useMemo(
    () => getImmunizationPatientMode(selectedPatient, dateOfVisit),
    [selectedPatient, dateOfVisit],
  );
  const immunizationVaccineEntries = useMemo(
    () => getVaccineEntries(immunizationData),
    [immunizationData],
  );

  const formattedBp = (() => {
    const sys = systolicBp || "N/A";
    const dia = diastolicBp || "N/A";
    return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
  })();

  const concatenatedVitalSigns = `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | Pulse: ${
    pulse || "N/A"
  } bpm | Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;

  function handleClassificationChange(event) {
    const nextType = event.target.value;
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

    setHealthRecordType(nextType);
  }

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

  function handlePatientStatusChange(value) {
    const normalizedStatus = normalizePatientStatus(value);
    setFollowUpStatus(normalizedStatus);
    if (normalizedStatus !== "Follow-up Required") {
      setFollowUpDate("");
      if (!isFollowUp) setPatientCondition("");
    }
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

  function handleVaccineChange(field, value) {
    setImmunizationData((prev) => {
      return { ...prev, [field]: value };
    });
  }

  function handleVaccineEntryChange(index, field, value) {
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
    setMaternalData((prev) => ({ ...prev, [field]: value }));
  }

  function handleSupplementToggle(type, checked) {
    const option = getSupplementOption(type);
    setSupplementsGiven((prev) => {
      if (!checked) {
        return prev.filter((entry) => entry.supplement_type !== type);
      }

      if (prev.some((entry) => entry.supplement_type === type)) return prev;

      return [
        ...prev,
        {
          ...EMPTY_SUPPLEMENT_ENTRY,
          supplement_type: type,
          supplement_name: type === "other" ? "" : option?.name || "",
          date_given: dateOfVisit,
        },
      ];
    });
  }

  function handleSupplementChange(type, field, value) {
    setSupplementsGiven((prev) =>
      prev.map((entry) =>
        entry.supplement_type === type ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function getPreparedSupplements() {
    return supplementsGiven.map((entry) => {
      const option = getSupplementOption(entry.supplement_type);
      return {
        supplement_type: entry.supplement_type,
        supplement_name:
          entry.supplement_type === "other"
            ? String(entry.supplement_name || "").trim()
            : option?.name || entry.supplement_name,
        quantity: entry.quantity,
        unit: entry.unit,
        date_given: entry.date_given || dateOfVisit,
        remarks: entry.remarks || "",
      };
    });
  }

  function validatePreparedSupplements(entries) {
    const invalidEntry = entries.find((entry) => {
      const quantity = Number(entry.quantity);
      return (
        !entry.supplement_type ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !entry.unit ||
        !entry.date_given ||
        (entry.supplement_type === "other" && !entry.supplement_name)
      );
    });

    if (!invalidEntry) return null;

    return invalidEntry.supplement_type === "other" &&
      !invalidEntry.supplement_name
      ? "Enter the supplement name for Other."
      : "Complete quantity, unit, and date given for each selected supplement.";
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

    return { savedRecord, savedId };
  }

  async function handleSave(event) {
    event.preventDefault();

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
      setNoticeModal({
        title: "Patient Required",
        message: isFollowUp
          ? "Patient is still loading. Try again."
          : "Select patient first.",
      });
      requestAnimationFrame(() => inputRef.current?.focus());
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
      setNoticeModal({
        title: "Classification Required",
        message: "Select classification.",
      });
      return;
    }

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
        setNoticeModal({
          title: "Vaccine Required",
          message: "Select at least one vaccine.",
        });
        return;
      }

      if (missingRequiredVaccineDetails) {
        setNoticeModal({
          title: "Vaccine Details Required",
          message:
            "Complete vaccine name, dose, and date.",
        });
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
      setNoticeModal({
        title: "Follow-up Date Required",
        message:
          "Please enter a follow-up date or next schedule date for Follow-up Required status.",
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

    const preparedSupplements =
      !isFollowUp && effectiveHealthRecordType === "Maternal"
        ? getPreparedSupplements()
        : [];
    const supplementValidationMessage =
      validatePreparedSupplements(preparedSupplements);

    if (supplementValidationMessage) {
      setNoticeModal({
        title: "Supplement Details Required",
        message: supplementValidationMessage,
      });
      return;
    }

    const recordMaternalData = {
      ...maternalData,
      expectedDeliveryDate,
      aog,
      supplements_given: preparedSupplements,
      tpal: [
        maternalData.term || 0,
        maternalData.preterm || 0,
        maternalData.abortion || 0,
        maternalData.living || 0,
      ].join("-"),
    };

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
      vitalSigns: concatenatedVitalSigns,
      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      temperature: temp || null,
      pulseRate: pulse || null,
      weight: weight || null,
      height: height || null,
      medication,
      attendingStaff,
      consultationNotes,
      followUpStatus: normalizePatientStatus(followUpStatus),
      followUpDate: showFollowUpMonitoringFields ? effectiveFollowUpDate : "",
      monitoringNotes,
      patientCondition:
        isFollowUp || showFollowUpMonitoringFields ? patientCondition : "",
      needsReferral: "no",
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
      createdByRole: userRole,
      linkedTrackingId: isFollowUp ? followUpRecord?.linkedTrackingId || "" : "",
    };

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

      setSaveSuccess({
        recordId: savedRecordId,
        patientId: selectedPatientId,
        status: savedStatus,
        isFollowUp,
        isEditingRecord,
      });
    } catch (error) {
      console.error("Failed to save record:", error);
      setNoticeModal({
        title: "Save Failed",
        message:
          "Unable to save the health record. Please review the form and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const canCreateReferralAfterSave =
    saveSuccess?.recordId &&
    userRole === "bhc" &&
    !saveSuccess.isEditingRecord &&
    saveSuccess.status !== "Completed";
  const isPrimaryActionLoading = saving;
  const primaryActionLabel = saving
    ? "Saving..."
    : isFollowUp
      ? "Save Follow-up Visit"
      : "Save Health Record";
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

  return (
    <DashboardLayout role={userRole} title="Add Health Record">
      <style>{keyframes}</style>

      <div className="anim-fade-up mb-6" style={stagger(0)}>
        <Link
          to={healthRecordsPath}
          className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} /> Back to Health Records
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
          {isFollowUp
            ? "Follow-up Health Record"
            : isEditingRecord
              ? "Edit Health Record"
              : "Add Health Record"}
        </h1>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          {isFollowUp
            ? "Record what happened during the patient's scheduled return visit."
            : isEditingRecord
              ? "Correct or update details in this existing health record."
              : "Record a consultation, maternal record, immunization record, monitoring update, follow-up, or referral basis."}
        </p>
      </div>

      <form onSubmit={handleSave} className="relative space-y-5">
        {isFollowUp ? (
          <FollowUpContextCard
            patientName={followUpPatientName}
            patientId={followUpPatientId}
            recordId={recordId}
            record={followUpRecord}
          />
        ) : (
          <div
            className="anim-fade-up relative z-[90] w-full max-w-3xl"
            style={stagger(1)}
          >
            <PatientSearchDropdown
              inputRef={inputRef}
              dropdownRef={dropdownRef}
              disabled={isEditingRecord}
              dropdownOpen={dropdownOpen}
              selectedPatientId={selectedPatientId}
              selectedPatient={selectedPatient}
              searchTerm={searchTerm}
              inputValue={patientSearchInputValue}
              patients={filteredPatients}
              totalPatientCount={patients.length}
              matchingPatientCount={matchingPatients.length}
              visibleLimit={visiblePatientLimit}
              loading={patientsLoading && patients.length === 0}
              isSearching={Boolean(normalizedSearch)}
              onSeeAll={() => navigate("/bhc/patients")}
              highlightIndex={highlightIndex}
              onSearchChange={handlePatientSearchChange}
              onOpen={() => {
                if (isEditingRecord) return;
                setSearchTerm("");
                setDropdownOpen(true);
              }}
              onClear={clearSelectedPatient}
              onSelect={selectPatient}
              onHighlight={setHighlightIndex}
            />
          </div>
        )}

        <FormSection
          title="Visit Overview"
          subtitle="Confirm the visit type, classification, schedule, and attending practitioner."
          icon={<Clock size={14} />}
          delay={2}
        >
          <LockedFormContent locked={patientGateLocked}>
          <div className="grid gap-4 lg:grid-cols-5">
            <FieldInput label="Visit Type" value={visitTypeLabel} readOnly />
            {isFollowUp ? (
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
            ) : (
              <FieldSelect
                label="Classification"
                value={healthRecordType}
                ref={classificationRef}
                onChange={handleClassificationChange}
                required
              >
                <option value="">Select classification</option>
                {RECORD_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </FieldSelect>
            )}
            <FieldInput
              label="Date of Visit"
              type="date"
              required
              value={dateOfVisit}
              onChange={(event) => setDateOfVisit(event.target.value)}
            />
            <FieldInput
              label="Time of Visit"
              type="time"
              required
              value={timeOfVisit}
              onChange={(event) => setTimeOfVisit(event.target.value)}
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
                  value={summaryOfPresentIllness}
                  onChange={(event) =>
                    setSummaryOfPresentIllness(event.target.value)
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
            title="Child Immunization Details"
            subtitle="Select the vaccines given during this immunization visit."
            icon={<Syringe size={14} />}
            delay={2}
          >

            <ImmunizationVisitFields
              ageInfo={immunizationPatientInfo}
              entries={immunizationVaccineEntries}
              dateOfVisit={dateOfVisit}
              feedingStatus={immunizationData.feeding_status}
              consultationNotes={consultationNotes}
              onFeedingStatusChange={(value) =>
                handleVaccineChange("feeding_status", value)
              }
              onEntryChange={handleVaccineEntryChange}
              onToggleVaccine={handleVaccineToggle}
              onNotesChange={setConsultationNotes}
            />
          </FormSection>
        )}

        {!isFollowUp && !patientGateLocked && isImmunization && (
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
            <div className="mt-5">
              <MaternalSupplementsGivenFields
                entries={supplementsGiven}
                dateOfVisit={dateOfVisit}
                onToggle={handleSupplementToggle}
                onChange={handleSupplementChange}
              />
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
                value={chiefComplaint}
                onChange={(event) => setChiefComplaint(event.target.value)}
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
                value={summaryOfPresentIllness}
                onChange={(event) =>
                  setSummaryOfPresentIllness(event.target.value)
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

          </>
        )}

        <div
          className="anim-fade-up flex items-center justify-end gap-3 pt-1 pb-4"
          style={stagger(7)}
        >
          <button
            type="button"
            onClick={() => navigate(healthRecordsPath)}
            className="rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="submit"
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
      </form>

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
            : "The health record has been saved."
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
          ...(canCreateReferralAfterSave
            ? [
                {
                  label: "Create Referral if Needed",
                  onClick: () =>
                    navigate(
                      `/bhc/referrals/create?recordId=${saveSuccess.recordId}&patientId=${saveSuccess.patientId}`,
                    ),
                },
              ]
            : []),
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
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-100 ${
                      isHighlighted
                        ? "bg-[#FEF2F2]"
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
          value={record?.followUpStatus || record?.status || "Follow-up Required"}
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

/* ═══════════════════════════════════════════════════════════════
   FORM SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
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

function MaternalSupplementsGivenFields({
  entries,
  dateOfVisit,
  onToggle,
  onChange,
}) {
  const selectedEntries = new Map(
    entries.map((entry) => [entry.supplement_type, entry]),
  );

  return (
    <ClinicalFieldGroup title="Vitamins / Supplements Given" accent="pink">
      <div className="space-y-3">
        {MATERNAL_SUPPLEMENT_OPTIONS.map((option) => {
          const entry = selectedEntries.get(option.type);
          const checked = Boolean(entry);

          return (
            <div
              key={option.type}
              className={`rounded-xl border p-3 transition ${
                checked
                  ? "border-pink-200 bg-pink-50/50"
                  : "border-[#E8ECF0] bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onToggle(option.type, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#B91C1C] focus:ring-[#B91C1C]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#1F2937]">
                    {option.name}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#6B7280]">
                    {option.note}
                  </span>
                </span>
              </label>

              {checked && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {option.type === "other" && (
                    <div className="md:col-span-2 xl:col-span-4">
                      <FieldInput
                        label="Supplement Name"
                        value={entry.supplement_name}
                        onChange={(event) =>
                          onChange(
                            option.type,
                            "supplement_name",
                            event.target.value,
                          )
                        }
                        required
                      />
                    </div>
                  )}
                  <FieldInput
                    label="Quantity Given"
                    type="number"
                    min="1"
                    value={entry.quantity}
                    onChange={(event) =>
                      onChange(option.type, "quantity", event.target.value)
                    }
                    required
                  />
                  <FieldSelect
                    label="Unit"
                    value={entry.unit}
                    onChange={(event) =>
                      onChange(option.type, "unit", event.target.value)
                    }
                    required
                  >
                    <option value="">Select unit</option>
                    {MATERNAL_SUPPLEMENT_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </FieldSelect>
                  <FieldInput
                    label="Date Given"
                    type="date"
                    value={entry.date_given || dateOfVisit}
                    onChange={(event) =>
                      onChange(option.type, "date_given", event.target.value)
                    }
                    required
                  />
                  <div className="md:col-span-2 xl:col-span-1">
                    <FieldTextarea
                      label="Remarks / Notes"
                      value={entry.remarks}
                      onChange={(event) =>
                        onChange(option.type, "remarks", event.target.value)
                      }
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ClinicalFieldGroup>
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
function FieldInput({ label, required, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function FieldSelect({ label, required, children, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        required={required}
        className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

function FieldTextarea({ label, required, rows = 3, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        {...props}
        required={required}
        rows={rows}
        className="w-full resize-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
      />
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

