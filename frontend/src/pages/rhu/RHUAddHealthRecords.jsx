import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Baby,
  Check,
  ChevronDown,
  Clock,
  HeartPulse,
  Lock,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  User,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { SuccessModal } from "../../components/common";
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

/* ═══════════════════════════════════════════════════════════════
   IMMUNIZATION — CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
const VACCINE_FIELDS = [
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
];

const VACCINE_SERIES = {
  pentavalent: ["pentavalent_dose1", "pentavalent_dose2", "pentavalent_dose3"],
  opv: ["opv_dose1", "opv_dose2", "opv_dose3"],
  pcv: ["pcv_dose1", "pcv_dose2", "pcv_dose3"],
  ipv: ["ipv_dose1", "ipv_dose2"],
  mmr: ["mmr_dose1", "mmr_dose2"],
};

const VACCINE_TIMELINE = [
  {
    id: "birth",
    label: "At Birth",
    sublabel: "0 weeks",
    vaccines: [
      { field: "bcg_vaccine", label: "BCG Vaccine" },
      { field: "hepb_birth", label: "Hep B Birth Dose" },
    ],
  },
  {
    id: "week6",
    label: "6 Weeks",
    sublabel: "1.5 months",
    vaccines: [
      { field: "pentavalent_dose1", label: "Pentavalent Dose 1" },
      { field: "opv_dose1", label: "OPV Dose 1" },
      { field: "pcv_dose1", label: "PCV Dose 1" },
      { field: "ipv_dose1", label: "IPV Dose 1" },
    ],
  },
  {
    id: "week10",
    label: "10 Weeks",
    sublabel: "2.5 months",
    vaccines: [
      { field: "pentavalent_dose2", label: "Pentavalent Dose 2" },
      { field: "opv_dose2", label: "OPV Dose 2" },
      { field: "pcv_dose2", label: "PCV Dose 2" },
    ],
  },
  {
    id: "week14",
    label: "14 Weeks",
    sublabel: "3.5 months",
    vaccines: [
      { field: "pentavalent_dose3", label: "Pentavalent Dose 3" },
      { field: "opv_dose3", label: "OPV Dose 3" },
      { field: "pcv_dose3", label: "PCV Dose 3" },
      { field: "ipv_dose2", label: "IPV Dose 2" },
    ],
  },
  {
    id: "month9",
    label: "9 Months",
    sublabel: "36 weeks",
    vaccines: [{ field: "mmr_dose1", label: "MMR Dose 1" }],
  },
  {
    id: "month12",
    label: "12–15 Months",
    sublabel: "Catch-up",
    vaccines: [{ field: "mmr_dose2", label: "MMR Dose 2" }],
  },
];

function isVaccineEligible(field, data) {
  for (const seriesFields of Object.values(VACCINE_SERIES)) {
    const index = seriesFields.indexOf(field);
    if (index === -1) continue;
    return seriesFields
      .slice(0, index)
      .every((previousField) => data[previousField]);
  }
  return true;
}

function getTimelineOrder(field) {
  for (
    let groupIndex = 0;
    groupIndex < VACCINE_TIMELINE.length;
    groupIndex += 1
  ) {
    const vaccineIndex = VACCINE_TIMELINE[groupIndex].vaccines.findIndex(
      (vaccine) => vaccine.field === field,
    );
    if (vaccineIndex !== -1) return groupIndex * 100 + vaccineIndex;
  }
  return -1;
}

function getVaccineStatus(field, data) {
  if (data[field]) return "administered";
  if (!isVaccineEligible(field, data)) return "locked";

  const currentOrder = getTimelineOrder(field);
  const hasLaterChecked = VACCINE_TIMELINE.some((group) =>
    group.vaccines.some(
      (vaccine) =>
        getTimelineOrder(vaccine.field) > currentOrder && data[vaccine.field],
    ),
  );

  return hasLaterChecked ? "behind" : "upcoming";
}

function applyAutomation(data) {
  const next = { ...data };

  for (const seriesFields of Object.values(VACCINE_SERIES)) {
    const highestCheckedIndex = seriesFields.reduce(
      (highest, field, index) => (next[field] ? index : highest),
      -1,
    );

    if (highestCheckedIndex > 0) {
      for (let i = 0; i < highestCheckedIndex; i += 1) {
        next[seriesFields[i]] = true;
      }
    }
  }

  return next;
}

function getNextInSchedule(data) {
  for (const group of VACCINE_TIMELINE) {
    for (const vaccine of group.vaccines) {
      if (getVaccineStatus(vaccine.field, data) === "behind") {
        return { ...vaccine, groupLabel: group.label, priority: "behind" };
      }
    }
  }

  for (const group of VACCINE_TIMELINE) {
    for (const vaccine of group.vaccines) {
      if (getVaccineStatus(vaccine.field, data) === "upcoming") {
        return { ...vaccine, groupLabel: group.label, priority: "upcoming" };
      }
    }
  }

  return null;
}

function isFIC(data) {
  return VACCINE_FIELDS.every((field) => data[field]);
}

function getImmunizationStats(data) {
  const completed = VACCINE_FIELDS.filter((field) => data[field]).length;
  const total = VACCINE_FIELDS.length;
  const remaining = total - completed;
  const pct = Math.round((completed / total) * 100);
  return { completed, remaining, total, pct };
}

function normalizePatientStatus(status) {
  const value = String(status || "").trim();

  if (["Follow-up", "Follow Up", "Follow-up Required"].includes(value)) {
    return "Follow-up Required";
  }

  if (["Completed", "Complete", "Recovered", "Closed"].includes(value)) {
    return "Completed";
  }

  if (
    ["For Monitoring", "Active", "Monitoring", "For Referral"].includes(value)
  ) {
    return "Routine Monitoring";
  }

  return value || "Routine Monitoring";
}

function getTimelineNodeStatus(group, data) {
  const statuses = group.vaccines.map((vaccine) =>
    getVaccineStatus(vaccine.field, data),
  );
  if (statuses.every((status) => status === "administered")) return "completed";
  if (statuses.some((status) => status === "administered"))
    return "in-progress";
  return "pending";
}

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

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
  const showFollowUpMonitoringFields =
    normalizePatientStatus(followUpStatus) === "Follow-up Required";
  const normalizedPatientStatus = normalizePatientStatus(followUpStatus);
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

  function handleClassificationChange(event) {
    const nextType = event.target.value;
    const normalizedNextType = normalizeRecordType(nextType);

    if (patientGateLocked) {
      setNoticeModal({
        title: "Patient Required",
        message: "Please select a patient before choosing a classification.",
      });
      return;
    }

    if (normalizedNextType === "Maternal" && selectedPatientIsMale) {
      resetClassificationSpecificState();
      setNoticeModal({
        title: "Invalid Classification",
        message:
          "Maternal records are for pregnancy or prenatal consultations. This patient is recorded as male. Please choose another classification.",
      });
      return;
    }

    setHealthRecordType(nextType);
  }

  const immunizationFIC = useMemo(
    () => isFIC(immunizationData),
    [immunizationData],
  );

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
    setImmunizationData((prev) => {
      const updated = { ...prev, [field]: value };
      return typeof value === "boolean" ? applyAutomation(updated) : updated;
    });
  }

  function handleMaternalChange(field, value) {
    setMaternalData((prev) => ({ ...prev, [field]: value }));
  }

  function handlePatientStatusChange(value) {
    const normalizedStatus = normalizePatientStatus(value);
    setFollowUpStatus(normalizedStatus);

    if (normalizedStatus !== "Follow-up Required") {
      setFollowUpDate("");
      if (!isFollowUp) setPatientCondition("");
    }
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
          ? "The original health record is still loading its patient. Please wait a moment and try again."
          : "Please select a patient before saving the health record.",
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
        message: "Please select a classification.",
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
        followUpDate: showFollowUpMonitoringFields ? followUpDate : "",
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
        immunizationData,
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

      setSaveSuccess({
        recordId: savedId || recordId || "",
        patientId: selectedPatientId,
        status: finalPatientStatus,
        isFollowUp,
      });
    } catch (error) {
      console.error("Failed to save RHU health record:", error);
      setNoticeModal({
        title: "Save Failed",
        message:
          "Unable to save the health record. Please review the form and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

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
              ? "Correct or update details in this existing RHU health record."
              : "Record a consultation, maternal record, immunization record, monitoring update, or follow-up for RHU patients."}
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
          <div className="relative z-[90]">
            <FormSection
              title="Patient Selection"
              subtitle="Search and select an existing patient profile from the registry."
              icon={<User size={14} />}
              delay={1}
            >
              <PatientSearchDropdown
                inputRef={inputRef}
                dropdownRef={dropdownRef}
                disabled={false}
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
                onSeeAll={() => navigate("/rhu/patients")}
                highlightIndex={highlightIndex}
                onSearchChange={handlePatientSearchChange}
                onOpen={() => {
                  setSearchTerm("");
                  setDropdownOpen(true);
                }}
                onClear={clearSelectedPatient}
                onSelect={selectPatient}
                onHighlight={setHighlightIndex}
              />
            </FormSection>
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
            title="Classification-Specific Assessment"
            subtitle="Immunization record tracker for vaccine schedule entries."
            icon={<Syringe size={14} />}
            delay={2}
          >
            <ClassificationSectionIntro
              title="Immunization Record Tracker"
              description="Record vaccine schedule details for this immunization visit."
            />
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <ImmunizationSummaryCard data={immunizationData} />
              {immunizationFIC ? (
                <FICCard />
              ) : (
                <ScheduleStatusPanel data={immunizationData} />
              )}
            </div>

            <div className="mb-6 max-w-sm">
              <FieldSelect
                label="Feeding Status"
                value={immunizationData.feeding_status}
                onChange={(event) =>
                  handleVaccineChange("feeding_status", event.target.value)
                }
              >
                <option value="">Select status</option>
                <option>Breastfeeding</option>
                <option>Formula Milk</option>
                <option>Mixed Feeding</option>
              </FieldSelect>
            </div>

            <div className="rounded-2xl border border-[#F0F0F0] bg-[#FCFCFC] p-5">
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-50">
                  <Syringe size={11} className="text-[#B91C1C]" />
                </div>
                <div>
                  <h3 className="text-[11px] font-bold tracking-wide text-[#1F2937]">
                    Vaccine Schedule
                  </h3>
                  <p className="text-[9px] text-[#C9C9C9]">
                    Based on the standard immunization schedule
                  </p>
                </div>
              </div>
              <VaccineTimeline
                data={immunizationData}
                onChange={handleVaccineChange}
              />
            </div>

            <p className="mt-3 text-center text-[9px] text-[#D4D4D4]">
              <Lock size={8} className="mr-1 inline-block -mt-px" />
              Checking a higher dose automatically fills in previous doses in
              the same series.
            </p>

            <div className="mt-5">
              <FieldTextarea
                label="Remarks / Notes"
                value={consultationNotes}
                onChange={(event) => setConsultationNotes(event.target.value)}
                placeholder="Write immunization notes, guardian remarks, or post-vaccination observations..."
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
      </form>
      <SuccessModal
        open={Boolean(saveSuccess)}
        title={
          saveSuccess?.isFollowUp
            ? "Follow-up Visit Saved"
            : "Health Record Saved Successfully"
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
                  onClick={() => setNoticeModal(null)}
                  className="rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
                >
                  OK
                </button>
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

      {selectedPatient && <SelectedPatientPreview patient={selectedPatient} />}
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
function StatusChip({ status, compact }) {
  const map = {
    administered: {
      label: "Administered",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: <Check size={compact ? 8 : 9} strokeWidth={3} />,
    },
    upcoming: {
      label: "Upcoming",
      bg: "bg-amber-50",
      text: "text-amber-700",
      icon: <Clock size={compact ? 8 : 9} />,
    },
    behind: {
      label: "Behind Schedule",
      bg: "bg-red-50",
      text: "text-red-600",
      icon: <X size={compact ? 8 : 9} strokeWidth={3} />,
    },
    locked: {
      label: "Not Yet Available",
      bg: "bg-gray-100",
      text: "text-gray-400",
      icon: <Lock size={compact ? 8 : 9} />,
    },
  };
  const config = map[status];
  if (!config) return null;
  const size = compact
    ? "rounded-md px-1.5 py-0.5 text-[9px]"
    : "rounded-lg px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${config.bg} ${config.text} ${size}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function ImmunizationSummaryCard({ data }) {
  const stats = getImmunizationStats(data);
  const nextItem = getNextInSchedule(data);
  const fic = isFIC(data);

  return (
    <div className="rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            Immunization Record Summary
          </h3>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#1F2937]">
              {stats.completed}
            </span>{" "}
            vaccine
            {stats.completed !== 1 ? "s" : ""} recorded
            <span className="mx-1.5 text-[#D4D4D4]">·</span>
            <span className="font-semibold text-[#1F2937]">
              {stats.remaining}
            </span>{" "}
            in schedule
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
          <Baby size={18} className="text-[#B91C1C]" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Vaccine Count
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${fic ? "text-emerald-600" : "text-[#B91C1C]"}`}
          >
            {stats.completed} of {stats.total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${fic ? "bg-emerald-500" : "bg-[#B91C1C]"}`}
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </div>

      {nextItem && !fic && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
          <Clock size={13} className="shrink-0 text-amber-600" />
          <p className="min-w-0 text-[11px] leading-snug text-amber-800">
            Next in schedule:{" "}
            <span className="font-bold">{nextItem.label}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function FICCard() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <ShieldCheck size={20} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-emerald-800">
            Fully Immunized Child
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-600">
            All {VACCINE_FIELDS.length} vaccines in the schedule have been
            recorded.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScheduleStatusPanel({ data }) {
  const nextItem = getNextInSchedule(data);
  if (!nextItem || isFIC(data)) return null;

  const isBehind = nextItem.priority === "behind";

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        isBehind
          ? "border-red-200 bg-red-50/40"
          : "border-amber-200 bg-amber-50/40"
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-lg ${
            isBehind ? "bg-red-100" : "bg-amber-100"
          }`}
        >
          {isBehind ? (
            <X size={12} className="text-red-600" strokeWidth={3} />
          ) : (
            <Clock size={12} className="text-amber-700" />
          )}
        </div>
        <h4
          className={`text-[10px] font-bold uppercase tracking-widest ${
            isBehind ? "text-red-700" : "text-amber-800"
          }`}
        >
          {isBehind ? "Behind Schedule" : "Next in Schedule"}
        </h4>
      </div>
      <p
        className={`text-sm font-bold ${isBehind ? "text-red-900" : "text-amber-900"}`}
      >
        {nextItem.label}
      </p>
      <p
        className={`mt-1 text-xs leading-relaxed ${isBehind ? "text-red-700" : "text-amber-700"}`}
      >
        {isBehind
          ? "A later vaccine in this series was recorded without this dose. Please verify with the immunization card."
          : `Scheduled at ${nextItem.groupLabel}.`}
      </p>
    </div>
  );
}

function SmartVaccineCheckbox({
  label,
  field,
  checked,
  status,
  isNext,
  isBehind,
  onChange,
}) {
  const isLocked = status === "locked";

  return (
    <button
      type="button"
      onClick={() => !isLocked && onChange(field, !checked)}
      disabled={isLocked}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200
        ${isNext ? "anim-pulse-next border border-amber-200 bg-amber-50/70" : ""}
        ${isBehind && !isNext ? "border border-red-200 bg-red-50/50" : ""}
        ${checked && !isNext && !isBehind ? "bg-emerald-50/40" : ""}
        ${!checked && !isNext && !isBehind ? "bg-[#FAFAFA] hover:bg-[#F5F5F5]" : ""}
        ${isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        ${!isNext && !isBehind ? "border border-transparent" : ""}
      `}
    >
      <div
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
          checked
            ? "border-[#B91C1C] bg-[#B91C1C]"
            : "border-[#D4D4D4] bg-white group-hover:border-[#BFBFBF]"
        }`}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span
        className={`min-w-0 flex-1 text-xs font-medium ${checked ? "text-[#991B1B]" : "text-[#6B7280]"}`}
      >
        {label}
      </span>
      <StatusChip status={status} compact />
      {isNext && (
        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-amber-700">
          Next
        </span>
      )}
      {isBehind && !isNext && (
        <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-red-700">
          Behind
        </span>
      )}
    </button>
  );
}

function VaccineTimelineNode({ group, data, nextField, onChange }) {
  const nodeStatus = getTimelineNodeStatus(group, data);
  const doneCount = group.vaccines.filter(
    (vaccine) => data[vaccine.field],
  ).length;
  const totalCount = group.vaccines.length;

  const dotStyles = {
    completed: "border-emerald-500 bg-emerald-500",
    "in-progress": "border-amber-500 bg-amber-500",
    pending: "border-[#D4D4D4] bg-white",
  };

  const nodeChip = {
    completed: {
      label: "Completed",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    "in-progress": {
      label: `${doneCount}/${totalCount}`,
      bg: "bg-amber-50",
      text: "text-amber-700",
    },
    pending: { label: "Pending", bg: "bg-gray-100", text: "text-gray-400" },
  };
  const chip = nodeChip[nodeStatus];

  return (
    <div className="relative pb-7 last:pb-0">
      <div
        className={`absolute left-[-22px] top-[8px] h-3 w-3 rounded-full border-2 transition-colors duration-300 ${dotStyles[nodeStatus]}`}
      />
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-xs font-bold tracking-wide text-[#1F2937]">
          {group.label}
        </h3>
        <span className="text-[10px] font-medium text-[#C9C9C9]">
          {group.sublabel}
        </span>
        <span
          className={`ml-auto rounded-lg px-2 py-0.5 text-[10px] font-semibold ${chip.bg} ${chip.text}`}
        >
          {chip.label}
        </span>
      </div>
      <div className="space-y-1.5">
        {group.vaccines.map((vaccine) => {
          const status = getVaccineStatus(vaccine.field, data);
          return (
            <SmartVaccineCheckbox
              key={vaccine.field}
              label={vaccine.label}
              field={vaccine.field}
              checked={data[vaccine.field]}
              status={status}
              isNext={vaccine.field === nextField}
              isBehind={status === "behind"}
              onChange={onChange}
            />
          );
        })}
      </div>
    </div>
  );
}

function VaccineTimeline({ data, onChange }) {
  const nextItem = getNextInSchedule(data);
  const nextField = nextItem?.field || null;

  return (
    <div className="relative ml-1 pl-6">
      <div className="absolute left-[-0.5px] top-2 bottom-2 w-px bg-[#E8ECF0]" />
      {VACCINE_TIMELINE.map((group) => (
        <VaccineTimelineNode
          key={group.id}
          group={group}
          data={data}
          nextField={nextField}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

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

