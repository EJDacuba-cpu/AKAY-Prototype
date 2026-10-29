import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import RestrictedArea from "../../components/common/access/RestrictedArea";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "../../components/features/patients/profile/patient-overview.css";
import {
  ConfirmationModal,
  ConnectionErrorState,
  SoftLoadingArea,
  SuccessModal,
} from "../../components/common";
import PatientBackgroundTab from "../../components/features/patients/PatientBackgroundTab";
import PatientHistoryReference from "../../components/features/patients/PatientHistoryReference";
import PatientProfileHeader from "../../components/features/patients/profile/PatientProfileHeader";
import CarePath from "../../components/features/patients/profile/CarePath";
import PatientOverviewBoard from "../../components/features/patients/profile/PatientOverviewBoard";
import VitalsTiles from "../../components/features/patients/profile/VitalsTiles";
import ClinicalOverviewColumn from "../../components/features/patients/profile/ClinicalOverviewColumn";
import AnatomyFindingsPanel from "../../components/features/patients/profile/AnatomyFindingsPanel";
import RegistrationSections from "../../components/features/patients/profile/RegistrationSections";
import PatientRecordsTab from "../../components/features/patients/profile/PatientRecordsTab";
import ProfileTabs, { LockedOverviewPlaceholder } from "../../components/features/patients/profile/ProfileTabs";
import CareAndProgramsTab from "../../components/features/patients/profile/CareAndProgramsTab";
import { ReferralsSection } from "../../components/features/patients/profile/FollowUpsAndReferrals";
import { getConditionalProgramTabs } from "../../utils/programApplicability";
import { getBhcPatientProfileQueries } from "../../services/patientProfileQueries";
import { updatePatient } from "../../services/patientService";
import { buildPatientRecordDetailsState, getProfileReturnPath } from "../../utils/profileNavigation";
import { getSpecializedRecordPrograms } from "../../utils/healthRecordPrograms";
import { getCareTracking } from "../../utils/careTracking";
import { calculateAge, normalizePhilippineContact } from "../../utils/patientUtils";
import { queryKeys } from "../../utils/queryKeys";
import usePatientConditionGroups from "../../hooks/usePatientConditionGroups";
import { getCurrentUser } from "../../utils/auth";
import {
  createPatientForm,
  getPatientAge,
  getPatientBirthDate,
  getSectionErrors,
  orderFollowUps,
  sortByDateDesc,
  validatePatientForm,
} from "../../utils/patientProfile";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { registrationErrors } from "../../utils/householdData";

// The profile fills the whole content area inside an even 12-16px margin.
const PROFILE_CONTENT_CLASS = "patient-profile-content p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4";

function ProfileShell({ children }) {
  return (
    <DashboardLayout role="bhc" title="Patient Details" contentClassName={PROFILE_CONTENT_CLASS}>
      {children}
    </DashboardLayout>
  );
}

/**
 * BHC patient profile: the identity header and tab strip, then the active
 * tab, filling the available width and height. Overview is a card board that
 * fills the space under the tabs (latest vitals on the left; the body figure
 * with its conditions / allergies / medications dropdowns in the middle; the
 * background, referrals, follow-ups, programs and visits cards on the right).
 * Every other tab scrolls inside its own panel, so the header and tabs stay put.
 * Past Medical / Family / Personal & Social History have their own Patient
 * Background tab (read-only). Staff update them during a consultation; they
 * apply on finalize. Overview has a read-only Patient History reference.
 */
export default function PatientDetails() {
  return <LivePatientDetails />;
}

function LivePatientDetails() {
  const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
  const canRegister = (getCurrentUser()?.permissions || []).includes("patients.register");
  const canViewFamilies = (getCurrentUser()?.permissions || []).includes("families.view");
  const { patientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Explicit origin passed by whoever opened the profile; Patients otherwise.
  const backPath = getProfileReturnPath(location, "/bhc/patients");
  const queryClient = useQueryClient();
  const [patientOverride, setPatientOverride] = useState(null);
  // Which registration section is open for editing (one at a time), or null.
  const [editingSection, setEditingSection] = useState(null);
  const [pendingSaveSection, setPendingSaveSection] = useState(null);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const editingSectionRef = useRef(null);

  const profileQueries = getBhcPatientProfileQueries(patientId, { canViewHistory });

  const {
    data: patientData,
    isLoading: patientLoading,
    isFetching: patientFetching,
    error: patientError,
    refetch: refetchPatient,
  } = useQuery({ ...profileQueries.patient, enabled: Boolean(patientId) });

  const {
    data: recordsData = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    error: recordsError,
    refetch: refetchRecords,
  } = useQuery(profileQueries.records);

  const {
    data: referralsData = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery(profileQueries.referrals);

  const {
    data: followUpTasksData = [],
    isLoading: followUpsLoading,
    isFetching: followUpsFetching,
    error: followUpsError,
    refetch: refetchFollowUps,
  } = useQuery(profileQueries.followUps);

  const overrideMatchesPatient =
    patientOverride &&
    String(patientOverride.id || patientOverride.patientId || "") === String(patientId);
  const patient = overrideMatchesPatient ? patientOverride : patientData || null;
  const conditions = usePatientConditionGroups(patientId, patient?.medicalBackground?.currentDiseases);
  const loadError =
    patientError ||
    (canViewHistory && searchParams.get("tab") !== "records" && (recordsError || referralsError || followUpsError)) ||
    null;
  const retrying =
    patientFetching ||
    recordsFetching ||
    referralsFetching ||
    followUpsFetching;
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
          // Read-only latest chart; visit details stay on Health Records.
          { key: "background", label: "Patient Background" },
          {
            key: "programs",
            label: "Care & Programs",
            count: careTracking.filter((entry) => entry.records.length > 0).length || null,
          },
          { key: "records", label: "Health Records", count: recordsLoading ? null : records.length },
          { key: "referrals", label: "Referrals", count: referralsLoading ? null : referrals.length },
        ]
      : []),
  ];

  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = tabs.some(tab => tab.key === requestedTab) ? requestedTab : "overview";

  function setActiveTab(tab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true, state: location.state });
  }

  function handleViewProgramRecords() {
    setActiveTab("records");
  }

  function retryPatientDetails() {
    refetchPatient();
    refetchRecords();
    refetchReferrals();
    refetchFollowUps();
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

  // "Edit Patient" entry points link here with ?tab=patient-info&edit=<section>; open that section once the patient loads.
  const requestedEdit = searchParams.get("edit");
  useEffect(() => {
    if (!requestedEdit || !patientData) return;
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true, state: location.state });
    if (canRegister && ["demographics", "contact", "family"].includes(requestedEdit) && editingSectionRef.current === null) {
      setForm(createPatientForm(patientData));
      setFieldErrors({});
      setEditingSection(requestedEdit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedEdit, patientData]);

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

  function handleEditSection(section) {
    if (!canRegister) return;
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
    if (!canRegister) return;
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
    } catch (error) {
      // The section stays open so the user can retry; field errors (such as
      // Education) show on their inputs.
      if (error?.status === 422 && error?.errors) setFieldErrors(registrationErrors(error));
      setPendingSaveSection(null);
    } finally {
      setSaving(false);
    }
  }

  if (patientLoading && !patient) {
    return (
      <ProfileShell>
        <SoftLoadingArea skeleton="patient-details" isLoading message="Loading patient details..." minHeight="min-h-[520px]">
          <div className="min-h-[520px]" />
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
          variant={errorStateVariant(loadError)}
        />
      </ProfileShell>
    );
  }

  if (!patient) {
    return (
      <ProfileShell>
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-neutral-200/80 bg-white p-10 text-center shadow-card">
          <h1 className="text-xl font-semibold text-neutral-900 font-sans!">Patient not found</h1>
          <Link
            to="/bhc/patients"
            className="mt-4 inline-flex rounded-lg bg-ink-700 px-4 py-2.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600"
          >
            Back to Patients
          </Link>
        </div>
      </ProfileShell>
    );
  }

  const historyReference =
    activeTab === "overview" && canViewHistory ? (
      <PatientHistoryReference
        patient={patient}
        background={patient.medicalBackground}
        conditions={conditions}
      />
    ) : null;
  // PatientBackgroundTab is keyed by patient below, so an open section edit is
  // never carried over to another patient's profile.
  const tabStrip = (
    <ProfileTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} aside={historyReference} />
  );
  const detailsState = buildPatientRecordDetailsState(location);
  const viewRecord = (recordId) => navigate(`/bhc/health-records/${recordId}`, { state: detailsState });

  return (
    <>
      <ProfileShell>
        <div className="bhc-patient-profile flex h-full min-h-0 flex-col flow:h-auto font-sans [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
          <PatientProfileHeader
            patient={patient}
            patientId={patientId}
            backPath={backPath}
            updating={patientUpdating}
            carePath={
              canViewHistory ? (
                <CarePath
                  referrals={referrals}
                  conditions={conditions}
                  isLoading={(referralsLoading && referrals.length === 0) || conditions.isLoading}
                />
              ) : null
            }
          />

          <div className="patient-profile-panels @container flex min-h-0 min-w-0 flex-1 flex-col flow:flex-none">
            {tabStrip}

            {activeTab === "overview" &&
              (canViewHistory ? (
                <PatientOverviewBoard
                  anatomyWorkspace
                  center={
                    <AnatomyFindingsPanel
                      vitals={<VitalsTiles records={records} isLoading={recordsLoading} />}
                      key={patientId}
                      age={getPatientAge(patient)}
                      background={patient.medicalBackground}
                      conditions={conditions}
                      sex={patient.sex}
                      birthDate={getPatientBirthDate(patient)}
                      records={records}
                      recordsLoading={recordsLoading}
                      recordsError={Boolean(recordsError)}
                      onViewRecord={viewRecord}
                    />
                  }
                  right={
                    <ClinicalOverviewColumn
                      careTracking={careTracking}
                      programLabels={programLabels}
                      referrals={referrals}
                      referralsLoading={referralsLoading}
                      referralsError={Boolean(referralsError)}
                      activeFollowUps={activeFollowUps}
                      records={records}
                      recordsLoading={recordsLoading}
                      onViewPrograms={() => setActiveTab("programs")}
                      onViewReferrals={() => setActiveTab("referrals")}
                      onViewReferral={(trackingId) => navigate(`/bhc/referrals/${trackingId}`, { state: detailsState })}
                      onViewFollowUp={() => navigate("/bhc/follow-ups")}
                      onViewRecords={() => setActiveTab("records")}
                      onViewRecord={viewRecord}
                    />
                  }
                />
              ) : (
                <div
                  role="tabpanel"
                  id="profile-panel-overview"
                  aria-labelledby="profile-tab-overview"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <RestrictedArea
                    locked
                    label="Health Records & History"
                    className="min-h-0 flex-1 rounded-xl"
                    placeholder={<LockedOverviewPlaceholder />}
                  />
                </div>
              ))}

            {activeTab !== "overview" && (
              <div
                role="tabpanel"
                id={`profile-panel-${activeTab}`}
                aria-labelledby={`profile-tab-${activeTab}`}
                className="akay-content-scroll min-h-0 flex-1 overflow-y-auto flow:flex-none flow:overflow-visible"
              >
                {activeTab === "patient-info" && (
                  <RegistrationSections
                    patient={patient}
                    form={form}
                    editingSection={editingSection}
                    onEdit={canRegister ? handleEditSection : undefined}
                    householdLocked={Boolean(patient.householdId)}
                    onViewHousehold={patient.householdId && canViewFamilies ? () => navigate(`/bhc/families/${patient.householdId}`) : undefined}
                    onCancel={handleCancelEdit}
                    onSave={handleRequestSave}
                    onChange={handleChange}
                    fieldErrors={fieldErrors}
                    saving={saving}
                  />
                )}

                {activeTab === "background" && canViewHistory && (
                  <PatientBackgroundTab
                    key={patientId}
                    patientId={patientId}
                    patient={patient}
                    background={patient.medicalBackground}
                    conditions={conditions}
                    basePath="/bhc"
                    canEdit={false}
                  />
                )}

                {activeTab === "programs" && canViewHistory && (
                  <CareAndProgramsTab
                    patient={patient}
                    patientId={patientId}
                    records={records}
                    isLoading={recordsLoading}
                    isError={Boolean(recordsError)}
                    onRetryRecords={refetchRecords}
                    basePath="/bhc"
                    onViewProgramRecords={handleViewProgramRecords}
                    onViewRecord={viewRecord}
                  />
                )}

                {activeTab === "records" && canViewHistory && (
                  <PatientRecordsTab
                    patientId={patientId}
                    records={records}
                    referrals={referrals}
                    followUps={patientFollowUps}
                    isLoading={recordsLoading || referralsLoading || followUpsLoading}
                    isFetching={recordsFetching || referralsFetching || followUpsFetching}
                    isError={Boolean(recordsError || referralsError || followUpsError)}
                    onRetry={retryPatientDetails}
                    detailsState={detailsState}
                  />
                )}

                {activeTab === "referrals" && canViewHistory && (
                  <ReferralsSection
                    referrals={referrals}
                    isLoading={referralsLoading}
                    isFetching={referralsFetching}
                    isError={Boolean(referralsError)}
                    onView={(trackingId) => navigate(`/bhc/referrals/${trackingId}`, { state: detailsState })}
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
