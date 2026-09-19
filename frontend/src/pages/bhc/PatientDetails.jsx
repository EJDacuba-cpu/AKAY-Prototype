import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Pencil,
  Plus,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ConnectionErrorState,
  RefreshingIndicator,
  SoftLoadingArea,
  StatusBadge,
  SuccessModal,
} from "../../components/common";
import SpecializedRecordsTab from "../../components/features/records/SpecializedRecordsTab";
import PatientOverviewTab from "../../components/features/patients/PatientOverviewTab";
import PatientBackgroundTab, {
  BACKGROUND_SECTIONS,
} from "../../components/features/patients/PatientBackgroundTab";
import PatientProgramTab from "../../components/features/patients/PatientProgramTab";
import PatientIdentityCard from "../../components/features/patients/PatientIdentityCard";
import { getConditionalProgramTabs } from "../../utils/programApplicability";
import { buildRecordFollowUpVisitPath } from "../../components/features/followups/followUpStatusStyles.jsx";
import { getLatestBmiRecord } from "../../utils/bmi";
import { isConnectionError } from "../../services/apiClient";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import {
  getPatientById,
  getPatientHealthRecords,
  getPatientReferrals,
  getPatientDetailsListByRole,
  updatePatient,
  updatePatientMedicalBackground,
} from "../../services/patientService";
import {
  formatDate,
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../utils/formatters";
import {
  getRecordIdLabel,
  getRecordVisitTypeLabel,
  getServiceTypeLabel,
  getSpecializedRecordPrograms,
  isFollowUpVisitRecord,
} from "../../utils/healthRecordPrograms";
import RecordOutcomeBadge from "../../components/features/records/RecordOutcomeBadge";
import {
  calculateAgeInMonths,
  normalizePhilippineContact,
} from "../../utils/patientUtils";
import { queryKeys } from "../../utils/queryKeys";

const BULAKAN_BARANGAYS = [
  "Bagumbayan",
  "Balubad",
  "Bambang",
  "Matungao",
  "Maysantol",
  "Perez",
  "Pitpitan",
  "San Francisco",
  "San Jose",
  "San Nicolas",
  "Santa Ana",
  "Santa Ines",
  "Taliptip",
  "Tibig",
];

const TAB_LABELS = {
  overview: "Overview",
  information: "Patient Information",
  records: "Health Records",
  referrals: "Referrals & Follow-ups",
};

export default function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [patientOverride, setPatientOverride] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [savingBackground, setSavingBackground] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [motherSearch, setMotherSearch] = useState("");

  const {
    data: patientData,
    isLoading: patientLoading,
    isFetching: patientFetching,
    error: patientError,
    refetch: refetchPatient,
  } = useQuery({
    queryKey: queryKeys.patientDetails("bhc", patientId),
    queryFn: () => getPatientById(patientId),
    enabled: Boolean(patientId),
    retry: false,
  });

  const {
    data: recordsData = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    error: recordsError,
    refetch: refetchRecords,
  } = useQuery({
    queryKey: [...queryKeys.healthRecords("bhc"), "patient", patientId],
    queryFn: () => getPatientHealthRecords(patientId),
    enabled: Boolean(patientId),
    retry: false,
  });

  const {
    data: referralsData = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery({
    queryKey: [...queryKeys.referrals("bhc"), "patient", patientId],
    queryFn: () => getPatientReferrals(patientId),
    enabled: Boolean(patientId),
    retry: false,
  });

  const {
    data: followUpTasksData = [],
    isFetching: followUpsFetching,
    error: followUpsError,
    refetch: refetchFollowUps,
  } = useQuery({
    queryKey: queryKeys.followUpTasks("bhc"),
    queryFn: () => getFollowUpTasks(),
    enabled: Boolean(patientId),
    staleTime: 30_000,
    retry: false,
  });

  const {
    data: registeredPatients = [],
    isFetching: registeredPatientsFetching,
    error: registeredPatientsError,
    refetch: refetchRegisteredPatients,
  } = useQuery({
    queryKey: queryKeys.patients("bhc"),
    queryFn: () => getPatientDetailsListByRole("bhc"),
    staleTime: 30_000,
    enabled: Boolean(patientId),
    retry: false,
  });

  const specializedRecordPrograms = useMemo(
    () => getSpecializedRecordPrograms(recordsData),
    [recordsData],
  );
  /**
   * Women's Health and Pediatric / EPI are shown when the patient is currently
   * applicable for the program OR already has records in it - so a closed
   * eligibility window never hides an existing chart.
   */
  const conditionalProgramTabs = useMemo(
    () => getConditionalProgramTabs(patientData, recordsData),
    [patientData, recordsData],
  );
  const conditionalProgramKeys = conditionalProgramTabs
    .map(({ key }) => key)
    .join("|");
  const specializedProgramKeys = specializedRecordPrograms
    .map(({ key }) => key)
    .join("|");

  useEffect(() => {
    if (activeTab.startsWith("specialized:")) {
      const programKey = activeTab.slice("specialized:".length);
      if (!specializedProgramKeys.split("|").includes(programKey)) {
        setActiveTab("overview");
      }
      return;
    }

    // A conditional area can disappear between loads (the records that kept it
    // visible were reassigned); fall back rather than render a blank tab.
    if (activeTab.startsWith("program:")) {
      const areaKey = activeTab.slice("program:".length);
      if (!conditionalProgramKeys.split("|").includes(areaKey)) {
        setActiveTab("overview");
      }
    }
  }, [activeTab, specializedProgramKeys, conditionalProgramKeys]);

  const overrideMatchesPatient =
    patientOverride &&
    String(patientOverride.id || patientOverride.patientId || "") ===
      String(patientId);
  const patient = overrideMatchesPatient
    ? patientOverride
    : patientData || null;
  const loadError =
    patientError ||
    recordsError ||
    referralsError ||
    followUpsError ||
    registeredPatientsError ||
    null;
  const retrying =
    patientFetching ||
    recordsFetching ||
    referralsFetching ||
    followUpsFetching ||
    registeredPatientsFetching;
  const patientUpdating = patientFetching && !patientLoading && Boolean(patient);

  function retryPatientDetails() {
    refetchPatient();
    refetchRecords();
    refetchReferrals();
    refetchFollowUps();
    refetchRegisteredPatients();
  }

  useEffect(() => {
    if (!patientData) return;
    setPatientOverride(patientData);
    setForm(createPatientForm(patientData));
    setFieldErrors({});
  }, [patientData]);

  useEffect(() => {
    setActiveTab("overview");
    setShowAllRecords(false);
    setShowAllReferrals(false);
    setIsEditing(false);
    setFieldErrors({});
    setOpenConfirm(false);
  }, [patientId]);

  function handleTabChange(tab) {
    if (isEditing) {
      setForm(createPatientForm(patient));
      setFieldErrors({});
      setOpenConfirm(false);
      setIsEditing(false);
    }
    setActiveTab(tab);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFieldErrors((current) => ({
      ...current,
      [name]: "",
      ...(name === "philHealthStatus" ? { philHealthNumber: "" } : {}),
    }));
    setForm((current) => {
      const next = {
        ...current,
        [name]:
          name === "contactNumber" ? normalizePhilippineContact(value) : value,
      };
      if (name === "birthDate") next.age = calculateAge(value);
      if (name === "philHealthStatus" && value !== "With PhilHealth") {
        next.philHealthNumber = "";
      }
      return next;
    });
  }

  function handleMotherPatientChange(value) {
    setFieldErrors((current) => ({
      ...current,
      motherName: "",
      motherPatientId: "",
    }));
    const selectedMother = registeredPatients.find(
      (item) => String(item.id) === String(value),
    );

    setForm((current) => ({
      ...current,
      motherPatientId: value,
      motherName: selectedMother
        ? selectedMother.fullName || selectedMother.name || current.motherName
        : current.motherName,
    }));
  }

  function handleStartGeneralEdit() {
    // Registration fields are owned by Patient Information, so the identity
    // card's Edit opens them there rather than editing a second copy here.
    setActiveTab("information");
    setForm(createPatientForm(patient));
    setFieldErrors({});
    setOpenConfirm(false);
    setIsEditing(true);
  }

  function handleCancelGeneralEdit() {
    if (saving) return;
    setForm(createPatientForm(patient));
    setFieldErrors({});
    setOpenConfirm(false);
    setIsEditing(false);
  }

  function validateInlineForm() {
    const nextErrors = {};
    const todayIso = getTodayIsoDate();
    const hasBirthDate = Boolean(form.birthDate);
    const ageYears = calculateAge(form.birthDate);
    const ageInMonths = calculateAgeInMonths(form.birthDate);
    const isChildRegistration =
      hasBirthDate && ageYears !== "" && Number(ageYears) < 18;
    const isEpiTargetAge =
      hasBirthDate && ageInMonths !== "" && Number(ageInMonths) <= 12;

    if (!String(form.firstName || "").trim()) {
      nextErrors.firstName = "First name is required.";
    }
    if (!String(form.lastName || "").trim()) {
      nextErrors.lastName = "Last name is required.";
    }
    if (!form.birthDate) {
      nextErrors.birthDate = "Date of Birth is required.";
    } else if (form.birthDate > todayIso) {
      nextErrors.birthDate = "Date of Birth cannot be in the future.";
    }
    if (!form.sex) nextErrors.sex = "Sex is required.";
    if (hasBirthDate && !isEpiTargetAge && !form.civilStatus) {
      nextErrors.civilStatus = "Civil status is required.";
    }
    if (
      form.philHealthStatus === "With PhilHealth" &&
      !String(form.philHealthNumber || "").trim()
    ) {
      nextErrors.philHealthNumber =
        "PhilHealth number is required if marked with PhilHealth.";
    }
    if (!String(form.streetAddress || "").trim()) {
      nextErrors.streetAddress = "Street address is required.";
    }
    if (!form.barangay) nextErrors.barangay = "Barangay is required.";
    if (!String(form.municipality || "").trim()) {
      nextErrors.municipality = "Municipality is required.";
    }
    if (isChildRegistration && !String(form.motherName || "").trim()) {
      nextErrors.motherName = "Mother name is required.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleRequestInlineSave() {
    if (!validateInlineForm()) return;
    setOpenConfirm(true);
  }

  async function handleInlineSubmit() {
    if (!validateInlineForm()) {
      setOpenConfirm(false);
      return;
    }

    try {
      setSaving(true);
      const savedPatient = await updatePatient(patientId, form);
      setPatientOverride(savedPatient || { ...patient, ...form });
      setForm(createPatientForm(savedPatient || { ...patient, ...form }));
      setOpenConfirm(false);
      setOpenSuccess(true);
      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.patientDetails("bhc", patientId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
      ]);
    } catch {
      // The edit modal remains open so the user can retry.
    } finally {
      setSaving(false);
    }
  }

  /**
   * Saves the whole medical_background object, not just the section being
   * edited - the three background tabs are views over one payload, so a
   * partial save would drop whichever sections the user was not looking at.
   * Returns false on failure so the tab keeps its edit state for a retry.
   */
  async function handleBackgroundSave(nextBackground) {
    try {
      setSavingBackground(true);
      const savedPatient = await updatePatientMedicalBackground(
        patientId,
        nextBackground,
      );
      if (savedPatient) setPatientOverride(savedPatient);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.patientDetails("bhc", patientId),
      });
      return true;
    } catch {
      return false;
    } finally {
      setSavingBackground(false);
    }
  }

  if (patientLoading && !patient) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <SoftLoadingArea
          isLoading
          message="Loading patient details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-slate-100 bg-white shadow-sm" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (loadError) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <ConnectionErrorState
          fullPage
          onRetry={retryPatientDetails}
          retrying={retrying}
          variant={loadError?.isTimeout ? "timeout" : isConnectionError(loadError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0F172A]">
            Patient not found
          </h1>
          <Link
            to="/bhc/patients"
            className="mt-4 inline-flex rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
          >
            Back to Patients
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const records = [...(Array.isArray(recordsData) ? recordsData : [])].sort(
    sortByDateDesc,
  );
  const referrals = [...(Array.isArray(referralsData) ? referralsData : [])].sort(
    sortByDateDesc,
  );
  const patientFollowUps = (
    Array.isArray(followUpTasksData) ? followUpTasksData : []
  )
    .filter(
      (task) =>
        String(task.patientId || task.patient?.id || "") === String(patientId),
    )
    .map((task) => ({
      ...task,
      effectiveState: getEffectiveFollowUpState(task),
    }))
    .sort((a, b) => getDateTimeValue(b) - getDateTimeValue(a));
  const activePatientFollowUp =
    patientFollowUps
      .filter((task) => isActiveFollowUpState(task.effectiveState))
      .sort((a, b) => getDateTimeValue(a) - getDateTimeValue(b))[0] || null;
  // BMI is shown from the newest visit that measured both weight and height.
  const latestBmiRecord = getLatestBmiRecord(records);
  const visibleRecords = showAllRecords ? records : records.slice(0, 5);
  const visibleReferrals = showAllReferrals
    ? referrals
    : referrals.slice(0, 5);
  const motherPatientOptions = registeredPatients
    .filter((item) => String(item.id) !== String(patientId))
    .filter((item) => {
      const age = calculateAge(item.birthDate || item.birthdate);
      return item.sex === "Female" && (age === "" || Number(age) >= 12);
    })
    .filter((item) => {
      const search = motherSearch.trim().toLowerCase();
      return !search || getMotherPatientLabel(item).toLowerCase().includes(search);
    });
  // Programs Women's Health and Pediatric/EPI already own, so they are not
  // also listed as their own specialized tabs.
  const claimedPrograms = new Set(
    conditionalProgramTabs.flatMap((area) => area.programs),
  );
  // "Active" here means the patient is still eligible for new services in the
  // area, not merely that old records exist - a history-only area has no open
  // program to name in Care Status.
  const activeProgramLabels = conditionalProgramTabs
    .filter((area) => area.applicable)
    .map((area) => area.label);
  const tabs = [
    { key: "overview", label: TAB_LABELS.overview },
    { key: "information", label: TAB_LABELS.information },
    { key: "medical", label: BACKGROUND_SECTIONS.medical.label },
    { key: "family", label: BACKGROUND_SECTIONS.family.label },
    { key: "social", label: BACKGROUND_SECTIONS.social.label },
    ...conditionalProgramTabs.map((area) => ({
      key: `program:${area.key}`,
      label: area.label,
      count: area.recordCount || null,
      area,
    })),
    {
      key: "records",
      label: TAB_LABELS.records,
      count: records.length,
    },
    // NCD and TB keep their own history-driven tabs; they have no conditional
    // chart area of their own and only appear once records exist.
    ...specializedRecordPrograms
      .filter(({ key }) => !claimedPrograms.has(key))
      .map(({ key, label, count }) => ({
        key: `specialized:${key}`,
        label,
        count,
        program: key,
      })),
    {
      key: "referrals",
      label: TAB_LABELS.referrals,
      count: referrals.length + patientFollowUps.length,
    },
  ];
  const activeSpecializedProgram =
    tabs.find((tab) => tab.key === activeTab)?.program || "";
  const activeProgramArea =
    tabs.find((tab) => tab.key === activeTab)?.area || null;

  return (
    <>
      <DashboardLayout role="bhc" title="Patient Details">
        <div className="min-h-[520px]">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/bhc/patients"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#0F172A]"
            >
              <ArrowLeft size={16} />
              Back to Patients
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {patientUpdating && (
                <RefreshingIndicator label="Updating patient details..." />
              )}
              <PatientConsultationActions
                patientId={patient.id || patientId}
                activeFollowUp={activePatientFollowUp}
              />
            </div>
          </div>

          <section className="min-w-0">
            {/* One row always: the chart can carry nine or more sections once
                the conditional program areas appear, so it scrolls sideways
                rather than wrapping into a second row that would push the
                content down. */}
            <nav
              className="flex flex-nowrap gap-6 overflow-x-auto border-b border-slate-200"
              aria-label="Patient chart sections"
            >
              {tabs.map(({ key, label, count = null }) => {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTabChange(key)}
                    className={`shrink-0 whitespace-nowrap border-b-2 pb-3 text-xs font-semibold transition ${
                      activeTab === key
                        ? "border-[#B91C1C] text-[#B91C1C]"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {label}
                    {count !== null && ` (${count})`}
                  </button>
                );
              })}
            </nav>

            <div className="pt-5">

              {/* The identity card belongs to Overview alone - the other tabs
                  open straight onto their own full-detail content. Its Edit
                  hands off to Patient Information rather than editing here. */}
              {activeTab === "overview" && (
                <>
                  <h1 className="text-lg font-bold text-[#0F172A]">
                    Patient Profile
                  </h1>
                  <div className="mt-3">
                    <PatientIdentityCard
                      patient={patient}
                      patientId={patientId}
                      onEdit={handleStartGeneralEdit}
                      followUpBadge={
                        activePatientFollowUp ? (
                          <FollowUpStateBadge
                            state={activePatientFollowUp.effectiveState}
                            date={activePatientFollowUp.dueDate}
                            context="profile"
                          />
                        ) : null
                      }
                    />
                  </div>
                </>
              )}

              {activeTab === "overview" && (
                <div className="mt-4">
                  <PatientOverviewTab
                    patient={patient}
                    records={records}
                    referrals={referrals}
                    activeFollowUp={activePatientFollowUp}
                    activePrograms={activeProgramLabels}
                    latestBmiRecord={latestBmiRecord}
                    basePath="/bhc"
                    onViewRecord={(recordId) =>
                      navigate(`/bhc/health-records/${recordId}`)
                    }
                    onViewReferral={(trackingId) =>
                      navigate(`/bhc/referrals/${trackingId}`)
                    }
                    onViewAllRecords={() => handleTabChange("records")}
                    onOpenTab={handleTabChange}
                  />
                </div>
              )}

              {/* Patient Information owns every registration/admin field, and
                  is the only place they are edited - Overview shows the
                  identity summary but never a second copy of this form. */}
              {activeTab === "information" && (
                <GeneralPatientTab
                  patient={patient}
                  form={form}
                  isEditing={isEditing}
                  onChange={handleChange}
                  fieldErrors={fieldErrors}
                  saving={saving}
                  motherSearch={motherSearch}
                  motherPatientOptions={motherPatientOptions}
                  onMotherSearchChange={setMotherSearch}
                  onMotherPatientChange={handleMotherPatientChange}
                  onEdit={handleStartGeneralEdit}
                  onCancel={handleCancelGeneralEdit}
                  onSave={handleRequestInlineSave}
                />
              )}

              {["medical", "family", "social"].includes(activeTab) && (
                <PatientBackgroundTab
                  section={activeTab}
                  background={patient.medicalBackground}
                  saving={savingBackground}
                  onSave={handleBackgroundSave}
                />
              )}

              {activeTab === "records" && (
                <HealthRecordsTab
                  records={records}
                  visibleRecords={visibleRecords}
                  isLoading={recordsLoading}
                  isFetching={recordsFetching}
                  isError={Boolean(recordsError)}
                  showAll={showAllRecords}
                  addRecordTo={`/bhc/health-records/add?patientId=${patient.id || patientId}`}
                  onToggleShowAll={() => setShowAllRecords((value) => !value)}
                  onView={(recordId) =>
                    navigate(`/bhc/health-records/${recordId}`)
                  }
                />
              )}

              {activeProgramArea && (
                <PatientProgramTab
                  area={activeProgramArea}
                  patient={patient}
                  records={records}
                  basePath="/bhc"
                  historyOnly={activeProgramArea.historyOnly}
                />
              )}

              {activeSpecializedProgram && (
                <SpecializedRecordsTab
                  records={records}
                  patient={patient}
                  basePath="/bhc"
                  program={activeSpecializedProgram}
                />
              )}

              {activeTab === "referrals" && (
                <ReferralsAndFollowUpsTab
                  referrals={referrals}
                  visibleReferrals={visibleReferrals}
                  followUps={patientFollowUps}
                  isLoading={referralsLoading}
                  isFetching={referralsFetching}
                  isError={Boolean(referralsError)}
                  showAll={showAllReferrals}
                  onToggleShowAll={() =>
                    setShowAllReferrals((value) => !value)
                  }
                  onView={(trackingId) =>
                    navigate(`/bhc/referrals/${trackingId}`)
                  }
                  onViewFollowUp={(taskId) =>
                    navigate(`/bhc/follow-ups/${taskId}`)
                  }
                />
              )}
            </div>
          </section>
        </div>
      </DashboardLayout>

      <ConfirmationModal
        open={openConfirm}
        title="Update Changes to Profile?"
        description="Please confirm that you want to update the patient information."
        confirmText="Save Changes"
        cancelText="Cancel"
        onConfirm={handleInlineSubmit}
        onCancel={() => setOpenConfirm(false)}
        loading={saving}
      />
      <SuccessModal
        open={openSuccess}
        title="Patient Profile Updated"
        description="The changes are now reflected across this patient's records."
        onClose={() => setOpenSuccess(false)}
      />
    </>
  );
}

/**
 * The two ways a visit starts for a patient already on screen.
 *
 * "New Consultation" carries only the patient, so Add Health Record still
 * opens on its own setup step (visit type, then program) rather than guessing
 * a program on the patient's behalf. "Record Follow-up Visit" is offered only
 * when there is an active task to fulfil, and uses the same query contract the
 * Follow-ups list uses, so both entry points land on the same form state.
 */
function PatientConsultationActions({ patientId, activeFollowUp }) {
  return (
    <>
      {activeFollowUp && (
        <Link
          to={buildRecordFollowUpVisitPath(activeFollowUp)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2 text-xs font-bold text-[#B91C1C] transition hover:bg-[#FEE2E2]"
        >
          <CalendarClock size={14} />
          Record Follow-up Visit
        </Link>
      )}
      <Link
        to={`/bhc/health-records/add?patientId=${patientId}`}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#B91C1C] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#991B1B]"
      >
        <Plus size={14} strokeWidth={2.5} />
        New Consultation
      </Link>
    </>
  );
}

function GeneralPatientTab({
  patient,
  form,
  isEditing,
  onChange,
  fieldErrors = {},
  saving = false,
  motherSearch,
  motherPatientOptions,
  onMotherSearchChange,
  onMotherPatientChange,
  onEdit,
  onCancel,
  onSave,
}) {
  const parentFields = [
    ["Parent / Guardian Name", ["parentName", "parent_name"]],
    ["Mother Name", ["motherName", "mother_name"]],
    ["Mother Date of Birth", ["motherBirthDate", "mother_birth_date"]],
    ["Father Name", ["fatherName", "father_name"]],
    ["Guardian Name", ["guardianName", "guardian_name"]],
    ["Guardian Relationship", ["guardianRelationship", "guardian_relationship"]],
    ["Guardian Contact Number", ["guardianContactNumber", "guardian_contact_number"]],
    ["Household Head", ["householdHead", "household_head"]],
    [
      "Relationship to Household Head",
      ["relationshipToHouseholdHead", "relationship_to_household_head"],
    ],
  ];
  const linkedMother =
    patient.motherPatient || patient.mother_patient || patient.mother || null;
  const linkedMotherName = linkedMother
    ? formatPatientName(linkedMother, "")
    : "";
  const displayMotherName =
    getPatientValue(patient, ["motherName", "mother_name"], "") ||
    linkedMotherName;
  const hasParentData =
    parentFields.some(([, keys]) =>
      hasDisplayValue(getPatientValue(patient, keys, "")),
    ) || hasDisplayValue(displayMotherName);
  const birthFields = [
    ["Birth Place", ["birthPlace", "birth_place"]],
    ["Time of Birth", ["birthTime", "birth_time"]],
    ["Birth Weight", ["birthWeight", "birth_weight"]],
    ["Birth Height", ["birthHeight", "birth_height"]],
  ];
  const hasBirthData = birthFields.some(([, keys]) =>
    hasDisplayValue(getPatientValue(patient, keys, "")),
  );
  const formAgeYears = calculateAge(form.birthDate);
  const formAgeMonths = calculateAgeInMonths(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isFormMinor =
    hasBirthDate && formAgeYears !== "" && Number(formAgeYears) < 18;
  const isEpiTargetAge =
    hasBirthDate && formAgeMonths !== "" && Number(formAgeMonths) <= 12;
  const shouldRequireCivilStatus = hasBirthDate && !isEpiTargetAge;
  const showChildSections =
    hasParentData ||
    hasBirthData ||
    (isEditing
      ? isFormMinor
      : Number(getPatientValue(patient, ["age"], 99)) < 18);

  if (isEditing) {
    return (
      <div className="space-y-7">
        <RegistrationSection
          title="Basic Information"
          description="Editing patient profile information."
          action={
            <InlineEditActions
              saving={saving}
              onCancel={onCancel}
              onSave={onSave}
            />
          }
        >
          <EditField label="First Name" name="firstName" value={form.firstName} onChange={onChange} error={fieldErrors.firstName} required />
          <EditField label="Middle Name" name="middleName" value={form.middleName} onChange={onChange} />
          <EditField label="Last Name" name="lastName" value={form.lastName} onChange={onChange} error={fieldErrors.lastName} required />
          <EditField label="Birthday" name="birthDate" type="date" value={form.birthDate} onChange={onChange} error={fieldErrors.birthDate} required />
          <EditField label="Age" name="age" value={form.age} readOnly />
          <EditSelect label="Sex" name="sex" value={form.sex} onChange={onChange} error={fieldErrors.sex} required>
            <option value="">Select sex</option>
            <option>Male</option>
            <option>Female</option>
          </EditSelect>
        </RegistrationSection>

        <RegistrationSection
          title="Socio-Demographic Information"
          description="Household and social profile information."
        >
          <EditSelect label="Civil Status" name="civilStatus" value={form.civilStatus} onChange={onChange} error={fieldErrors.civilStatus} required={shouldRequireCivilStatus}>
            <option value="">Select civil status</option>
            <option>Single</option>
            <option>Married</option>
            <option>Widowed</option>
            <option>Separated</option>
          </EditSelect>
          <EditField label="Occupation" name="occupation" value={form.occupation} onChange={onChange} />
          <EditField label="NHTS Status" name="nhtsStatus" value={form.nhtsStatus} onChange={onChange} />
          {!showChildSections && (
            <EditField label="Family Serial Number" name="familySerialNumber" value={form.familySerialNumber} onChange={onChange} />
          )}
          {form.civilStatus === "Married" && (
            <>
              <EditField label="Spouse Name" name="spouseName" value={form.spouseName} onChange={onChange} />
              <EditField label="Spouse Occupation" name="spouseOccupation" value={form.spouseOccupation} onChange={onChange} />
            </>
          )}
        </RegistrationSection>

        <RegistrationSection
          title="Contact & Identification"
          description="Contact and health insurance information."
        >
          <EditField label="Contact Number" name="contactNumber" value={form.contactNumber} onChange={onChange} />
          <EditSelect label="PhilHealth Membership" name="philHealthStatus" value={form.philHealthStatus} onChange={onChange}>
            <option value="">Select membership</option>
            <option>With PhilHealth</option>
            <option>No PhilHealth</option>
          </EditSelect>
          {form.philHealthStatus === "With PhilHealth" && (
            <EditField label="PhilHealth Number" name="philHealthNumber" value={form.philHealthNumber} onChange={onChange} error={fieldErrors.philHealthNumber} required />
          )}
        </RegistrationSection>

        <RegistrationSection
          title="Address Information"
          description="Registered residential address."
        >
          <EditField label="Street Address" name="streetAddress" value={form.streetAddress} onChange={onChange} error={fieldErrors.streetAddress} required />
          <EditField label="Purok / Area" name="purokArea" value={form.purokArea} onChange={onChange} />
          <EditSelect label="Barangay" name="barangay" value={form.barangay} onChange={onChange} error={fieldErrors.barangay} required>
            <option value="">Select barangay</option>
            {BULAKAN_BARANGAYS.map((barangay) => (
              <option key={barangay}>{barangay}</option>
            ))}
          </EditSelect>
          <EditField label="Municipality / City" name="municipality" value={form.municipality} onChange={onChange} error={fieldErrors.municipality} required />
        </RegistrationSection>

        {showChildSections && (
          <RegistrationSection
            title="Parent / Household Information"
            description="Parent and guardian details saved for this patient."
          >
            <EditField label="Mother Name" name="motherName" value={form.motherName} onChange={onChange} error={fieldErrors.motherName} required={isFormMinor} />
            <EditLinkedMotherSelect
              value={form.motherPatientId}
              search={motherSearch}
              options={motherPatientOptions}
              onSearchChange={onMotherSearchChange}
              onChange={onMotherPatientChange}
            />
            <EditField label="Family Serial Number" name="familySerialNumber" value={form.familySerialNumber} onChange={onChange} />
            <EditField label="Father Name" name="fatherName" value={form.fatherName} onChange={onChange} />
            <EditField label="Guardian Name" name="guardianName" value={form.guardianName} onChange={onChange} />
            <EditField label="Guardian Relationship" name="guardianRelationship" value={form.guardianRelationship} onChange={onChange} />
            <EditField label="Guardian Contact Number" name="guardianContactNumber" value={form.guardianContactNumber} onChange={onChange} />
          </RegistrationSection>
        )}

        {(showChildSections || hasBirthData) && (
          <RegistrationSection
            title="Birth / EPI Registration Details"
            description="Birth information captured during child registration."
          >
            <EditField label="Birth Place" name="birthPlace" value={form.birthPlace} onChange={onChange} />
            <EditField label="Time of Birth" name="birthTime" type="time" value={form.birthTime} onChange={onChange} />
            <EditField label="Birth Weight" name="birthWeight" value={form.birthWeight} onChange={onChange} />
            <EditField label="Birth Height" name="birthHeight" value={form.birthHeight} onChange={onChange} />
          </RegistrationSection>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <RegistrationSection
        title="Basic Information"
        description="Identity and demographic information from registration."
        action={
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit patient information"
            title="Edit patient information"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
          >
            <Pencil size={12} />
            Edit Details
          </button>
        }
      >
        <DetailItem label="First Name" value={getPatientValue(patient, ["firstName", "first_name"])} />
        <DetailItem label="Middle Name" value={getPatientValue(patient, ["middleName", "middle_name"])} />
        <DetailItem label="Last Name" value={getPatientValue(patient, ["lastName", "last_name"])} />
        <DetailItem
          label="Birthday"
          value={formatLongDate(
            getPatientValue(patient, ["birthDate", "birthdate", "dateOfBirth", "date_of_birth"]),
            "Not recorded",
          )}
        />
        <DetailItem label="Age" value={getPatientValue(patient, ["age"]) ? `${getPatientValue(patient, ["age"])} years old` : ""} />
        <DetailItem label="Sex" value={getPatientValue(patient, ["sex"])} />
      </RegistrationSection>

      <RegistrationSection
        title="Socio-Demographic Information"
        description="Household and social profile information."
      >
        <DetailItem label="Civil Status" value={getPatientValue(patient, ["civilStatus", "civil_status"])} />
        <DetailItem label="Occupation" value={getPatientValue(patient, ["occupation"])} />
        <DetailItem label="NHTS Status" value={getPatientValue(patient, ["nhtsStatus", "nhts_status"])} />
        <DetailItem label="Family Serial Number" value={getPatientValue(patient, ["familySerialNumber", "family_serial_number"])} />
        {hasDisplayValue(getPatientValue(patient, ["spouseName", "spouse_name"], "")) && (
          <DetailItem label="Spouse Name" value={getPatientValue(patient, ["spouseName", "spouse_name"])} />
        )}
        {hasDisplayValue(getPatientValue(patient, ["spouseOccupation", "spouse_occupation"], "")) && (
          <DetailItem label="Spouse Occupation" value={getPatientValue(patient, ["spouseOccupation", "spouse_occupation"])} />
        )}
      </RegistrationSection>

      <RegistrationSection
        title="Contact & Identification"
        description="Contact and health insurance information."
      >
        <DetailItem label="Contact Number" value={getPatientValue(patient, ["contact", "contactNumber", "contact_number"])} />
        <DetailItem
          label="PhilHealth Membership"
          value={getPatientValue(patient, ["philHealthStatus", "philhealth_status", "philHealthMembership", "philhealth_membership"])}
        />
        {hasDisplayValue(getPatientValue(patient, ["philHealthNumber", "philhealthNumber", "philhealth_number"], "")) && (
          <DetailItem label="PhilHealth Number" value={getPatientValue(patient, ["philHealthNumber", "philhealthNumber", "philhealth_number"])} />
        )}
      </RegistrationSection>

      <RegistrationSection
        title="Address Information"
        description="Registered residential address."
      >
        <DetailItem label="Street Address" value={getPatientValue(patient, ["address", "streetAddress", "street_address"])} />
        <DetailItem label="Purok / Area" value={getPatientValue(patient, ["purok", "purokArea", "purok_area"])} />
        <DetailItem label="Barangay" value={getPatientValue(patient, ["barangay"])} />
        <DetailItem label="Municipality / City" value={getPatientValue(patient, ["municipality", "city"])} />
      </RegistrationSection>

      {hasParentData && (
        <RegistrationSection
          title="Parent / Household Information"
          description="Parent and guardian details saved for this patient."
        >
          {parentFields.map(([label, keys]) => {
            const value =
              label === "Mother Name"
                ? displayMotherName
                : getPatientValue(patient, keys, "");
            return hasDisplayValue(value) ? (
              <DetailItem
                key={label}
                label={label}
                value={
                  label.includes("Date of Birth")
                    ? formatLongDate(value, "Not recorded")
                    : value
                }
              />
            ) : null;
          })}
        </RegistrationSection>
      )}

      {hasBirthData && (
        <RegistrationSection
          title="Birth / EPI Registration Details"
          description="Birth information captured during child registration."
        >
          {birthFields.map(([label, keys]) => {
            const value = getPatientValue(patient, keys, "");
            return hasDisplayValue(value) ? (
              <DetailItem key={label} label={label} value={value} />
            ) : null;
          })}
        </RegistrationSection>
      )}
    </div>
  );
}

function RegistrationSection({ title, description, action, children }) {
  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 grid min-w-0 gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[#0F172A]">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function InlineEditActions({ saving, onCancel, onSave }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <X size={14} />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#B91C1C] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-red-300"
      >
        <Check size={14} />
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

function EditField({ label, required, readOnly, error, value, ...props }) {
  const inputStateClass = error
    ? "border-[#B91C1C] bg-white"
    : readOnly
      ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-500"
      : "border-slate-200 bg-white";

  return (
    <label className="min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="text-[#B91C1C]"> *</span>}
      </span>
      <input
        {...props}
        value={value ?? ""}
        required={required}
        readOnly={readOnly}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 h-10 w-full min-w-0 rounded-xl border px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${inputStateClass}`}
      />
      {error && (
        <span className="mt-1 block text-[11px] font-medium text-[#B91C1C]">
          {error}
        </span>
      )}
    </label>
  );
}

function EditSelect({ label, required, error, children, value, ...props }) {
  return (
    <label className="min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="text-[#B91C1C]"> *</span>}
      </span>
      <select
        {...props}
        value={value ?? ""}
        required={required}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 h-10 w-full min-w-0 rounded-xl border bg-white px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          error ? "border-[#B91C1C]" : "border-slate-200"
        }`}
      >
        {children}
      </select>
      {error && (
        <span className="mt-1 block text-[11px] font-medium text-[#B91C1C]">
          {error}
        </span>
      )}
    </label>
  );
}

function EditLinkedMotherSelect({
  value,
  search,
  options,
  onSearchChange,
  onChange,
}) {
  return (
    <label className="min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        Registered Mother Link
      </span>
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search registered mother"
        className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      >
        <option value="">No linked mother selected</option>
        {options.map((patient) => (
          <option key={patient.id} value={patient.id}>
            {getMotherPatientLabel(patient)}
          </option>
        ))}
      </select>
    </label>
  );
}

function HealthRecordsTab({
  records,
  visibleRecords,
  isLoading,
  isFetching,
  isError,
  showAll,
  addRecordTo,
  onToggleShowAll,
  onView,
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <TabHeader
        title="Health Record History"
        subtitle="Every consultation saved for this patient. The global Health Records module lists these across all patients."
        action={
          isFetching && records.length > 0 ? (
            <RefreshingIndicator label="Updating health records..." />
          ) : null
        }
      />
      {isLoading && records.length === 0 ? (
        <SoftLoadingArea
          isLoading
          message="Loading health records..."
          minHeight="min-h-[240px]"
        >
          <div className="min-h-[240px]" />
        </SoftLoadingArea>
      ) : isError && records.length === 0 ? (
        <TabErrorState message="Unable to load health records right now." />
      ) : records.length === 0 && !isLoading ? (
        <>
          <TabEmptyState
            icon={<FileText size={32} />}
            message="No health records recorded for this patient yet."
          />
          <AddHealthRecordAction to={addRecordTo} />
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Record ID</th>
                  <th className="px-4 py-3">Visit Date</th>
                  <th className="px-4 py-3">Chief Complaint</th>
                  <th className="px-4 py-3">Program / Service</th>
                  <th className="px-4 py-3">Visit Type</th>
                  <th className="px-4 py-3">Outcome / Next Step</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleRecords.map((record) => {
                  const recordId = getHealthRecordId(record);
                  return (
                    <tr key={recordId} className="transition hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-bold text-[#B91C1C]">
                        {getRecordIdLabel(record)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">
                        {getHealthRecordDate(record)}
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-[#0F172A]">
                        {formatDisplayValue(
                          record.chiefComplaint,
                          "No complaint recorded",
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-[#0F172A]">
                        {getServiceTypeLabel(record)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-600">
                        {isFollowUpVisitRecord(record) ? (
                          <span className="inline-flex rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#1D4ED8]">
                            Follow-up
                          </span>
                        ) : (
                          getRecordVisitTypeLabel(record)
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <RecordOutcomeBadge record={record} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => onView(recordId)}
                          aria-label="View health record"
                          title="View health record"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0F172A] shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {records.length > 5 && (
            <ShowAllButton
              showAll={showAll}
              count={records.length}
              noun="records"
              onClick={onToggleShowAll}
            />
          )}
          <AddHealthRecordAction to={addRecordTo} />
        </>
      )}
    </div>
  );
}

/**
 * Both onward dispositions a visit can produce, in one place: the referrals
 * raised for this patient and the follow-up tasks scheduled for them. They
 * share a tab because a BHW asking "what is still open for this patient"
 * has to check both.
 */
function ReferralsAndFollowUpsTab({
  referrals,
  visibleReferrals,
  followUps,
  isLoading,
  isFetching,
  isError,
  showAll,
  onToggleShowAll,
  onView,
  onViewFollowUp,
}) {
  return (
    <div className="space-y-5">
      <FollowUpHistorySection
        followUps={followUps}
        onViewFollowUp={onViewFollowUp}
      />
      <ReferralHistoryTab
        referrals={referrals}
        visibleReferrals={visibleReferrals}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        showAll={showAll}
        onToggleShowAll={onToggleShowAll}
        onView={onView}
      />
    </div>
  );
}

function FollowUpHistorySection({ followUps = [], onViewFollowUp }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <TabHeader
        title="Follow-up Tasks"
        subtitle="Follow-ups scheduled from this patient's visits, newest first."
      />
      {followUps.length === 0 ? (
        <TabEmptyState
          icon={<CalendarClock size={32} />}
          message="No follow-ups scheduled for this patient yet."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Follow-up</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">From Record</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {followUps.map((task) => (
                <tr key={task.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-bold text-[#0F172A]">
                    #{task.id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatDate(task.dueDate, "Not recorded")}
                    {task.dueTime ? ` - ${task.dueTime}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    Record #{formatDisplayValue(task.healthRecordId, "-")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <FollowUpStateBadge
                      state={task.effectiveState}
                      date={task.dueDate}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onViewFollowUp?.(task.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                    >
                      <Eye size={12} /> View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReferralHistoryTab({
  referrals,
  visibleReferrals,
  isLoading,
  isFetching,
  isError,
  showAll,
  onToggleShowAll,
  onView,
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <TabHeader
        title="Referral Tracking Logs"
        subtitle="BHC-RHU referrals linked to this patient."
        action={
          isFetching && referrals.length > 0 ? (
            <RefreshingIndicator label="Updating referrals..." />
          ) : null
        }
      />
      {isLoading && referrals.length === 0 ? (
        <SoftLoadingArea
          isLoading
          message="Loading referrals..."
          minHeight="min-h-[240px]"
        >
          <div className="min-h-[240px]" />
        </SoftLoadingArea>
      ) : isError && referrals.length === 0 ? (
        <TabErrorState message="Unable to load referral history right now." />
      ) : referrals.length === 0 && !isLoading ? (
        <TabEmptyState
          icon={<ClipboardList size={32} />}
          message="No referral history found for this patient."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Tracking ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">RHU Return Slip</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleReferrals.map((referral) => {
                const trackingId = referral.trackingId || referral.id;
                return (
                  <tr
                    key={trackingId}
                    className="transition hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-bold text-[#0F172A]">
                      {trackingId}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                      {getReferralDate(referral)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDisplayValue(
                        getReferralDestination(referral),
                        "Not recorded",
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge status={referral.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <ReturnSlipIndicator referral={referral} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => onView(trackingId)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                      >
                        <Eye size={12} /> View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {referrals.length > 5 && (
            <ShowAllButton
              showAll={showAll}
              count={referrals.length}
              noun="referrals"
              onClick={onToggleShowAll}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AddHealthRecordAction({ to }) {
  if (!to) return null;

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      <Link
        to={to}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-red-200 bg-red-50/40 px-4 py-2.5 text-sm font-semibold text-[#B91C1C] transition hover:border-red-200 hover:bg-red-50"
      >
        <Plus size={15} />
        Add new health record for this patient
      </Link>
    </div>
  );
}

function TabHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
      <div>
        <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function TabEmptyState({ icon, message }) {
  return (
    <div className="p-12 text-center text-sm text-slate-400">
      <span className="mx-auto mb-3 flex justify-center text-slate-300">
        {icon}
      </span>
      {message}
    </div>
  );
}

function TabErrorState({ message }) {
  return (
    <div className="p-12 text-center text-sm text-slate-400">
      <FileText className="mx-auto mb-3 text-slate-300" size={32} />
      {message}
    </div>
  );
}

function ShowAllButton({ showAll, count, noun, onClick }) {
  return (
    <div className="border-t border-slate-100 px-5 py-3 text-center">
      <button
        type="button"
        onClick={onClick}
        className="text-xs font-semibold text-[#B91C1C] transition hover:text-[#7F1D1D]"
      >
        {showAll ? "Show less" : `Show all ${count} ${noun}`}
      </button>
    </div>
  );
}

function FollowUpStateBadge({ state, date, context = "row" }) {
  const styles = {
    none: "border-slate-200 bg-slate-50 text-slate-500",
    upcoming: "border-amber-200 bg-amber-50 text-amber-700",
    rescheduled: "border-orange-200 bg-orange-50 text-orange-700",
    due_today: "border-amber-200 bg-amber-50 text-amber-700",
    no_show: "border-red-200 bg-red-50 text-red-700",
    fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-700",
    referred: "border-indigo-200 bg-indigo-50 text-indigo-700",
    cancelled: "border-slate-200 bg-slate-100 text-slate-500",
  };
  const labels = {
    none: "No follow-up",
    upcoming: "Pending",
    rescheduled: "Rescheduled",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
    referred: "Referred",
    cancelled: "Cancelled",
  };
  const profileLabels = {
    none: "No follow-up",
    upcoming: "Pending",
    rescheduled: "Rescheduled",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
    referred: "Referred",
    cancelled: "Cancelled",
  };

  const label =
    context === "profile"
      ? profileLabels[state] || "Pending Follow-up"
      : labels[state] || "Pending";
  const dateText = date ? formatDate(date, "") : "";

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
        styles[state] || styles.upcoming
      }`}
    >
      {dateText ? `${label} \u2022 ${dateText}` : label}
    </span>
  );
}

function ReturnSlipIndicator({ referral }) {
  const hasReturnSlip = Boolean(referral.feedback || referral.returnSlip);
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        hasReturnSlip
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {hasReturnSlip ? "Available" : "Awaiting Feedback"}
    </span>
  );
}

function createPatientForm(patient = {}) {
  return {
    firstName: getPatientValue(patient, ["firstName", "first_name"], ""),
    middleName: getPatientValue(patient, ["middleName", "middle_name"], ""),
    lastName: getPatientValue(patient, ["lastName", "last_name"], ""),
    birthDate: getPatientValue(
      patient,
      ["birthDate", "birthdate", "dateOfBirth", "date_of_birth"],
      "",
    ),
    age: getPatientValue(patient, ["age"], ""),
    sex: getPatientValue(patient, ["sex"], ""),
    civilStatus: getPatientValue(patient, ["civilStatus", "civil_status"], ""),
    occupation: getPatientValue(patient, ["occupation"], ""),
    nhtsStatus: getPatientValue(patient, ["nhtsStatus", "nhts_status"], ""),
    familySerialNumber: getPatientValue(
      patient,
      ["familySerialNumber", "family_serial_number"],
      "",
    ),
    spouseName: getPatientValue(patient, ["spouseName", "spouse_name"], ""),
    spouseOccupation: getPatientValue(
      patient,
      ["spouseOccupation", "spouse_occupation"],
      "",
    ),
    contactNumber: getPatientValue(
      patient,
      ["contact", "contactNumber", "contact_number"],
      "",
    ),
    philHealthStatus: getPatientValue(
      patient,
      ["philHealthStatus", "philhealth_status", "philHealthMembership"],
      "",
    ),
    philHealthNumber: getPatientValue(
      patient,
      ["philHealthNumber", "philhealthNumber", "philhealth_number"],
      "",
    ),
    streetAddress: getPatientValue(
      patient,
      ["address", "streetAddress", "street_address"],
      "",
    ),
    purokArea: getPatientValue(
      patient,
      ["purok", "purokArea", "purok_area"],
      "",
    ),
    barangay: getPatientValue(patient, ["barangay"], ""),
    municipality: getPatientValue(
      patient,
      ["municipality", "city"],
      "Bulakan",
    ),
    motherName: getPatientValue(patient, ["motherName", "mother_name"], ""),
    motherPatientId: getPatientValue(
      patient,
      ["motherPatientId", "mother_patient_id"],
      "",
    ),
    fatherName: getPatientValue(patient, ["fatherName", "father_name"], ""),
    guardianName: getPatientValue(
      patient,
      ["guardianName", "guardian_name"],
      "",
    ),
    guardianRelationship: getPatientValue(
      patient,
      ["guardianRelationship", "guardian_relationship"],
      "",
    ),
    guardianContactNumber: getPatientValue(
      patient,
      ["guardianContactNumber", "guardian_contact_number"],
      "",
    ),
    birthPlace: getPatientValue(patient, ["birthPlace", "birth_place"], ""),
    birthTime: getPatientValue(patient, ["birthTime", "birth_time"], ""),
    birthWeight: getPatientValue(patient, ["birthWeight", "birth_weight"], ""),
    birthHeight: getPatientValue(patient, ["birthHeight", "birth_height"], ""),
    registrationType: getPatientValue(
      patient,
      ["registrationType", "registration_type", "patientType"],
      "",
    ),
    patientClassification: getPatientValue(
      patient,
      ["patientClassification", "patientCategory", "category"],
      "",
    ),
  };
}

function getMotherPatientLabel(patient = {}) {
  return [
    patient.fullName || patient.name || "Unnamed patient",
    patient.patientId || patient.id ? `Patient ID: ${patient.patientId || patient.id}` : "",
    patient.barangay || "",
  ]
    .filter(Boolean)
    .join(" - ");
}

function getPatientValue(patient = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = patient?.[key];
    if (hasDisplayValue(value)) return value;
  }
  return fallback;
}

function hasDisplayValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getTodayIsoDate() {
  const currentDate = new Date();
  return [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
}

function calculateAge(value) {
  if (!value) return "";
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayHasNotOccurred =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate());
  if (birthdayHasNotOccurred) age -= 1;
  return Math.max(age, 0);
}

function getHealthRecordId(record = {}) {
  const id =
    record.id ||
    record.health_record_id ||
    record.healthRecordId ||
    record.record_id ||
    record.recordId ||
    record._id;
  return id ? String(id) : "";
}

function getHealthRecordDate(record = {}) {
  return formatDate(
    record.dateOfVisit ||
      record.date_of_visit ||
      record.dateRecorded ||
      record.date_recorded ||
      record.visitDate ||
      record.date ||
      record.createdAt ||
      record.created_at,
    "Not recorded",
  );
}

function isActiveFollowUpState(state) {
  return ["upcoming", "due_today", "no_show", "rescheduled"].includes(state);
}

function getReferralDate(referral = {}) {
  return formatDate(
    referral.dateOfReferral ||
      referral.date_of_referral ||
      referral.referralDate ||
      referral.referral_datetime ||
      referral.dateSubmitted ||
      referral.createdAt ||
      referral.created_at ||
      referral.date,
    "Not recorded",
  );
}

function getReferralDestination(referral = {}) {
  return (
    referral.receivingFacility ||
    referral.destinationFacility ||
    referral.referredFacility ||
    referral.rural_health_unit?.name ||
    referral.ruralHealthUnit?.name ||
    ""
  );
}

function getEffectiveFollowUpState(task = {}) {
  if (task.state === "fulfilled") return "fulfilled";
  if (task.state === "no_show") return "no_show";
  if (["cancelled", "canceled"].includes(task.state)) return "cancelled";

  const dueDate = String(task.dueDate || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "no_show";
  if (task.state === "rescheduled") return "rescheduled";
  return "upcoming";
}

function sortByDateDesc(a, b) {
  return getDateTimeValue(b) - getDateTimeValue(a);
}

function getDateTimeValue(item = {}) {
  const raw =
    item.dueDate ||
    item.due_date ||
    item.dateOfVisit ||
    item.date_of_visit ||
    item.dateRecorded ||
    item.date_recorded ||
    item.visitDate ||
    item.dateOfReferral ||
    item.date_of_referral ||
    item.referralDate ||
    item.referral_datetime ||
    item.dateSubmitted ||
    item.createdAt ||
    item.created_at ||
    item.date;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
