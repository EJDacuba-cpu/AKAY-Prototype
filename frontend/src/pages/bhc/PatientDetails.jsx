import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ConnectionErrorState,
  SoftLoadingArea,
  SuccessModal,
} from "../../components/common";
import PatientBackgroundTab from "../../components/features/patients/PatientBackgroundTab";
import PatientProfileHeader from "../../components/features/patients/profile/PatientProfileHeader";
import PatientOverviewBoard from "../../components/features/patients/profile/PatientOverviewBoard";
import VitalsTiles from "../../components/features/patients/profile/VitalsTiles";
import ClinicalOverviewColumn from "../../components/features/patients/profile/ClinicalOverviewColumn";
import AnatomyFindingsPanel from "../../components/features/patients/profile/AnatomyFindingsPanel";
import RegistrationSections from "../../components/features/patients/profile/RegistrationSections";
import RecordsTimeline from "../../components/features/patients/profile/RecordsTimeline";
import CareAndProgramsTab from "../../components/features/patients/profile/CareAndProgramsTab";
import {
  FollowUpsByStatus,
  ReferralsSection,
} from "../../components/features/patients/profile/FollowUpsAndReferrals";
import { getConditionalProgramTabs } from "../../utils/programApplicability";
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
import { getProfileReturnPath } from "../../utils/profileNavigation";
import { getSpecializedRecordPrograms } from "../../utils/healthRecordPrograms";
import { getCareTracking } from "../../utils/careTracking";
import { calculateAge, normalizePhilippineContact } from "../../utils/patientUtils";
import { queryKeys } from "../../utils/queryKeys";
import { getCurrentUser } from "../../utils/auth";
import {
  createPatientForm,
  getSectionErrors,
  mergeBackgroundSection,
  orderFollowUps,
  sortByDateDesc,
  validatePatientForm,
} from "../../utils/patientProfile";

const BACKGROUND_SECTION_KEYS = ["medical", "family", "social"];

// The profile fills the whole content area, leaving only a 10px margin.
const PROFILE_CONTENT_CLASS = "p-[10px] pb-[max(10px,env(safe-area-inset-bottom))]";

function ProfileShell({ children }) {
  return (
    <DashboardLayout role="bhc" title="Patient Details" contentClassName={PROFILE_CONTENT_CLASS}>
      {children}
    </DashboardLayout>
  );
}

/**
 * Underlined tab strip for the profile's main content: no box or background,
 * so it sits directly on the page surface above a thin rule, with a red
 * underline on the active tab and slate text on the others.
 */
function ProfileTabs({ tabs, activeTab, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="Patient profile"
      className="mb-1.5 shrink-0 overflow-x-auto border-b border-[#E5E7EB]"
    >
      <nav className="flex">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          const count = tab.count === undefined || tab.count === null ? "" : ` (${tab.count})`;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`profile-tab-${tab.key}`}
              aria-selected={active}
              aria-controls={`profile-panel-${tab.key}`}
              onClick={() => onSelect(tab.key)}
              className={`whitespace-nowrap border-b-2 px-4 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                active
                  ? "border-[#B91C1C] text-[#B91C1C]"
                  : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
              }`}
            >
              {tab.label}
              {count}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * BHC patient profile: the identity header and tab strip, then the active
 * tab, filling the available width and height. Overview is a card board that
 * fills the space under the tabs (latest vitals on the left; the body figure
 * with its conditions / allergies / medications dropdowns in the middle; the
 * background, referrals, follow-ups, programs and visits cards on the right).
 * Every other tab scrolls inside its own panel, so the header and tabs stay put.
 * Medical / Family / Social Background is edited inline on the Patient
 * Information tab, below registration.
 */
export default function PatientDetails() {
  const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
  const { patientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Explicit origin passed by whoever opened the profile; Patients otherwise.
  const backPath = getProfileReturnPath(location, "/bhc/patients");
  const queryClient = useQueryClient();
  const [patientOverride, setPatientOverride] = useState(null);
  // Which registration section is open for editing (one at a time), or null.
  const [editingSection, setEditingSection] = useState(null);
  const [pendingSaveSection, setPendingSaveSection] = useState(null);
  const [savingBackground, setSavingBackground] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [motherSearch, setMotherSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  // Set by "View records" on a Care & Programs card so Health Records opens
  // pre-filtered to that program; "all" the rest of the time.
  const [recordsFilter, setRecordsFilter] = useState("all");
  const editingSectionRef = useRef(null);

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
    enabled: Boolean(patientId) && canViewHistory,
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
    enabled: Boolean(patientId) && canViewHistory,
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
    enabled: Boolean(patientId) && canViewHistory,
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

  const overrideMatchesPatient =
    patientOverride &&
    String(patientOverride.id || patientOverride.patientId || "") === String(patientId);
  const patient = overrideMatchesPatient ? patientOverride : patientData || null;
  const loadError =
    patientError ||
    (canViewHistory && (recordsError || referralsError || followUpsError)) ||
    registeredPatientsError ||
    null;
  const retrying =
    patientFetching ||
    recordsFetching ||
    referralsFetching ||
    followUpsFetching ||
    registeredPatientsFetching;
  const patientUpdating = patientFetching && !patientLoading && Boolean(patient);

  const records = useMemo(
    () => [...(Array.isArray(recordsData) ? recordsData : [])].sort(sortByDateDesc),
    [recordsData],
  );
  const referrals = useMemo(
    () => [...(Array.isArray(referralsData) ? referralsData : [])].sort(sortByDateDesc),
    [referralsData],
  );
  const { ordered: patientFollowUps, open: activeFollowUps } = useMemo(
    () =>
      orderFollowUps(
        (Array.isArray(followUpTasksData) ? followUpTasksData : []).filter(
          (task) => String(task.patientId || task.patient?.id || "") === String(patientId),
        ),
      ),
    [followUpTasksData, patientId],
  );
  /**
   * Women's Health and Pediatric / EPI are shown when the patient is currently
   * applicable for the program OR already has records in it - so a closed
   * eligibility window never hides an existing chart.
   */
  const conditionalProgramAreas = useMemo(
    () => (patient ? getConditionalProgramTabs(patient, records) : []),
    [patient, records],
  );
  // Programs Women's Health and Pediatric/EPI already own, so TB (which only
  // appears once records exist) is the only extra enrollment to list.
  const programLabels = useMemo(() => {
    const claimed = new Set(conditionalProgramAreas.flatMap((area) => area.programs));
    return [
      ...conditionalProgramAreas.filter((area) => area.applicable).map((area) => area.label),
      ...getSpecializedRecordPrograms(records)
        .filter(({ key }) => !claimed.has(key))
        .map(({ label }) => label),
    ];
  }, [conditionalProgramAreas, records]);
  const careTracking = useMemo(
    () => (patient ? getCareTracking(patient, records) : []),
    [patient, records],
  );

  // Patient Information (registration: demographics, contact & address,
  // family & birth) is not clinical history, so it stays visible even for
  // roles without canViewHistory - matching the old behavior where
  // RegistrationSections rendered inline on Overview regardless of role.
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "patient-info", label: "Patient Information" },
    ...(canViewHistory
      ? [
          {
            key: "programs",
            label: "Care & Programs",
            count: careTracking.filter((entry) => entry.records.length > 0).length || null,
          },
          { key: "follow-ups", label: "Follow-ups", count: activeFollowUps.length || null },
          { key: "records", label: "Health Records", count: recordsLoading ? null : records.length },
          { key: "referrals", label: "Referrals", count: referralsLoading ? null : referrals.length },
        ]
      : []),
  ];

  function handleViewProgramRecords(programKey) {
    setRecordsFilter(programKey || "all");
    setActiveTab("records");
  }

  function retryPatientDetails() {
    refetchPatient();
    refetchRecords();
    refetchReferrals();
    refetchFollowUps();
    refetchRegisteredPatients();
  }

  useEffect(() => {
    editingSectionRef.current = editingSection;
  }, [editingSection]);

  useEffect(() => {
    if (!patientData) return;
    setPatientOverride(patientData);
    // A background save refetches the patient; it must not wipe a registration
    // section the user is in the middle of editing.
    if (editingSectionRef.current === null) {
      setForm(createPatientForm(patientData));
      setFieldErrors({});
    }
  }, [patientData]);

  useEffect(() => {
    setEditingSection(null);
    setPendingSaveSection(null);
    setFieldErrors({});
    setActiveTab("overview");
    setRecordsFilter("all");
  }, [patientId]);

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
        [name]: name === "contactNumber" ? normalizePhilippineContact(value) : value,
      };
      if (name === "birthDate") next.age = calculateAge(value);
      if (name === "philHealthStatus" && value !== "With PhilHealth") {
        next.philHealthNumber = "";
      }
      return next;
    });
  }

  function handleMotherPatientChange(value) {
    setFieldErrors((current) => ({ ...current, motherName: "", motherPatientId: "" }));
    const selectedMother = registeredPatients.find((item) => String(item.id) === String(value));

    setForm((current) => ({
      ...current,
      motherPatientId: value,
      motherName: selectedMother
        ? selectedMother.fullName || selectedMother.name || current.motherName
        : current.motherName,
    }));
  }

  function handleEditSection(section) {
    setForm(createPatientForm(patient));
    setFieldErrors({});
    setPendingSaveSection(null);
    setEditingSection(section);
  }

  function handleCancelEdit() {
    if (saving) return;
    setForm(createPatientForm(patient));
    setFieldErrors({});
    setPendingSaveSection(null);
    setEditingSection(null);
  }

  /** Validates only the section being saved, then asks for confirmation. */
  function handleRequestSave(section) {
    const errors = getSectionErrors(validatePatientForm(form), section);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setPendingSaveSection(section);
  }

  async function handleConfirmSave() {
    const section = pendingSaveSection;
    const errors = getSectionErrors(validatePatientForm(form), section);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setPendingSaveSection(null);
      return;
    }

    try {
      setSaving(true);
      const savedPatient = await updatePatient(patientId, form);
      setPatientOverride(savedPatient || { ...patient, ...form });
      setForm(createPatientForm(savedPatient || { ...patient, ...form }));
      setPendingSaveSection(null);
      setOpenSuccess(true);
      setEditingSection(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.patientDetails("bhc", patientId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
      ]);
    } catch {
      // The section stays open so the user can retry.
      setPendingSaveSection(null);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Saves one background section onto the latest saved background, so editing
   * medical, family and social side by side never overwrites one with another's
   * stale copy. Returns false on failure so the section keeps its edit state.
   */
  async function handleBackgroundSave(editedBackground, section) {
    try {
      setSavingBackground(true);
      const merged = mergeBackgroundSection(patient.medicalBackground, editedBackground, section);
      const savedPatient = await updatePatientMedicalBackground(patientId, merged);
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
      <ProfileShell>
        <SoftLoadingArea isLoading message="Loading patient details..." minHeight="min-h-[520px]">
          <div className="min-h-[520px] bg-white" />
        </SoftLoadingArea>
      </ProfileShell>
    );
  }

  if (loadError) {
    return (
      <ProfileShell>
        <ConnectionErrorState
          fullPage
          onRetry={retryPatientDetails}
          retrying={retrying}
          variant={
            loadError?.status === 403
              ? "forbidden"
              : loadError?.isTimeout
                ? "timeout"
                : isConnectionError(loadError)
                  ? "offline"
                  : "error"
          }
        />
      </ProfileShell>
    );
  }

  if (!patient) {
    return (
      <ProfileShell>
        <div className="mx-auto max-w-md bg-white p-10 text-center">
          <h1 className="text-xl font-semibold text-gray-900 font-sans!">Patient not found</h1>
          <Link
            to="/bhc/patients"
            className="mt-4 inline-flex rounded-none bg-red-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            Back to Patients
          </Link>
        </div>
      </ProfileShell>
    );
  }

  const motherPatientOptions = registeredPatients
    .filter((item) => String(item.id) !== String(patientId))
    .filter((item) => {
      const age = calculateAge(item.birthDate || item.birthdate);
      return item.sex === "Female" && (age === "" || Number(age) >= 12);
    })
    .filter((item) => {
      const search = motherSearch.trim().toLowerCase();
      if (!search) return true;
      return [item.fullName || item.name, item.patientId || item.id, item.barangay]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

  const tabStrip = <ProfileTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />;
  const viewRecord = (recordId) => navigate(`/bhc/health-records/${recordId}`);

  return (
    <>
      <ProfileShell>
        <div className="bhc-patient-profile flex h-full min-h-0 flex-col font-sans [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
          <PatientProfileHeader
            patient={patient}
            patientId={patientId}
            backPath={backPath}
            updating={patientUpdating}
          />

          <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
            {tabStrip}

            {activeTab === "overview" &&
              (canViewHistory ? (
                <PatientOverviewBoard
                  left={<VitalsTiles records={records} isLoading={recordsLoading} />}
                  center={
                    <AnatomyFindingsPanel
                      key={patientId}
                      background={patient.medicalBackground}
                      records={records}
                      recordsLoading={recordsLoading}
                      onViewRecord={viewRecord}
                    />
                  }
                  right={
                    <ClinicalOverviewColumn
                      patient={patient}
                      careTracking={careTracking}
                      programLabels={programLabels}
                      referrals={referrals}
                      referralsLoading={referralsLoading}
                      referralsError={Boolean(referralsError)}
                      activeFollowUps={activeFollowUps}
                      records={records}
                      recordsLoading={recordsLoading}
                      onEditBackground={() => setActiveTab("patient-info")}
                      onViewPrograms={() => setActiveTab("programs")}
                      onViewReferrals={() => setActiveTab("referrals")}
                      onViewReferral={(trackingId) => navigate(`/bhc/referrals/${trackingId}`)}
                      onViewFollowUps={() => setActiveTab("follow-ups")}
                      onViewFollowUp={(taskId) => navigate(`/bhc/follow-ups/${taskId}`)}
                      onViewRecords={() => setActiveTab("records")}
                      onViewRecord={viewRecord}
                    />
                  }
                />
              ) : (
                <p
                  role="tabpanel"
                  id="profile-panel-overview"
                  aria-labelledby="profile-tab-overview"
                  className="flex items-center gap-2 py-2 text-sm text-gray-600"
                >
                  <Lock size={14} className="shrink-0" aria-hidden="true" />
                  Clinical history is restricted for your role.
                </p>
              ))}

            {activeTab !== "overview" && (
              <div
                role="tabpanel"
                id={`profile-panel-${activeTab}`}
                aria-labelledby={`profile-tab-${activeTab}`}
                className="akay-content-scroll min-h-0 flex-1 overflow-y-auto"
              >
                {activeTab === "patient-info" && (
                  <RegistrationSections
                    patient={patient}
                    form={form}
                    editingSection={editingSection}
                    onEdit={handleEditSection}
                    onCancel={handleCancelEdit}
                    onSave={handleRequestSave}
                    onChange={handleChange}
                    fieldErrors={fieldErrors}
                    saving={saving}
                    motherSearch={motherSearch}
                    motherPatientOptions={motherPatientOptions}
                    onMotherSearchChange={setMotherSearch}
                    onMotherPatientChange={handleMotherPatientChange}
                  />
                )}

                {activeTab === "patient-info" &&
                  canViewHistory &&
                  BACKGROUND_SECTION_KEYS.map((section) => (
                    <PatientBackgroundTab
                      key={section}
                      variant="flat"
                      section={section}
                      background={patient.medicalBackground}
                      saving={savingBackground}
                      onSave={handleBackgroundSave}
                    />
                  ))}

                {activeTab === "programs" && canViewHistory && (
                  <CareAndProgramsTab
                    patient={patient}
                    patientId={patientId}
                    records={records}
                    basePath="/bhc"
                    onViewProgramRecords={handleViewProgramRecords}
                  />
                )}

                {activeTab === "follow-ups" && canViewHistory && (
                  <FollowUpsByStatus
                    followUps={patientFollowUps}
                    onViewFollowUp={(taskId) => navigate(`/bhc/follow-ups/${taskId}`)}
                  />
                )}

                {activeTab === "records" && canViewHistory && (
                  <RecordsTimeline
                    records={records}
                    patient={patient}
                    conditionalAreas={conditionalProgramAreas}
                    isLoading={recordsLoading}
                    isFetching={recordsFetching}
                    isError={Boolean(recordsError)}
                    onView={viewRecord}
                    initialFilter={recordsFilter}
                  />
                )}

                {activeTab === "referrals" && canViewHistory && (
                  <ReferralsSection
                    referrals={referrals}
                    isLoading={referralsLoading}
                    isFetching={referralsFetching}
                    isError={Boolean(referralsError)}
                    onView={(trackingId) => navigate(`/bhc/referrals/${trackingId}`)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </ProfileShell>

      <ConfirmationModal
        open={pendingSaveSection !== null}
        title="Update Changes to Profile?"
        description="Please confirm that you want to update the patient information."
        confirmText="Save Changes"
        cancelText="Cancel"
        onConfirm={handleConfirmSave}
        onCancel={() => setPendingSaveSection(null)}
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
