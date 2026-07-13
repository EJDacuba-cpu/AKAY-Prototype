import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  
  Check,
  ChevronDown,
  ClipboardList,
  MapPinHouse,
  Users,
  UserPlus,
} from "lucide-react"; // FIXED: Added missing icons

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ButtonSpinner,
  ConnectionIssueModal,
  DatePickerField,
  FormInput,
  SuccessModal,
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

import {
  createBhcPatient,
  getPatientDetailsListByRole,
} from "../../services/patientService";
import { isConnectionError } from "../../services/apiClient";
import { saveOfflineDraft } from "../../services/offlineDraftService";
import { queryKeys } from "../../utils/queryKeys";

// Animation Utility
const stagger = (i) => ({
  animationDelay: `${i * 80}ms`,
});

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
  fatherBirthDate: "",
  familySerialNumber: "",

  birthPlace: "",
  birthTime: "",
  nhtsStatus: "",
};
export function PatientRegistrationPage({
  role = "bhc",
  basePath = "/bhc",
  createPatient = createBhcPatient,
  queryRole = "bhc",
  systemDescription = "Register a new patient profile into the Barangay Health Center system.",
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const patientsPath = `${basePath}/patients`;
  const addHealthRecordPath = `${basePath}/health-records/add`;

  // Unified State Management
  const [modals, setModals] = useState({
    confirm: false,
    success: false,
    draftSaved: false,
  });
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState("");
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState({});
  const { data: registeredPatients = [] } = useQuery({
    queryKey: queryKeys.patients(queryRole),
    queryFn: () => getPatientDetailsListByRole(queryRole),
  });

  const ageDisplay = formatAgeDisplay(form.birthDate);
  const ageYears = calculateAge(form.birthDate);
  const ageInMonths = calculateAgeInMonths(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isChildRegistration =
    hasBirthDate && ageYears !== "" && Number(ageYears) < 18;
  const isEpiTargetAge =
    hasBirthDate && ageInMonths !== "" && Number(ageInMonths) <= 12;
  const showGeneralProfileFields = !isEpiTargetAge;
  const currentDate = new Date();
  const todayIso = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  const motherPatientOptions = registeredPatients
    .filter((patient) => {
      const age = calculateAge(patient.birthDate || patient.birthdate);
      return patient.sex === "Female" && (age === "" || Number(age) >= 12);
    })
    .filter((patient) => {
      const search = form.motherName.trim().toLowerCase();
      if (!search) return true;
      return getMotherPatientLabel(patient).toLowerCase().includes(search);
    });
  const linkedMother = form.motherPatientId
    ? registeredPatients.find(
        (patient) => String(patient.id) === String(form.motherPatientId),
      )
    : null;
  const linkedMotherBirthDate =
    linkedMother?.birthDate || linkedMother?.birthdate || "";
  const fatherAgeDisplay = formatAgeDisplay(form.fatherBirthDate);
  const motherAgeDisplay = formatAgeDisplay(form.motherBirthDate);
  const linkedMotherHelper = linkedMother
    ? [
        "Linked registered mother",
        linkedMotherBirthDate ? `DOB ${formatDisplayDate(linkedMotherBirthDate)}` : "",
        linkedMother.barangay || "",
      ]
        .filter(Boolean)
        .join(" - ")
    : "";


  // --- HANDLERS ---

  const handleChange = (e) => {
    const { name, value } = e.target;
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
      ...(name === "civilStatus" && value !== "Married"
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
    familySerialNumber: nextIsChild ? prev.familySerialNumber : "",
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
  function handleMotherNameChange(value) {
    setFieldErrors((prev) => ({
      ...prev,
      motherName: "",
      motherPatientId: "",
    }));

    setForm((prev) => ({
      ...prev,
      motherName: value,
      motherPatientId: "",
      motherBirthDate: "",
      fatherName: "",
      fatherBirthDate: "",
      familySerialNumber: "",
    }));
  }
  function handleMotherPatientSelect(value) {
    const selectedMother = registeredPatients.find(
      (patient) => String(patient.id) === String(value),
    );

    setFieldErrors((prev) => ({ ...prev, motherName: "", motherPatientId: "" }));
    setForm((prev) => ({
      ...prev,
      motherPatientId: value,
      motherName: selectedMother
        ? selectedMother.fullName || selectedMother.name || prev.motherName
        : prev.motherName,
      motherBirthDate: selectedMother
        ? selectedMother.birthDate || selectedMother.birthdate || prev.motherBirthDate
        : prev.motherBirthDate,
      familySerialNumber: selectedMother
        ? selectedMother.familySerialNumber ||
          selectedMother.family_serial_number ||
          prev.familySerialNumber
        : prev.familySerialNumber,
      fatherName: selectedMother
        ? selectedMother.spouseName ||
          selectedMother.spouse_name ||
          prev.fatherName
        : prev.fatherName,
    }));
  }
  function clearMotherLink() {
    setFieldErrors((prev) => ({
      ...prev,
      motherName: "",
      motherPatientId: "",
      motherBirthDate: "",
      fatherName: "",
      fatherBirthDate: "",
      familySerialNumber: "",
    }));

    setForm((prev) => ({
      ...prev,
      motherName: "",
      motherPatientId: "",
      motherBirthDate: "",
      fatherName: "",
      fatherBirthDate: "",
      familySerialNumber: "",
    }));
  }
    function validateForm() {
    const nextErrors = {};

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
      spouseName:
        showGeneralProfileFields && form.civilStatus === "Married"
          ? form.spouseName || null
          : null,
      spouseOccupation:
        showGeneralProfileFields && form.civilStatus === "Married"
          ? form.spouseOccupation || null
          : null,
      id: Date.now().toString(),
      name: formatFullName(form.firstName, form.middleName, form.lastName),
      ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
    };
  }

  function handleSavePatientDraft() {
    saveOfflineDraft({
      moduleType: "patient",
      formData: buildPatientPayload(),
    });
    setConnectionIssue(null);
    setModals((prev) => ({ ...prev, confirm: false, draftSaved: true }));
  }

  const handleSubmit = async () => {
    if (saving) return;

    try {
      setSaving(true);
      const patientData = buildPatientPayload();
      const created = await createPatient(patientData);
      const nextId =
        created?.id || created?.details?.id || created?.patient?.id || patientData.id;

      queryClient.invalidateQueries({ queryKey: queryKeys.patients(queryRole) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary(queryRole),
      });
      setCreatedPatientId(nextId);
      setModals({ ...modals, confirm: false, success: true });
    } catch (error) {
      console.error("Submission failed:", error);
      if (isConnectionError(error)) {
        setConnectionIssue({
          title: error.isTimeout ? "Request Timed Out" : "Connection Lost",
          message:
            error?.message ||
            "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // --- RENDER ---

  return (
    <>
      <DashboardLayout role={role} title="Add Patient">
        {/* Header */}
        <div
          className="anim-fade-up mb-6 ml-0 mr-auto w-full max-w-7xl min-w-0"
          style={stagger(0)}
        >
          <div className="flex flex-col gap-2">
            <Link
              to={patientsPath}
              className="inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
            >
              <ArrowLeft size={16} />
              Back to Patients
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
                Add New Patient
              </h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
                {systemDescription}
              </p>
            </div>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="ml-0 mr-auto w-full max-w-7xl min-w-0"
        >
          <div className="rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
          {/* SECTION 1: BASIC INFO */}
          <section
            className="anim-fade-up w-full min-w-0 space-y-4 pb-6"
            style={stagger(1)}
          >
          <SectionHeader
            icon={UserPlus}
            title="Basic Information"
            description="Personal identity and demographic details."
          />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                className="bg-gray-50"
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
          </section>

          {showGeneralProfileFields && (
            <section
              className="anim-fade-up w-full min-w-0 space-y-4 py-6"
              style={stagger(2)}
            >
              <SectionHeader
                icon={ClipboardList}
                title="Socio-Demographic Information"
                description="Profile and household background details used for reporting."
              />

              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

                {!isChildRegistration && (
                  <FormInput
                    label="Family Serial Number"
                    name="familySerialNumber"
                    value={form.familySerialNumber}
                    onChange={handleChange}
                    placeholder="Optional household serial"
                  />
                )}
              </div>
            </section>
          )}

          {showGeneralProfileFields && form.civilStatus === "Married" && (
            <section
              className="anim-fade-up w-full min-w-0 space-y-4 py-6"
              style={stagger(2)}
            >
              <SectionHeader
                icon={Users}
                title="Husband Information"
                description="Additional husband details for married adult patients."
              />

              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            </section>
          )}

          {/* SECTION 2: CONTACT & IDENTIFICATION */}
          <section
            className="anim-fade-up w-full min-w-0 space-y-4 py-6"
            style={stagger(3)}
          >
            <SectionHeader
              icon={ClipboardList}
              title="Contact & Identification"
              description="Contact details and PhilHealth membership information."
            />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          </section>

          {/* SECTION 3: ADDRESS */}
          <section
            className="anim-fade-up w-full min-w-0 space-y-4 py-6"
            style={stagger(4)}
          >
            <SectionHeader
              icon={MapPinHouse}
              title="Address Information"
              description="Current residential address details."
            />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormInput
                label="Street Address"
                name="streetAddress"
                value={form.streetAddress}
                onChange={handleChange}
                placeholder="House No., Street, Sitio"
                error={fieldErrors.streetAddress}
                required
              />

              <FormInput
                label="Purok / Area"
                name="purokArea"
                value={form.purokArea}
                onChange={handleChange}
                placeholder="e.g. Purok 3"
              />

              <div>
                <FormInput
                  label="Barangay"
                  name="barangay"
                  value={form.barangay}
                  onChange={handleChange}
                  placeholder="Select or type barangay"
                  list="barangay-options"
                  error={fieldErrors.barangay}
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
                value={form.municipality}
                onChange={handleChange}
                placeholder="Enter municipality"
                error={fieldErrors.municipality}
                required
              />
            </div>
          </section>

        {isChildRegistration && (
          <>
            <section
              className="anim-fade-up w-full min-w-0 space-y-4 py-6"
              style={stagger(4)}
            >
              <SectionHeader
                icon={Users}
                title="Parent / Household Information"
                description="Additional parent and household details for child patients."
              />

            <div className="space-y-6">
              {/* Mother Information */}
              <div className="space-y-3">

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <MotherCombobox
                    value={form.motherPatientId}
                    inputValue={form.motherName}
                    options={motherPatientOptions}
                    helperText={linkedMotherHelper}
                    error={fieldErrors.motherName}
                    onInputChange={handleMotherNameChange}
                    onChange={handleMotherPatientSelect}
                    onClear={clearMotherLink}
                    required
                  />

                  <DatePickerField
                    label="Mother Date of Birth"
                    name="motherBirthDate"
                    value={form.motherBirthDate}
                    mode="birthdate"
                    maxDate={todayIso}
                    disableFuture
                    onChange={(value) =>
                      handleParentBirthDateChange("motherBirthDate", value)
                    }
                    error={fieldErrors.motherBirthDate}
                  />

                  <FormInput
                    label="Mother Age"
                    name="motherAge"
                    value={motherAgeDisplay}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>

              {/* Father and Household Information */}
              <div className="space-y-3 border-t border-[#EEF2F6] pt-5">

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <FormInput
                    label="Name of Father"
                    name="fatherName"
                    value={form.fatherName}
                    onChange={handleChange}
                  />

                  <DatePickerField
                    label="Father Date of Birth"
                    name="fatherBirthDate"
                    value={form.fatherBirthDate}
                    mode="birthdate"
                    maxDate={todayIso}
                    disableFuture
                    onChange={(value) =>
                      handleParentBirthDateChange("fatherBirthDate", value)
                    }
                    error={fieldErrors.fatherBirthDate}
                  />

                  <FormInput
                    label="Father Age"
                    name="fatherAge"
                    value={fatherAgeDisplay}
                    readOnly
                    className="bg-gray-50"
                  />

                  <FormInput
                    label="Family Serial Number"
                    name="familySerialNumber"
                    value={form.familySerialNumber}
                    onChange={handleChange}
                    placeholder="Optional household serial"
                  />
                </div>
              </div>
            </div>
            </section>

            {isEpiTargetAge && (
              <section
                className="anim-fade-up w-full min-w-0 space-y-4 py-6"
                style={stagger(5)}
              >
                <SectionHeader
                  icon={ClipboardList}
                  title="Birth / EPI Details"
                  description="Basic birth and household details for child registration."
                />

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              </section>
            )}
          </>
        )}
          {/* ACTIONS */}
          <div
            className="anim-fade-up flex min-w-0 flex-col-reverse gap-3 pt-6 sm:flex-row sm:items-center sm:justify-end"
            style={stagger(4)}
          >
            <button
              type="button"
              onClick={() => navigate(patientsPath)}
              className="w-full rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97] sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98] sm:w-auto"
            >
              {saving ? (
                <ButtonSpinner />
              ) : (
                <UserPlus
                  size={15}
                  className="transition-transform duration-300 group-hover:scale-110"
                />
              )}
              {saving ? "Registering patient..." : "Register Patient"}
            </button>
          </div>
          </div>
        </form>
      </DashboardLayout>

      {/* Modals */}
      <SuccessModal
        open={modals.success}
        title="Patient added."
        description="The patient was submitted successfully. Refreshing patient list data now."
        buttonText="Back to Patient List"
        onClose={() => navigate(patientsPath)}
        secondaryButtonText="Add Health Record"
        onSecondaryAction={() =>
          navigate(`${addHealthRecordPath}?patientId=${createdPatientId}`)
        }
      />
      <SuccessModal
        open={modals.draftSaved}
        title="Draft saved locally."
        description="This patient registration was saved only on this device. Submit it manually once the connection is stable."
        buttonText="Continue Editing"
        onClose={() => setModals((prev) => ({ ...prev, draftSaved: false }))}
      />
      <ConfirmationModal
        open={modals.confirm}
        title="Confirm Patient Registration?"
        description="Please review the patient information before registering this profile."
        confirmText="Register Patient"
        cancelText="Cancel"
        onConfirm={handleSubmit}
        onCancel={() => setModals({ ...modals, confirm: false })}
        loading={saving}
        loadingText="Registering patient..."
      />
      <ConnectionIssueModal
        open={Boolean(connectionIssue)}
        title={connectionIssue?.title}
        message={connectionIssue?.message}
        retryDisabled={
          saving || (typeof navigator !== "undefined" && navigator.onLine === false)
        }
        onContinue={() => setConnectionIssue(null)}
        onSaveDraft={handleSavePatientDraft}
        onRetry={handleSubmit}
      />
    </>
  );
}

export default function AddPatient() {
  return <PatientRegistrationPage />;
}

function MotherCombobox({
  value,
  inputValue,
  options,
  helperText,
  error,
  required,
  onInputChange,
  onChange,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selected = Boolean(value);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectMother(patient) {
    onChange(patient.id);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0 sm:col-span-2 xl:col-span-1">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        Mother
        {required && <span className="text-red-400"> *</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => {
            onInputChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search registered mother or type name"
          className={`h-10 w-full rounded-xl border bg-white px-3 pr-16 text-sm text-[#111827] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
            error ? "border-[#B91C1C]" : "border-[#E5E7EB]"
          }`}
        />
        <button
          type="button"
          onClick={() => (selected ? onClear() : setOpen((current) => !current))}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-[#B91C1C] hover:bg-red-50"
        >
          {selected ? "Clear" : "Search"}
        </button>
      </div>

      {helperText && (
        <p className="mt-1 text-[11px] font-medium text-emerald-700">
          {helperText}
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}

      {open && options.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg shadow-slate-900/[0.08]">
          {options.slice(0, 8).map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => selectMother(patient)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
            >
              <span className="block truncate font-semibold text-[#0F172A]">
                {patient.fullName || patient.name || "Unnamed patient"}
              </span>
              <span className="block truncate text-[11px] text-[#64748B]">
                {getMotherPatientMeta(patient)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

function getMotherPatientMeta(patient = {}) {
  return [
    patient.patientId || patient.id ? `Patient ID: ${patient.patientId || patient.id}` : "",
    patient.birthDate || patient.birthdate
      ? `DOB ${formatDisplayDate(patient.birthDate || patient.birthdate)}`
      : "",
    patient.barangay || "",
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
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
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3.5 text-left text-sm text-[#1F2937] outline-none transition-all duration-200 hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
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
          className="overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg shadow-slate-900/[0.08]"
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
