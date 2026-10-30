import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import RestrictedArea from "../../components/common/access/RestrictedArea";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ConnectionErrorState,
  SoftLoadingArea,
  SuccessModal,
} from "../../components/common";
import PatientProfileHeader from "../../components/features/patients/profile/PatientProfileHeader";
import ProfileQueueAction from "../../components/features/rhu-queue/ProfileQueueAction";
import { formatPatientName } from "../../utils/formatters";
import CarePath from "../../components/features/patients/profile/CarePath";
import PatientOverviewBoard from "../../components/features/patients/profile/PatientOverviewBoard";
import VitalsTiles from "../../components/features/patients/profile/VitalsTiles";
import ClinicalOverviewColumn from "../../components/features/patients/profile/ClinicalOverviewColumn";
import AnatomyFindingsPanel from "../../components/features/patients/profile/AnatomyFindingsPanel";
import RegistrationSections from "../../components/features/patients/profile/RegistrationSections";
import PatientRecordsTab from "../../components/features/patients/profile/PatientRecordsTab";
import CareAndProgramsTab from "../../components/features/patients/profile/CareAndProgramsTab";
import ProfileTabs, { LockedOverviewPlaceholder } from "../../components/features/patients/profile/ProfileTabs";
import PatientReferralsTab from "../../components/features/patients/profile/PatientReferralsTab";
import SpecializedRecordsTab from "../../components/features/records/SpecializedRecordsTab";
import { getRhuPatientProfileQueries } from "../../services/patientProfileQueries";
import { updatePatient } from "../../services/patientService";
import { buildPatientRecordDetailsState, getProfileReturnPath } from "../../utils/profileNavigation";
import { getSpecializedRecordPrograms } from "../../utils/healthRecordPrograms";
import { getCareTracking } from "../../utils/careTracking";
import { getConditionalProgramTabs } from "../../utils/programApplicability";
import { isInfantAt } from "../../utils/infantVisibility";
import { calculateAge, normalizePhilippineContact } from "../../utils/patientUtils";
import { queryKeys } from "../../utils/queryKeys";
import usePatientConditionGroups from "../../hooks/usePatientConditionGroups";
import { getCurrentUser } from "../../utils/auth";
import {
  createPatientForm,
  getPatientAge,
  getPatientBirthDate,
  getSectionErrors,
  sortByDateDesc,
  validatePatientForm,
} from "../../utils/patientProfile";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { registrationErrors } from "../../utils/householdData";
import { canModifyRhuPatient } from "../../utils/rhuPatientAccess";
import { reviewReferralSlipPath } from "../../utils/rhuVisitRoutes";

const PROFILE_CONTENT_CLASS = "p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4";
const BASE_PATH = "/rhu";

function ProfileShell({ children }) {
  return (
    <DashboardLayout role="rhu" title="Patient Details" contentClassName={PROFILE_CONTENT_CLASS}>
      {children}
    </DashboardLayout>
  );
}

export default function RHUPatientDetails() {
  return <LiveRHUPatientDetails />;
}

function LiveRHUPatientDetails() {
  const user = getCurrentUser();
  const canViewHistory = (user?.permissions || []).includes("clinical.history");
  const { patientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const backPath = getProfileReturnPath(location, `${BASE_PATH}/patients`);
  const queryClient = useQueryClient();
  const [patientOverride, setPatientOverride] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [pendingSaveSection, setPendingSaveSection] = useState(null);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const editingSectionRef = useRef(null);

  const profileQueries = getRhuPatientProfileQueries(patientId, { canViewHistory });

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

  const overrideMatchesPatient =
    patientOverride &&
    String(patientOverride.id || patientOverride.patientId || "") === String(patientId);
  const patient = overrideMatchesPatient ? patientOverride : patientData || null;
  const canRegisterOwned = canModifyRhuPatient(user, patient);
  const conditions = usePatientConditionGroups(patientId, patient?.medicalBackground?.currentDiseases);
  const loadError =
    patientError ||
    (canViewHistory && searchParams.get("tab") !== "records" && (recordsError || referralsError)) ||
    null;
  const retrying = patientFetching || recordsFetching || referralsFetching;
  const patientUpdating = patientFetching && !patientLoading && Boolean(patient);

  const records = useMemo(
    () => [...(Array.isArray(recordsData) ? recordsData : [])].sort(sortByDateDesc),
    [recordsData],
  );
  const referrals = useMemo(
    () => [...(Array.isArray(referralsData) ? referralsData : [])].sort(sortByDateDesc),
    [referralsData],
  );
  const specializedRecordPrograms = useMemo(
    () => getSpecializedRecordPrograms(records),
    [records],
  );
  const conditionalProgramAreas = useMemo(
    () => (patient ? getConditionalProgramTabs(patient, records) : []),
    [patient, records],
  );
  const programLabels = useMemo(() => {
    const claimed = new Set(conditionalProgramAreas.flatMap((area) => area.programs));
    return [
      ...conditionalProgramAreas.filter((area) => area.applicable).map((area) => area.label),
      ...specializedRecordPrograms
        .filter(({ key }) => !claimed.has(key))
        .map(({ label }) => label),
    ];
  }, [conditionalProgramAreas, specializedRecordPrograms]);
  const careTracking = useMemo(
    () => (patient ? getCareTracking(patient, records, new Date(), { conditions: conditions.conditions || [] }) : []),
    [patient, records, conditions.conditions],
  );

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "patient-info", label: "Patient Information" },
    ...(canViewHistory
      ? [
          {
            key: "programs",
            label: "Care & Programs",
            count: careTracking.length || null,
          },
          { key: "records", label: "Health Records", count: recordsLoading ? null : records.length },
          ...specializedRecordPrograms.map(({ key, label, count }) => ({
            key: `specialized:${key}`,
            label,
            count,
            program: key,
          })),
          { key: "referrals", label: "Referrals", count: referralsLoading ? null : referrals.length },
        ]
      : []),
  ];

  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : "overview";
  const activeSpecializedProgram = tabs.find((tab) => tab.key === activeTab)?.program || "";

  function setActiveTab(tab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true, state: location.state });
  }

  function openReferralSlip(key) {
    const match = referrals.find(
      (item) => String(item.id) === String(key) || String(item.trackingId) === String(key),
    );
    navigate(reviewReferralSlipPath(patientId, match?.id || key));
  }

  function retryPatientDetails() {
    refetchPatient();
    refetchRecords();
    refetchReferrals();
  }

  useEffect(() => {
    editingSectionRef.current = editingSection;
  }, [editingSection]);

  useEffect(() => {
    if (!patientData) return;
    setPatientOverride(patientData);
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

  const requestedEdit = searchParams.get("edit");
  useEffect(() => {
    if (!requestedEdit || !patientData) return;
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true, state: location.state });
    if (canRegisterOwned && ["demographics", "contact", "family"].includes(requestedEdit) && editingSectionRef.current === null) {
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
    if (!canRegisterOwned) return;
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

  function handleRequestSave(section) {
    const errors = getSectionErrors(validatePatientForm(form), section);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setPendingSaveSection(section);
  }

  async function handleConfirmSave() {
    if (!canRegisterOwned) return;
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
        queryClient.invalidateQueries({ queryKey: queryKeys.patientDetails("rhu", patientId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.patients("rhu") }),
      ]);
    } catch (error) {
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
            to={`${BASE_PATH}/patients`}
            className="mt-4 inline-flex rounded-lg bg-ink-700 px-4 py-2.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600"
          >
            Back to Patients
          </Link>
        </div>
      </ProfileShell>
    );
  }

  const detailsState = buildPatientRecordDetailsState(location);
  const viewRecord = (recordId) => navigate(`${BASE_PATH}/health-records/${recordId}`, { state: detailsState });

  return (
    <>
      <ProfileShell>
        <div className="bhc-patient-profile flex h-full min-h-0 flex-col flow:h-auto font-sans [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
          <PatientProfileHeader
            patient={patient}
            patientId={patientId}
            backPath={backPath}
            updating={patientUpdating}
            consultation={false}
            actions={<ProfileQueueAction patientId={patient.id || patientId} patientName={formatPatientName(patient, "")} />}
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

          <div className="@container flex min-h-0 min-w-0 flex-1 flex-col flow:flex-none">
            <ProfileTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

            {activeTab === "overview" &&
              (canViewHistory ? (
                <PatientOverviewBoard
                  left={<VitalsTiles records={records} isLoading={recordsLoading} infant={isInfantAt(patient)} />}
                  center={
                    <AnatomyFindingsPanel
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
                      records={records}
                      recordsLoading={recordsLoading}
                      onViewPrograms={() => setActiveTab("records")}
                      onViewReferrals={() => setActiveTab("referrals")}
                      onViewReferral={(trackingId) => openReferralSlip(trackingId)}
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
                    onEdit={canRegisterOwned ? handleEditSection : undefined}
                    onCancel={handleCancelEdit}
                    onSave={handleRequestSave}
                    onChange={handleChange}
                    fieldErrors={fieldErrors}
                    saving={saving}
                  />
                )}

                {activeTab === "programs" && canViewHistory && (
                  <CareAndProgramsTab
                    patient={patient}
                    patientId={patientId}
                    records={records}
                    conditions={conditions.conditions || []}
                    isLoading={recordsLoading}
                    isError={Boolean(recordsError)}
                    onRetryRecords={refetchRecords}
                    basePath={BASE_PATH}
                    onViewProgramRecords={() => setActiveTab("records")}
                    onViewRecord={viewRecord}
                  />
                )}

                {activeTab === "records" && canViewHistory && (
                  <PatientRecordsTab
                    patientId={patientId}
                    records={records}
                    referrals={referrals}
                    isLoading={recordsLoading || referralsLoading}
                    isFetching={recordsFetching || referralsFetching}
                    isError={Boolean(recordsError || referralsError)}
                    onRetry={retryPatientDetails}
                    detailsState={detailsState}
                    role="rhu"
                    basePath={BASE_PATH}
                  />
                )}

                {activeSpecializedProgram && canViewHistory && (
                  <SpecializedRecordsTab
                    records={records}
                    patient={patient}
                    basePath={BASE_PATH}
                    program={activeSpecializedProgram}
                  />
                )}

                {activeTab === "referrals" && canViewHistory && (
                  <PatientReferralsTab
                    patientId={patientId}
                    referrals={referrals}
                    isLoading={referralsLoading}
                    isFetching={referralsFetching}
                    isError={Boolean(referralsError)}
                    onRetry={retryPatientDetails}
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
