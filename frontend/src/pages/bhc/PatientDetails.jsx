import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
  SoftLoadingArea,
  SoftLoadingOverlay,
  StatusBadge,
  SuccessModal,
} from "../../components/common";
import SpecializedRecordsTab from "../../components/features/records/SpecializedRecordsTab";
import { isConnectionError } from "../../services/apiClient";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import {
  getPatientById,
  getPatientHealthRecords,
  getPatientReferrals,
  getPatientDetailsListByRole,
  updatePatient,
} from "../../services/patientService";
import {
  formatDate,
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../utils/formatters";
import {
  getRecordIdLabel,
  getServiceTypeLabel,
} from "../../utils/healthRecordPrograms";
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
  general: "General",
  records: "Health Records",
  specialized: "Specialized Records",
  referrals: "Referral History",
};

export default function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [patientOverride, setPatientOverride] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [isEditing, setIsEditing] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [form, setForm] = useState({});
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
  }, [patientData]);

  useEffect(() => {
    setActiveTab("general");
    setShowAllRecords(false);
    setShowAllReferrals(false);
    setIsEditing(false);
  }, [patientId]);

  function handleTabChange(tab) {
    if (isEditing) {
      setForm(createPatientForm(patient));
      setIsEditing(false);
    }
    setActiveTab(tab);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "birthDate") next.age = calculateAge(value);
      if (name === "philHealthStatus" && value !== "With PhilHealth") {
        next.philHealthNumber = "";
      }
      return next;
    });
  }

  function handleMotherPatientChange(value) {
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

  async function handleInlineSubmit() {
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
    } catch (error) {
      console.error("Failed to update patient profile:", error);
    } finally {
      setSaving(false);
    }
  }

  if (patientLoading && !patient) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <SoftLoadingArea
          isLoading
          message="Loading details..."
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
          title={isConnectionError(loadError) ? "Connection Lost" : "Unable to Load Data"}
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

  const records = (Array.isArray(recordsData) ? recordsData : []).sort(
    sortByDateDesc,
  );
  const referrals = (Array.isArray(referralsData) ? referralsData : []).sort(
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
  return (
    <>
      <DashboardLayout role="bhc" title="Patient Details">
        <SoftLoadingArea
          isLoading={patientFetching}
          message="Refreshing details..."
          minHeight="min-h-[520px]"
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/bhc/patients"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#0F172A]"
            >
              <ArrowLeft size={16} />
              Back to Patients
            </Link>
            <div className="flex flex-wrap gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(createPatientForm(patient));
                      setIsEditing(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenConfirm(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                  >
                    <Check size={14} /> Save Changes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("general");
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                >
                  <Pencil size={14} /> Edit Profile
                </button>
              )}
              {activeTab === "records" && !isEditing && (
                <Link
                  to={`/bhc/health-records/add?patientId=${patient.id || patientId}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                >
                  <Plus size={14} />
                  Add Health Record
                </Link>
              )}
            </div>
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <QuickPatientProfile
              patient={patient}
              patientId={patientId}
              activeFollowUp={activePatientFollowUp}
            />

<section className="min-w-0">
  <nav
    className="flex overflow-x-auto"
    aria-label="Patient chart sections"
  >
    {Object.entries(TAB_LABELS).map(([key, label]) => {
      const count =
        key === "records"
          ? records.length
          : key === "referrals"
              ? referrals.length
              : null;

      return (
        <button
          key={key}
          type="button"
          onClick={() => handleTabChange(key)}
          className={`shrink-0 rounded-t-xl border border-b-0 px-5 py-3 text-xs font-semibold transition ${
            activeTab === key
              ? "border-slate-200 bg-white text-[#B91C1C]"
              : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-800"
          }`}
        >
          {label}
          {count !== null && ` (${count})`}
        </button>
      );
    })}
  </nav>

  <div className="rounded-b-2xl rounded-tr-2xl border border-slate-200 bg-white p-5 shadow-sm">

              {activeTab === "general" && (
                <GeneralPatientTab
                  patient={patient}
                  form={form}
                  isEditing={isEditing}
                  onChange={handleChange}
                  motherSearch={motherSearch}
                  motherPatientOptions={motherPatientOptions}
                  onMotherSearchChange={setMotherSearch}
                  onMotherPatientChange={handleMotherPatientChange}
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
                  followUpTasks={patientFollowUps}
                  onToggleShowAll={() => setShowAllRecords((value) => !value)}
                  onView={(recordId) =>
                    navigate(`/bhc/health-records/${recordId}`)
                  }
                />
              )}

              {activeTab === "specialized" && (
                <SpecializedRecordsTab
                  records={records}
                  patient={patient}
                  basePath="/bhc"
                />
              )}

              {activeTab === "referrals" && (
                <ReferralHistoryTab
                  referrals={referrals}
                  visibleReferrals={visibleReferrals}
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
                />
              )}
          </div>
        </section>
          </div>
        </SoftLoadingArea>
      </DashboardLayout>

      <ConfirmationModal
        open={openConfirm}
        title="Update Changes to Profile?"
        description="Please confirm that you want to update the patient information."
        confirmText="Update Profile"
        cancelText="Cancel"
        onConfirm={handleInlineSubmit}
        onCancel={() => setOpenConfirm(false)}
        loading={saving}
      />
      <SuccessModal
        open={openSuccess}
        title="Changes Successfully Saved"
        description="The patient profile has been successfully updated."
        onClose={() => setOpenSuccess(false)}
      />
    </>
  );
}

function QuickPatientProfile({ patient, patientId, activeFollowUp }) {
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const ageSex = [
    getPatientValue(patient, ["age"], ""),
    getPatientValue(patient, ["sex"], ""),
  ]
    .filter(hasDisplayValue)
    .map((value, index) => (index === 0 ? `${value} yrs` : value))
    .join(" / ");

  return (
    <aside className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Patient Profile
        </p>
        <h1 className="mt-3 break-words text-lg font-bold text-[#0F172A]">
          {patientName}
        </h1>
        <span className="mt-2 inline-flex rounded-md border border-red-100 bg-red-50 px-2 py-1 font-mono text-[10px] font-bold text-[#B91C1C]">
          ID #{patient.patientId || patientId}
        </span>
        {activeFollowUp && (
          <div className="mt-2 flex justify-center">
            <FollowUpStateBadge
              state={activeFollowUp.effectiveState}
              date={activeFollowUp.dueDate}
              context="profile"
            />
          </div>
        )}
      </div>
      <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 pt-3">
        <QuickDetail label="Age / Sex" value={ageSex} />
        <QuickDetail
          label="Date of Birth"
          value={formatLongDate(
            getPatientValue(patient, [
              "birthDate",
              "birthdate",
              "dateOfBirth",
              "date_of_birth",
            ]),
            "Not recorded",
          )}
        />
        <QuickDetail
          label="Contact Number"
          value={getPatientValue(patient, [
            "contact",
            "contactNumber",
            "contact_number",
          ])}
        />
        <QuickDetail label="Barangay" value={patient.barangay} />
        <QuickDetail
          label="Municipality"
          value={getPatientValue(patient, ["municipality", "city"])}
        />
      </dl>
    </aside>
  );
}

function QuickDetail({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs font-medium text-slate-500">
        {label}
      </dt>

      <dd className="max-w-[58%] break-words text-right text-xs font-semibold text-[#0F172A]">
        {formatDisplayValue(value, "Not recorded")}
      </dd>
    </div>
  );
}

function GeneralPatientTab({
  patient,
  form,
  isEditing,
  onChange,
  motherSearch,
  motherPatientOptions,
  onMotherSearchChange,
  onMotherPatientChange,
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
  const showChildSections =
    hasParentData ||
    hasBirthData ||
    Number(getPatientValue(patient, ["age"], 99)) < 18;

  if (isEditing) {
    return (
      <div className="space-y-7">
        <RegistrationSection
          title="Basic Information"
          description="Identity and demographic information from registration."
        >
          <EditField label="First Name" name="firstName" value={form.firstName} onChange={onChange} required />
          <EditField label="Middle Name" name="middleName" value={form.middleName} onChange={onChange} />
          <EditField label="Last Name" name="lastName" value={form.lastName} onChange={onChange} required />
          <EditField label="Date of Birth" name="birthDate" type="date" value={form.birthDate} onChange={onChange} required />
          <EditField label="Age" name="age" value={form.age} readOnly />
          <EditSelect label="Sex" name="sex" value={form.sex} onChange={onChange} required>
            <option value="">Select sex</option>
            <option>Male</option>
            <option>Female</option>
          </EditSelect>
        </RegistrationSection>

        <RegistrationSection
          title="Socio-Demographic Information"
          description="Household and social profile information."
        >
          <EditSelect label="Civil Status" name="civilStatus" value={form.civilStatus} onChange={onChange}>
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
            <EditField label="PhilHealth Number" name="philHealthNumber" value={form.philHealthNumber} onChange={onChange} />
          )}
        </RegistrationSection>

        <RegistrationSection
          title="Address Information"
          description="Registered residential address."
        >
          <EditField label="Street Address" name="streetAddress" value={form.streetAddress} onChange={onChange} />
          <EditField label="Purok / Area" name="purokArea" value={form.purokArea} onChange={onChange} />
          <EditSelect label="Barangay" name="barangay" value={form.barangay} onChange={onChange}>
            <option value="">Select barangay</option>
            {BULAKAN_BARANGAYS.map((barangay) => (
              <option key={barangay}>{barangay}</option>
            ))}
          </EditSelect>
          <EditField label="Municipality / City" name="municipality" value={form.municipality} onChange={onChange} />
        </RegistrationSection>

        {showChildSections && (
          <RegistrationSection
            title="Parent / Household Information"
            description="Parent and guardian details saved for this patient."
          >
            <EditField label="Mother Name" name="motherName" value={form.motherName} onChange={onChange} />
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
      >
        <DetailItem label="First Name" value={getPatientValue(patient, ["firstName", "first_name"])} />
        <DetailItem label="Middle Name" value={getPatientValue(patient, ["middleName", "middle_name"])} />
        <DetailItem label="Last Name" value={getPatientValue(patient, ["lastName", "last_name"])} />
        <DetailItem
          label="Date of Birth"
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

function RegistrationSection({ title, description, children }) {
  return (
    <section>
      <div>
        <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{description}</p>
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

function EditField({ label, required, readOnly, ...props }) {
  return (
    <label className="min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="text-[#B91C1C]"> *</span>}
      </span>
      <input
        {...props}
        required={required}
        readOnly={readOnly}
        className={`mt-1.5 h-10 w-full min-w-0 rounded-xl border px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          readOnly
            ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-500"
            : "border-slate-200 bg-white"
        }`}
      />
    </label>
  );
}

function EditSelect({ label, required, children, ...props }) {
  return (
    <label className="min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="text-[#B91C1C]"> *</span>}
      </span>
      <select
        {...props}
        required={required}
        className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      >
        {children}
      </select>
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
  followUpTasks = [],
  onToggleShowAll,
  onView,
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200">
      <TabHeader
        title="Health Record History"
        subtitle="Complete chronological visit history for this patient."
      />
      {isError && records.length === 0 ? (
        <TabErrorState message="Unable to load health records right now." />
      ) : records.length === 0 && !isLoading ? (
        <TabEmptyState
          icon={<FileText size={32} />}
          message="No health records found for this patient."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Record ID</th>
                <th className="px-4 py-3">Date of Visit</th>
                <th className="px-4 py-3">Service Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleRecords.map((record) => {
                const recordId = getHealthRecordId(record);
                const followUpState = getRecordFollowUpState(record, followUpTasks);
                return (
                  <tr key={recordId} className="transition hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-bold text-[#B91C1C]">
                      {getRecordIdLabel(record)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">
                      {getHealthRecordDate(record)}
                    </td>
                    <td className="px-4 py-4 text-xs font-semibold text-[#0F172A]">
                      {getServiceTypeLabel(record)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {followUpState ? (
                        <FollowUpStateBadge state={followUpState} />
                      ) : (
                        <span className="text-sm font-semibold text-slate-300">
                          &mdash;
                        </span>
                      )}
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
          {records.length > 5 && (
            <ShowAllButton
              showAll={showAll}
              count={records.length}
              noun="records"
              onClick={onToggleShowAll}
            />
          )}
        </div>
      )}
      <SoftLoadingOverlay
        isVisible={isLoading || (isFetching && records.length > 0)}
        message={isLoading ? "Loading records..." : "Refreshing records..."}
      />
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
      />
      {isError && referrals.length === 0 ? (
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
      <SoftLoadingOverlay
        isVisible={isLoading || (isFetching && referrals.length > 0)}
        message={
          isLoading ? "Loading referrals..." : "Refreshing referrals..."
        }
      />
    </div>
  );
}

function TabHeader({ title, subtitle }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
      <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
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
    upcoming: "border-slate-200 bg-slate-50 text-slate-600",
    rescheduled: "border-slate-200 bg-slate-50 text-slate-600",
    due_today: "border-amber-200 bg-amber-50 text-amber-700",
    no_show: "border-red-200 bg-red-50 text-red-700",
    fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-slate-200 bg-slate-100 text-slate-500",
  };
  const labels = {
    upcoming: "Pending",
    rescheduled: "Pending",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
    cancelled: "Cancelled",
  };
  const profileLabels = {
    upcoming: "Pending Follow-up",
    rescheduled: "Pending Follow-up",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
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

function getRecordFollowUpState(record = {}, tasks = []) {
  const recordId = getHealthRecordId(record);
  if (!recordId) return "";

  const linkedTasks = tasks
    .filter((task) => getFollowUpTaskRecordId(task) === recordId)
    .sort((a, b) => getDateTimeValue(a) - getDateTimeValue(b));
  const activeTask = linkedTasks.find((task) =>
    isActiveFollowUpState(task.effectiveState),
  );
  if (activeTask) return activeTask.effectiveState;

  const completedTask = linkedTasks.find(
    (task) => task.effectiveState === "fulfilled",
  );
  return completedTask ? "fulfilled" : "";
}

function getFollowUpTaskRecordId(task = {}) {
  return String(
    task.healthRecordId ||
      task.health_record_id ||
      getHealthRecordId(task.healthRecord) ||
      "",
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
