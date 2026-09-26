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
import RegistrationSections from "../../components/features/patients/profile/RegistrationSections";
import RecordsTimeline from "../../components/features/patients/profile/RecordsTimeline";
import {
  FollowUpsSection,
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

function ProfileShell({ children }) {
  return (
    <DashboardLayout role="bhc" title="Patient Details">
      {children}
    </DashboardLayout>
  );
}

/**
 * BHC patient profile: one tab-free chart. An identity bar and a header
 * of alerts, programs, care status and vitals sit above two columns - the
 * patient's registration and history on the left (each section edits inline),
 * the records timeline, follow-ups and referrals on the right.
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
  // Programs Women's Health and Pediatric/EPI already own, so NCD and TB (which
  // only appear once records exist) are the only extra enrollments to list.
  const programLabels = useMemo(() => {
    const claimed = new Set(conditionalProgramAreas.flatMap((area) => area.programs));
    return [
      ...conditionalProgramAreas.filter((area) => area.applicable).map((area) => area.label),
      ...getSpecializedRecordPrograms(records)
        .filter(({ key }) => !claimed.has(key))
        .map(({ label }) => label),
    ];
  }, [conditionalProgramAreas, records]);
  const openReferralCount = referrals.filter((referral) => !referral.completedAt).length;

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
          <h1 className="text-xl font-semibold text-slate-900 font-sans!">Patient not found</h1>
          <Link
            to="/bhc/patients"
            className="mt-4 inline-flex rounded-md bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
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

  return (
    <>
      <ProfileShell>
        <div className="bhc-patient-profile min-h-[520px] bg-white px-4 pb-8 font-sans sm:px-6 [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
          <PatientProfileHeader
            patient={patient}
            patientId={patientId}
            backPath={backPath}
            updating={patientUpdating}
            canViewHistory={canViewHistory}
            records={records}
            recordsLoading={recordsLoading}
            programLabels={programLabels}
            followUps={patientFollowUps}
            activeFollowUps={activeFollowUps}
            openReferralCount={openReferralCount}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* On narrow screens the records come first: recent visits matter
                more at the bedside than registration details. */}
            <div className="@container order-2 min-w-0 max-lg:mt-2 max-lg:border-t max-lg:border-slate-200 max-lg:pt-5 lg:order-1">
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
              {canViewHistory &&
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
            </div>

            <div className="order-1 min-w-0 lg:order-2 lg:border-l lg:border-slate-200 lg:pl-10">
              {canViewHistory ? (
                <>
                  <RecordsTimeline
                    records={records}
                    patient={patient}
                    conditionalAreas={conditionalProgramAreas}
                    isLoading={recordsLoading}
                    isFetching={recordsFetching}
                    isError={Boolean(recordsError)}
                    onView={(recordId) => navigate(`/bhc/health-records/${recordId}`)}
                  />
                  <FollowUpsSection
                    followUps={patientFollowUps}
                    onViewFollowUp={(taskId) => navigate(`/bhc/follow-ups/${taskId}`)}
                  />
                  <ReferralsSection
                    referrals={referrals}
                    isLoading={referralsLoading}
                    isFetching={referralsFetching}
                    isError={Boolean(referralsError)}
                    onView={(trackingId) => navigate(`/bhc/referrals/${trackingId}`)}
                  />
                </>
              ) : (
                <p className="flex items-center gap-2 py-2 text-sm text-slate-500">
                  <Lock size={14} className="shrink-0" aria-hidden="true" />
                  Clinical history is restricted for your role.
                </p>
              )}
            </div>
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
