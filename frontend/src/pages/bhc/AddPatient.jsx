import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  
  Check,
  ChevronDown,
  ClipboardList,
  House,
  MapPinHouse,
  Users,
  UserPlus,
} from "lucide-react"; // FIXED: Added missing icons

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ButtonSpinner,
  DatePickerField,
  FormInput,
  TimePickerField,
} from "../../components/common";

// Import extracted utils and components
import {
  calculateAge,
  calculateAgeInMonths,
  formatAgeDisplay,
  normalizePhilippineContact,
  formatFullName,
} from "../../utils/patientUtils";
import {
  SectionHeader,
  PhilippineContactInput,
} from "../../components/features/patients/PatientFormComponents";

import { Button } from "../../components/ui/button";
import ModalShell from "../../components/common/modals/ModalShell";
import FamilyRegistryField from "../../components/features/patients/FamilyRegistryField";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import { registrationDrafts, registrationPath } from "../../services/patientRegistrationDrafts";
import {
  ADDRESS_FIELDS, connectionForPatient, householdForConnection, patientName,
  saveMockPatient, stageConnection, validateConnection, validateHeadReplacement,
} from "../../services/mockFamilyRegistry";
import toast from "react-hot-toast";
import "../../components/features/patients/registration-form.css";
import {
  PARENT_FIELDS,
  linkParent,
  memberAgeLabel,
  parentRoleFor,
  unlinkParent,
} from "../../utils/householdParents";

// Flat bordered panel used for each registration section.
function FormPanel({ icon, title, description, children }) {
  return (
    <section className="min-w-0 border border-gray-200 bg-white p-4">
      <SectionHeader icon={icon} title={title} description={description} />
      {children}
    </section>
  );
}

const CIVIL_STATUS_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Married", label: "Married" },
];

const BARANGAY_OPTIONS = [
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
].map((barangay) => ({ value: barangay, label: barangay }));

const OCCUPATION_OPTIONS = [
  "Student",
  "Unemployed",
  "Housewife",
  "Farmer",
  "Fisherman",
  "Vendor",
  "Driver",
  "Laborer",
  "Teacher",
  "Government Employee",
  "Private Employee",
  "Self-employed",
  "Senior Citizen",
].map((occupation) => ({ value: occupation, label: occupation }));

// Initial State Definition
const INITIAL_FORM_STATE = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
  age: "",
  sex: "",
  civilStatus: "",
  occupation: "",
  spouseName: "",
  spouseOccupation: "",
  contactNumber: "",
  philHealthStatus: "",
  philHealthNumber: "",
  purokArea: "",

  streetAddress: "",
  barangay: "",
  municipality: "Bulakan",

  motherName: "",
  motherPatientId: "",
  motherBirthDate: "",
  fatherName: "",
  fatherPatientId: "",
  fatherBirthDate: "",
  familySerialNumber: "",

  birthPlace: "",
  birthTime: "",
  nhtsStatus: "",
};

function registrationForm(patient) {
  return {
    ...patient,
    ...Object.fromEntries(Object.entries(INITIAL_FORM_STATE).map(([key, initial]) => [key, patient?.[key] ?? initial])),
  };
}

export function PatientRegistrationPage({
  role = "bhc",
  basePath = "/bhc",
  patientId,
  systemDescription = "Register a new patient profile into the Barangay Health Center system.",
}) {
  const navigate = useNavigate();
  const registry = useMockFamilyRegistry();
  const draftPath = registrationPath(basePath, patientId);
  const [restoredDraft] = useState(() => registrationDrafts.read(draftPath));
  const [createdPatientId, setCreatedPatientId] = useState(restoredDraft?.createdPatientId || "");
  const editingPatientId = patientId || createdPatientId || undefined;
  const savedPatient = registry.patients.find((patient) => patient.id === editingPatientId);
  const savedConnection = connectionForPatient(savedPatient);
  const [householdConnection, setHouseholdConnection] = useState(() => restoredDraft ? restoredDraft.householdConnection : connectionForPatient(savedPatient));
  const [headReplacement, setHeadReplacement] = useState(restoredDraft?.headReplacement || null);
  const [householdReviewPending, setHouseholdReviewPending] = useState(false);
  const patientsPath = `${basePath}/patients`;
  const pageTitle = patientId ? "Edit Patient" : "Add New Patient";
  const dashboardTitle = patientId ? "Edit Patient" : "Add Patient";
  const pageDescription = patientId ? "Update patient registration details." : systemDescription;
  const backPath = patientsPath;
  const backLabel = "Back to Patients";

  // Unified State Management
  const [modals, setModals] = useState({
    confirm: false,
    success: false,
  });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => restoredDraft?.form || registrationForm(savedPatient));
  const [fieldErrors, setFieldErrors] = useState(restoredDraft?.fieldErrors || {});
  useEffect(() => {
    // Keep a handoff current after browser Back, so Forward to creation uses
    // any patient edits made since returning. Never publish a saved record.
    if (!registrationDrafts.read(draftPath)) return;
    registrationDrafts.write(draftPath, {
      form, householdConnection, headReplacement, createdPatientId,
      patientId: editingPatientId, fieldErrors,
    });
  }, [draftPath, form, householdConnection, headReplacement, createdPatientId, editingPatientId, fieldErrors]);
  const ageDisplay = formatAgeDisplay(form.birthDate);
  const ageYears = calculateAge(form.birthDate);
  const ageInMonths = calculateAgeInMonths(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isChildRegistration =
    hasBirthDate && ageYears !== "" && Number(ageYears) < 18;
  const isEpiTargetAge =
    hasBirthDate && ageInMonths !== "" && Number(ageInMonths) <= 12;
  const showGeneralProfileFields = !isEpiTargetAge;
  /**
   * "Husband Information" is only meaningful for a married patient who has a
   * husband. A married male patient has a wife, so the section is hidden and
   * the two fields are cleared rather than submitted with stale values.
   */
  const showHusbandInformation =
    showGeneralProfileFields &&
    form.civilStatus === "Married" &&
    form.sex !== "Male";
  const currentDate = new Date();
  const todayIso = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  const selectedHousehold = householdForConnection(registry, householdConnection);
  const householdMembers = registry.patients.filter((patient) =>
    patient.id !== editingPatientId && (householdConnection?.kind === "new"
      ? patient.id === householdConnection.headPatientId
      : Boolean(selectedHousehold && patient.householdId === selectedHousehold.id)),
  ).map((patient) => ({ ...patient, fullName: patientName(patient) }));


  // --- HANDLERS ---

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "familySerialNumber" || (householdConnection && ADDRESS_FIELDS.includes(name))) return;
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));

    setForm((prev) => {
      // Phone Normalization
      if (name === "contactNumber") {
        return { ...prev, [name]: normalizePhilippineContact(value) };
      }

      // Age Calculation
      if (name === "birthDate") {
        const calculatedAge = calculateAge(value);

        return {
          ...prev,
          birthDate: value,
          age: calculatedAge,
        };
      }

      return { ...prev, [name]: value };
    });
  };

  function handleSelectChange(name, value) {
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Either input can make the husband fields inapplicable: leaving
      // Married, or switching the patient's sex to Male.
      ...((name === "civilStatus" && value !== "Married") ||
      (name === "sex" && value === "Male")
        ? { spouseName: "", spouseOccupation: "" }
        : {}),
      ...(name === "philHealthStatus" && value !== "With PhilHealth"
        ? { philHealthNumber: "" }
        : {}),
    }));
  }

function handleBirthDateChange(valueOrEvent) {
  const value =
    typeof valueOrEvent === "string"
      ? valueOrEvent
      : valueOrEvent?.target?.value || "";

  const nextAgeYears = calculateAge(value);
  const nextAgeMonths = calculateAgeInMonths(value);

  const nextIsEpiTarget =
    Boolean(value) && nextAgeMonths !== "" && Number(nextAgeMonths) <= 12;
  const nextIsChild =
    Boolean(value) && nextAgeYears !== "" && Number(nextAgeYears) < 18;

  setFieldErrors((prev) => ({
    ...prev,
    birthDate: "",
  }));

  setForm((prev) => ({
    ...prev,
    birthDate: value,
    age: nextAgeYears,

    // EPI-age patients use child registration fields instead of general profile fields.
    civilStatus: nextIsEpiTarget ? "Single" : prev.civilStatus,
    occupation: nextIsEpiTarget ? "" : prev.occupation,
    nhtsStatus: nextIsEpiTarget ? "" : prev.nhtsStatus,
    spouseName:
      !nextIsEpiTarget && prev.civilStatus === "Married"
        ? prev.spouseName
        : "",
    spouseOccupation:
      !nextIsEpiTarget && prev.civilStatus === "Married"
        ? prev.spouseOccupation
        : "",

    // clear child-only fields kapag adult na yung bagong DOB
    motherName: nextIsChild ? prev.motherName : "",
    motherPatientId: nextIsChild ? prev.motherPatientId : "",
    motherBirthDate: nextIsChild ? prev.motherBirthDate : "",
    fatherName: nextIsChild ? prev.fatherName : "",
    fatherPatientId: nextIsChild ? prev.fatherPatientId : "",
    fatherBirthDate: nextIsChild ? prev.fatherBirthDate : "",

    // clear EPI-only fields kapag hindi na EPI age
    birthPlace: nextIsEpiTarget ? prev.birthPlace : "",
    birthTime: nextIsEpiTarget ? prev.birthTime : "",
  }));
}
  function handleParentBirthDateChange(name, value) {
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }
  function handleHouseholdChange(connection, replacement) {
    setHouseholdConnection(connection);
    setHeadReplacement(replacement || null);
    setForm((current) => stageConnection(current, registry, connection));
    setFieldErrors((current) => ({ ...current, familySerialNumber: "", relationshipToHouseholdHead: "", ...Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, ""])) }));
  }

  function handleCreateHousehold() {
    registrationDrafts.write(draftPath, {
      form, householdConnection, headReplacement, createdPatientId,
      patientId: editingPatientId, fieldErrors,
    });
    navigate(`${draftPath}/household/new`);
  }

  function cancelRegistration() {
    registrationDrafts.discard(draftPath);
    navigate(backPath);
  }

  function handleUseAsParent(role, member) {
    const fields = PARENT_FIELDS[role];
    setFieldErrors((prev) => ({
      ...prev,
      [fields.name]: "",
      [fields.birthDate]: "",
    }));
    setForm((prev) => linkParent(prev, role, member));
  }

  function handleUnlinkParent(role) {
    setForm((prev) => unlinkParent(prev, role));
  }

    function validateForm() {
    const nextErrors = {};
    if (householdReviewPending) nextErrors.familySerialNumber = "Confirm or cancel the household selection before saving.";
    const householdErrors = { ...validateConnection(registry, householdConnection, editingPatientId), ...validateHeadReplacement(registry, editingPatientId, householdConnection, headReplacement) };
    const { relationship, ...otherHouseholdErrors } = householdErrors;
    if (relationship) nextErrors.relationshipToHouseholdHead = relationship;
    if (Object.keys(otherHouseholdErrors).length) nextErrors.familySerialNumber = Object.values(otherHouseholdErrors)[0];

    if (!form.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!form.birthDate) nextErrors.birthDate = "Date of Birth is required.";
    if (form.birthDate && form.birthDate > todayIso) {
      nextErrors.birthDate = "Date of Birth cannot be in the future.";
      setFieldErrors(nextErrors);
      return false;
    }
    if (!form.sex) nextErrors.sex = "Sex is required.";
    if (showGeneralProfileFields && hasBirthDate && !form.civilStatus) {
      nextErrors.civilStatus = "Civil status is required.";
    }
    if (
      form.philHealthStatus === "With PhilHealth" &&
      !form.philHealthNumber.trim()
    ) {
      nextErrors.philHealthNumber =
        "PhilHealth number is required if marked with PhilHealth.";
    }
    if (!form.streetAddress.trim()) {
      nextErrors.streetAddress = "Street address is required.";
    }
    if (!form.barangay) nextErrors.barangay = "Barangay is required.";
    if (!form.municipality.trim()) {
  nextErrors.municipality = "Municipality is required.";
}
    if (isChildRegistration) {
      if (!form.motherName.trim()) {
        nextErrors.motherName = "Mother name is required.";
      }

      if (form.motherBirthDate && form.motherBirthDate > todayIso) {
        nextErrors.motherBirthDate = "Mother birthdate cannot be in the future.";
      }

      if (form.fatherBirthDate && form.fatherBirthDate > todayIso) {
        nextErrors.fatherBirthDate = "Father birthdate cannot be in the future.";
      }
    }


    setFieldErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    setModals({ ...modals, confirm: true });
  }

  function buildPatientPayload() {
    const childPatientData = isChildRegistration
      ? {
          registrationType: "child",
          patientClassification: "Child Patient",
          motherName: form.motherName || null,
          motherPatientId: form.motherPatientId || null,
          motherBirthDate: form.motherBirthDate || null,
          fatherName: form.fatherName || null,
          fatherPatientId: form.fatherPatientId || null,
          fatherBirthDate: form.fatherBirthDate || null,
          birthPlace: isEpiTargetAge ? form.birthPlace || null : null,
          birthTime: isEpiTargetAge ? form.birthTime || null : null,
        }
      : {
          registrationType: "general",
          patientClassification: form.patientClassification || "",
          motherName: null,
          motherPatientId: null,
          motherBirthDate: null,
          fatherName: null,
          fatherPatientId: null,
          fatherBirthDate: null,
          birthPlace: null,
          birthTime: null,
        };

    return {
      ...form,
      ...childPatientData,
      philHealthNumber:
        form.philHealthStatus === "With PhilHealth"
          ? form.philHealthNumber || null
          : null,
      civilStatus: isEpiTargetAge ? "Single" : form.civilStatus,
      occupation: isEpiTargetAge ? null : form.occupation || null,
      nhtsStatus: isEpiTargetAge ? null : form.nhtsStatus || null,
      purokArea: form.purokArea || null,
      familySerialNumber: form.familySerialNumber || null,
      spouseName: showHusbandInformation ? form.spouseName || null : null,
      spouseOccupation: showHusbandInformation
        ? form.spouseOccupation || null
        : null,
      name: formatFullName(form.firstName, form.middleName, form.lastName),
      ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
    };
  }

  const handleSubmit = () => {
    if (saving || !validateForm()) {
      setModals((current) => ({ ...current, confirm: false }));
      return;
    }

    try {
      setSaving(true);
      const patientData = buildPatientPayload();
      const saved = saveMockPatient(patientData, householdConnection, editingPatientId, headReplacement);
      registrationDrafts.discard(draftPath);
      setCreatedPatientId(saved.id);
      setForm(registrationForm(saved));
      setHouseholdConnection(connectionForPatient(saved));
      setHeadReplacement(null);
      setModals({ ...modals, confirm: false, success: true });
      toast.success("Patient saved in this mock session.");
    } catch (error) {
      setFieldErrors((current) => ({ ...current, familySerialNumber: error.message }));
      setModals((current) => ({ ...current, confirm: false }));
    } finally {
      setSaving(false);
    }
  };

  function registerAnother() {
    registrationDrafts.discard(draftPath);
    registrationDrafts.discard(registrationPath(basePath));
    setForm({ ...INITIAL_FORM_STATE });
    setHouseholdConnection(null);
    setHeadReplacement(null);
    setCreatedPatientId("");
    setFieldErrors({});
    setModals({ confirm: false, success: false });
    navigate(`${patientsPath}/add`);
  }

  if (patientId && !savedPatient) return (
    <DashboardLayout role={role} title="Edit Patient">
      <p className="text-sm text-gray-900">This patient is no longer available in the mock session.</p>
      <Link to={`${patientsPath}/add`} className="mt-3 inline-block text-sm text-red-700">Register a patient</Link>
    </DashboardLayout>
  );

  // --- RENDER ---

  return (
    <>
      <DashboardLayout role={role} title={dashboardTitle}>
        {/* Header */}
        <div className="mb-4 ml-0 mr-auto w-full max-w-7xl min-w-0">
          <div className="flex flex-col gap-2">
            <Link
              to={backPath}
              onClick={() => registrationDrafts.discard(draftPath)}
              className="inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-red-600 hover:text-red-800"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-900">
                {pageTitle}
              </h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-gray-600">
                {pageDescription}
              </p>
            </div>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="ehr-form ml-0 mr-auto w-full max-w-7xl min-w-0"
        >
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* LEFT COLUMN */}
            <div className="min-w-0 space-y-4">
              <FormPanel
                icon={UserPlus}
                title="Personal Information"
                description="Personal identity and demographic details."
              >
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <FormInput
                    label="First Name"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    error={fieldErrors.firstName}
                    required
                  />
                  <FormInput
                    label="Middle Name"
                    name="middleName"
                    value={form.middleName}
                    onChange={handleChange}
                  />
                  <FormInput
                    label="Last Name"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    error={fieldErrors.lastName}
                    required
                  />

                  <DatePickerField
                    label="Date of Birth"
                    name="birthDate"
                    value={form.birthDate}
                    mode="birthdate"
                    maxDate={todayIso}
                    disableFuture
                    onChange={handleBirthDateChange}
                    error={fieldErrors.birthDate}
                    required
                  />
                  <FormInput
                    label="Age"
                    name="age"
                    type="text"
                    value={ageDisplay}
                    readOnly
                    helperText="Auto-calculated from date of birth."
                  />

                  <SexRadioGroup
                    label="Sex"
                    name="sex"
                    value={form.sex}
                    onChange={handleSelectChange}
                    error={fieldErrors.sex}
                    required
                  />
                </div>
              </FormPanel>

              <FormPanel
                icon={ClipboardList}
                title="Socio-Demographic Information"
                description="Profile and household background details used for reporting."
              >
                {showGeneralProfileFields && (
                  <div className="mb-4 grid min-w-0 gap-3 border-b border-gray-200 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                    <ModernSelect
                      label="Civil Status"
                      name="civilStatus"
                      value={form.civilStatus}
                      onChange={handleSelectChange}
                      options={CIVIL_STATUS_OPTIONS}
                      placeholder="Select civil status"
                      error={fieldErrors.civilStatus}
                      required={hasBirthDate}
                    />

                    <div>
                      <FormInput
                        label="Occupation"
                        name="occupation"
                        value={form.occupation}
                        onChange={handleChange}
                        placeholder="Select or type occupation"
                        list="occupation-options"
                        error={fieldErrors.occupation}
                        helperText="Select or type an occupation."
                      />

                      <datalist id="occupation-options">
                        {OCCUPATION_OPTIONS.map((occupation) => (
                          <option key={occupation.value} value={occupation.value} />
                        ))}
                      </datalist>
                    </div>

                    <NhtsRadioGroup
                      label="NHTS Status"
                      name="nhtsStatus"
                      value={form.nhtsStatus}
                      onChange={handleSelectChange}
                      error={fieldErrors.nhtsStatus}
                    />
                  </div>
                )}
                <FamilyRegistryField
                  registry={registry}
                  patient={{ ...form, id: editingPatientId }}
                  connection={householdConnection}
                  savedConnection={savedConnection}
                  headReplacement={headReplacement}
                  onChange={handleHouseholdChange}
                  onCreateHousehold={handleCreateHousehold}
                  onPendingChange={setHouseholdReviewPending}
                  error={fieldErrors.familySerialNumber}
                  relationshipError={fieldErrors.relationshipToHouseholdHead}
                />
              </FormPanel>

              {showHusbandInformation && (
                <FormPanel
                  icon={Users}
                  title="Husband Information"
                  description="Additional husband details for married adult patients."
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <FormInput
                      label="Husband Name"
                      name="spouseName"
                      value={form.spouseName}
                      onChange={handleChange}
                    />
                    <FormInput
                      label="Husband Occupation"
                      name="spouseOccupation"
                      value={form.spouseOccupation}
                      onChange={handleChange}
                    />
                  </div>
                </FormPanel>
              )}

              {isChildRegistration && (
                <FormPanel
                  icon={Users}
                  title="Parent / Household Information"
                  description="The Family Serial Number links this child to their household."
                >
                  <div className="space-y-4">
                    <HouseholdPanel
                      members={householdMembers}
                      form={form}
                      onUseAsParent={handleUseAsParent}
                    />

                    {Object.keys(PARENT_FIELDS).map((role) => (
                      <ParentFields
                        key={role}
                        role={role}
                        form={form}
                        errors={fieldErrors}
                        todayIso={todayIso}
                        required={role === "mother"}
                        onChange={handleChange}
                        onBirthDateChange={handleParentBirthDateChange}
                        onUnlink={handleUnlinkParent}
                      />
                    ))}
                  </div>
                </FormPanel>
              )}

              {isChildRegistration && isEpiTargetAge && (
                <FormPanel
                  icon={ClipboardList}
                  title="Birth / EPI Details"
                  description="Basic birth and household details for child registration."
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <FormInput
                      label="Birth Place"
                      name="birthPlace"
                      value={form.birthPlace}
                      onChange={handleChange}
                    />

                    <TimePickerField
                      label="Time of Birth"
                      name="birthTime"
                      value={form.birthTime}
                      onChange={(value) => {
                        setFieldErrors((prev) => ({ ...prev, birthTime: "" }));
                        setForm((prev) => ({ ...prev, birthTime: value }));
                      }}
                    />
                  </div>
                </FormPanel>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="min-w-0 space-y-4">
              <FormPanel
                icon={ClipboardList}
                title="Contact & Identification"
                description="Contact details and PhilHealth membership information."
              >
                <div className="grid min-w-0 gap-3">
                  <PhilippineContactInput
                    label="Contact Number"
                    name="contactNumber"
                    value={form.contactNumber}
                    onChange={handleChange}
                  />

                  <PhilHealthRadioGroup
                    label="PhilHealth Membership"
                    name="philHealthStatus"
                    value={form.philHealthStatus}
                    onChange={handleSelectChange}
                    error={fieldErrors.philHealthStatus}
                  />

                  {form.philHealthStatus === "With PhilHealth" && (
                    <FormInput
                      label="PhilHealth Number"
                      name="philHealthNumber"
                      value={form.philHealthNumber}
                      onChange={handleChange}
                      error={fieldErrors.philHealthNumber}
                      required
                    />
                  )}
                </div>
              </FormPanel>

              <FormPanel
                icon={MapPinHouse}
                title="Address Information"
                description="Current residential address details."
              >
                <div className="grid min-w-0 gap-3">
                  <FormInput
                    label="Street Address"
                    name="streetAddress"
                    readOnly={Boolean(householdConnection)}
                    value={form.streetAddress}
                    onChange={handleChange}
                    placeholder="House No., Street, Sitio"
                    error={fieldErrors.streetAddress}
                    required
                  />

                  <FormInput
                    label="Purok / Area"
                    name="purokArea"
                    readOnly={Boolean(householdConnection)}
                    value={form.purokArea}
                    onChange={handleChange}
                    placeholder="e.g. Purok 3"
                  />

                  <div>
                    <FormInput
                      label="Barangay"
                      name="barangay"
                      readOnly={Boolean(householdConnection)}
                      value={form.barangay}
                      onChange={handleChange}
                      placeholder="Select or type barangay"
                      list="barangay-options"
                      error={fieldErrors.barangay}
                      helperText="Select or type a barangay."
                      required
                    />

                    <datalist id="barangay-options">
                      {BARANGAY_OPTIONS.map((barangay) => (
                        <option key={barangay.value} value={barangay.value} />
                      ))}
                    </datalist>
                  </div>

                  <FormInput
                    label="Municipality / City"
                    name="municipality"
                    readOnly={Boolean(householdConnection)}
                    value={form.municipality}
                    onChange={handleChange}
                    placeholder="Enter municipality"
                    error={fieldErrors.municipality}
                    required
                  />
                </div>
              </FormPanel>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-4 flex min-w-0 flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={cancelRegistration}
              className="w-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || householdReviewPending}
              className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 disabled:bg-gray-300 disabled:text-gray-500 sm:w-auto"
            >
              {saving ? <ButtonSpinner /> : <UserPlus size={15} />}
              {saving ? "Saving patient..." : "Save Patient"}
            </button>
          </div>
        </form>
      </DashboardLayout>

      {/* Modals */}
      {modals.success && <ModalShell
        title="Patient Saved" appearance="plain"
        onClose={() => { setModals({ confirm: false, success: false }); navigate(`${patientsPath}/${createdPatientId}`); }}
        footer={<>
          <Button type="button" variant="ghost" onClick={registerAnother}>Register Another Patient</Button>
          <Button type="button" onClick={() => { setModals({ confirm: false, success: false }); navigate(`${patientsPath}/${createdPatientId}`); }}>Edit Patient</Button>
        </>}
      ><p>Patient registration saved for this mock session.</p></ModalShell>}
      {modals.confirm && <ModalShell
        title="Save Patient?" appearance="plain"
        onClose={() => setModals((current) => ({ ...current, confirm: false }))}
        footer={<>
          <Button type="button" variant="ghost" onClick={() => setModals((current) => ({ ...current, confirm: false }))}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>Save Patient</Button>
        </>}
      ><p>Save this patient's details and household connection?</p></ModalShell>}
    </>
  );
}

export default function AddPatient() {
  return <PatientRegistrationPage />;
}

// Preserve explicit parent linking for children using the selected mock household.
function HouseholdPanel({ members, form, onUseAsParent }) {
  if (!members.length) return null;

  return (
    <div aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 py-2.5">
        <House size={15} className="shrink-0 text-[#B91C1C]" />
        <p className="text-sm font-semibold text-gray-950">Household members</p>
      </div>

      <ul className="divide-y divide-[#F1F5F9] bg-white">
        {members.map((member) => {
          const role = parentRoleFor(member);
          const fields = role ? PARENT_FIELDS[role] : null;
          const linked = fields && String(form[fields.id]) === String(member.id);

          return (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1F2937]">
                  {member.fullName || "Unnamed patient"}
                </p>
                <p className="text-[11px] text-[#6B7280]">
                  {memberAgeLabel(member)} · {member.sex || "Sex not recorded"}
                </p>
              </div>

              {linked ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-950">
                  <Check size={12} />
                  {fields.label}
                </span>
              ) : fields ? (
                <button
                  type="button"
                  onClick={() => onUseAsParent(role, member)}
                  className="border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 transition hover:border-red-600 hover:bg-red-50"
                >
                  Use as {fields.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One parent's Name / Date of Birth / Age. A parent linked from the household
 * is locked to their registered record until unlinked.
 */
function ParentFields({
  role,
  form,
  errors,
  todayIso,
  required,
  onChange,
  onBirthDateChange,
  onUnlink,
}) {
  const fields = PARENT_FIELDS[role];
  const linked = Boolean(form[fields.id]);

  return (
    <div className="grid min-w-0 gap-4 border-t border-[#EEF2F6] pt-5 sm:grid-cols-2 xl:grid-cols-3">
      <FormInput
        label={`${fields.label} Name`}
        name={fields.name}
        value={form[fields.name]}
        onChange={onChange}
        readOnly={linked}
        error={errors[fields.name]}
        required={required}
        helperText={
          linked ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 font-medium text-[#B91C1C]">
              <Check size={11} />
              Linked to registered patient
              <span className="text-[#D1D5DB]">·</span>
              <button
                type="button"
                onClick={() => onUnlink(role)}
                className="font-semibold text-[#6B7280] underline-offset-2 hover:text-[#B91C1C] hover:underline"
              >
                Unlink
              </button>
            </span>
          ) : null
        }
      />

      <DatePickerField
        label={`${fields.label} Date of Birth`}
        name={fields.birthDate}
        value={form[fields.birthDate]}
        mode="birthdate"
        maxDate={todayIso}
        disableFuture
        disabled={linked}
        onChange={(value) => onBirthDateChange(fields.birthDate, value)}
        error={errors[fields.birthDate]}
      />

      <FormInput
        label={`${fields.label} Age`}
        name={`${role}Age`}
        value={formatAgeDisplay(form[fields.birthDate])}
        readOnly
      />
    </div>
  );
}

function SexRadioGroup({
  label,
  name,
  value,
  onChange,
  required,
  error,
}) {
  const options = [
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" },
  ];

  return (
    <div className="min-w-0" data-field={name}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>

      <div className="flex h-10 items-center gap-6">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(name, option.value)}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                value === option.value
                  ? "text-[#B91C1C] font-semibold"
                  : "text-[#475569]"
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}

function PhilHealthRadioGroup({
  label,
  name,
  value,
  onChange,
  required,
  error,
}) {
  const options = [
    { value: "With PhilHealth", label: "With PhilHealth" },
    { value: "Without PhilHealth", label: "Without PhilHealth" },
  ];

  return (
    <div className="min-w-0" data-field={name}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>

      <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(name, option.value)}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                value === option.value
                  ? "font-semibold text-[#B91C1C]"
                  : "text-[#475569]"
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}

function NhtsRadioGroup({
  label,
  name,
  value,
  onChange,
  required,
  error,
}) {
  const options = [
    { value: "NHTS", label: "NHTS" },
    { value: "Non-NHTS", label: "Non-NHTS" },
  ];

  return (
    <div className="min-w-0" data-field={name}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>

      <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(name, option.value)}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                value === option.value
                  ? "font-semibold text-[#B91C1C]"
                  : "text-[#475569]"
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}

function ModernSelect({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState(null);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedTrigger = wrapperRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);

      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return undefined;

    function updateMenuPosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 6;
      const viewportPadding = 12;
      const optionHeight = 40;
      const preferredHeight = Math.min(256, options.length * optionHeight + 8);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const opensUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      const availableSpace = Math.max(
        120,
        (opensUp ? spaceAbove : spaceBelow) - gap,
      );
      const menuHeight = Math.min(preferredHeight, availableSpace);

      setMenuPosition({
        left: Math.min(
          Math.max(viewportPadding, rect.left),
          window.innerWidth - rect.width - viewportPadding,
        ),
        top: opensUp ? rect.top - gap - menuHeight : rect.bottom + gap,
        width: rect.width,
        maxHeight: menuHeight,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  function selectOption(option) {
    onChange(name, option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeIndex >= 0) {
        selectOption(options[activeIndex]);
      } else {
        setOpen(true);
      }
    }
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${name}-options`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-none border bg-white px-3.5 text-left text-sm text-[#1F2937] outline-none transition-all duration-200 hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          error ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/10" : "border-[#E5E7EB]"
        }`}
      >
        <span
          className={`min-w-0 truncate ${
            selectedOption ? "text-[#0F172A]" : "text-[#94A3B8]"
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#94A3B8] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          id={`${name}-options`}
          role="listbox"
          aria-label={label}
          className="overflow-y-auto border border-gray-300 bg-white py-1 shadow-sm"
          style={{
            position: "fixed",
            zIndex: 9999,
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-[#FEF2F2]" : "hover:bg-[#F8FAFC]"
                } ${selected ? "font-semibold text-[#B91C1C]" : "text-[#334155]"}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && (
                  <Check size={14} className="shrink-0 text-[#B91C1C]" />
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}
