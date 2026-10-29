import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router";
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
  ButtonSpinner,
  DatePickerField,
  FormInput,
} from "../../components/common";

// Import extracted utils and components
import {
  calculateAge,
  formatAgeDisplay,
  isInfantPatient,
  normalizePhilippineContact,
  formatFullName,
} from "../../utils/patientUtils";
import { validatePatientForm } from "../../utils/patientProfile";
import {
  SectionHeader,
  PhilippineContactInput,
} from "../../components/features/patients/PatientFormComponents";

import { Button } from "../../components/ui/button";
import ModalShell from "../../components/common/modals/ModalShell";
import FamilyRegistryField from "../../components/features/patients/FamilyRegistryField";
import HistoricalParentLinks from "../../components/features/patients/HistoricalParentLinks";
import { isAcceptedLabel } from "../../utils/relationshipLabels";
import BhcPatientRegistration from "./BhcPatientRegistration";
import { registrationErrors } from "../../utils/householdData";
import { EDUCATION_COMPLETED_OPTIONS, EDUCATION_LEVEL_OPTIONS } from "../../utils/patientRegistrationPayload";
import {
  ADDRESS_FIELDS, connectionForPatient,
  stageConnection, validateConnection, validateHeadReplacement, withFormAddress,
} from "../../services/familyRegistry";
import toast from "react-hot-toast";
import { checkInExistingPatient } from "../../services/rhuVisitService";
import { duplicatePrompt, postSaveDestination } from "../../utils/walkInRegistration";
import "../../components/features/patients/registration-form.css";
import { PARENT_FIELDS, omitParentLinks } from "../../utils/householdParents";
import { reportedParentValues } from "../../utils/parentLinks";
import { Input } from "../../components/ui/input";

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

// This receives the form refreshed from the successful save response, never a predicted FSN.
export function PatientRegistrationSuccess({ householdEnabled, live, serialNumber }) {
  return <div className="space-y-3">
    <p>{householdEnabled && live ? "Patient registration and household connection saved." : live ? "Patient registration saved." : "Patient registration saved for this mock session."}</p>
    {householdEnabled && live && serialNumber && <dl className="border-t border-neutral-200 pt-3">
      <dt className="text-xs text-neutral-600">Family Serial Number</dt>
      <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-neutral-900">{serialNumber}</dd>
    </dl>}
  </div>;
}

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

// "Not recorded" is a real choice, so a saved Education can be cleared.
const EDUCATION_LEVEL_SELECT_OPTIONS = [
  { value: "", label: "Not recorded" },
  ...EDUCATION_LEVEL_OPTIONS.map((level) => ({ value: level, label: level })),
];
const EDUCATION_COMPLETED_SELECT_OPTIONS = [
  { value: "", label: "Not recorded" },
  ...EDUCATION_COMPLETED_OPTIONS.map((completed) => ({ value: completed, label: completed })),
];

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
  educationLevel: "",
  educationCompleted: "",
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
  motherBirthDate: "",
  fatherName: "",
  fatherBirthDate: "",
  guardianName: "",
  guardianRelationship: "",
  guardianContactNumber: "",
  familySerialNumber: "",

  nhtsStatus: "",
};

function registrationForm(patient) {
  return {
    ...patient,
    ...Object.fromEntries(Object.entries(INITIAL_FORM_STATE).map(([key, initial]) => [key, patient?.[key] ?? initial])),
  };
}

const PrototypeRegistration = lazy(() => import("../shared/PrototypeRegistration"));
const RhuPatientRegistration = lazy(() => import("../rhu/RhuPatientRegistration"));

export function PatientRegistrationPage(props) {
  if (props.role === "rhu") {
    return <Suspense fallback={<p role="status">Loading registration…</p>}><RhuPatientRegistration {...props} /></Suspense>;
  }
  return props.role && props.role !== "bhc"
    ? <Suspense fallback={<p role="status">Loading registration…</p>}><PrototypeRegistration {...props} /></Suspense>
    : <BhcPatientRegistration {...props} />;
}

export function EditPatientRegistration() {
  const { patientId } = useParams();
  return <PatientRegistrationPage patientId={patientId} />;
}

export function RegistrationForm({
  role = "bhc",
  basePath = "/bhc",
  patientId,
  systemDescription = "Register a new patient profile into the Barangay Health Center system.",
  registry, savedPatientOverride, savePatient, live = false, householdEnabled = true, initialConnection,
  onSearch, searchResults, searchLoading, searchError, refreshError, onRefresh,
  walkIn, onNewWalkIn,
}) {
  const navigate = useNavigate();
  const [createdPatientId, setCreatedPatientId] = useState("");
  const editingPatientId = patientId || createdPatientId || undefined;
  const savedPatient = savedPatientOverride || registry.patients.find((patient) => patient.id === editingPatientId);
  const savedConnection = connectionForPatient(savedPatient);
  const [householdConnection, setHouseholdConnection] = useState(() => connectionForPatient(savedPatient) || initialConnection || null);
  const [headReplacement, setHeadReplacement] = useState(null);
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
  const [duplicates, setDuplicates] = useState(null);
  const [form, setForm] = useState(() => initialConnection ? stageConnection(registrationForm(savedPatient),registry,initialConnection,{preserveParentLinks:live}) : registrationForm(savedPatient));
  const [fieldErrors, setFieldErrors] = useState({});
  const ageDisplay = formatAgeDisplay(form.birthDate);
  const ageYears = calculateAge(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isChildRegistration =
    hasBirthDate && ageYears !== "" && Number(ageYears) < 18;
  const infant = isInfantPatient(form.birthDate);
  const showGeneralProfileFields = !infant;
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
  // --- HANDLERS ---

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "familySerialNumber" || (householdConnection?.kind === "existing" && ADDRESS_FIELDS.includes(name))) return;
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

  setFieldErrors((prev) => ({
    ...prev,
    birthDate: "",
  }));

  // Keep hidden adult fields in form state so a DOB mis-click can be reversed
  // in the same session. Infant saves omit those keys instead of clearing them.
  setForm((prev) => ({
    ...prev,
    birthDate: value,
    age: nextAgeYears,
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
    setForm((current) => stageConnection(current, registry, connection, {preserveParentLinks:live}));
    setFieldErrors((current) => ({ ...current, familySerialNumber: "", relationshipToHouseholdHead: "", ...Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, ""])) }));
  }

  function cancelRegistration() {
    navigate(backPath);
  }

    function validateForm() {
    const nextErrors = {};
    if (householdEnabled) {
      if (householdReviewPending) nextErrors.familySerialNumber = "Confirm or cancel the household selection before saving.";
      const connectionToSave = withFormAddress(householdConnection, form);
      const allowedLabel = live ? isAcceptedLabel : undefined;
      const householdErrors = { ...validateConnection(registry, connectionToSave, editingPatientId, form, allowedLabel), ...validateHeadReplacement(registry, editingPatientId, connectionToSave, headReplacement, allowedLabel) };
      const { relationship, ...allOtherHouseholdErrors } = householdErrors;
      // The Address Information panel reports its own address errors.
      const otherHouseholdErrors = Object.fromEntries(Object.entries(allOtherHouseholdErrors).filter(([key]) => !ADDRESS_FIELDS.includes(key)));
      if (relationship) nextErrors.relationshipToHouseholdHead = relationship;
      if (Object.keys(otherHouseholdErrors).length) nextErrors.familySerialNumber = Object.values(otherHouseholdErrors)[0];
    }

    Object.assign(nextErrors, validatePatientForm(form, todayIso));
    if (form.birthDate && form.birthDate > todayIso) {
      setFieldErrors(nextErrors);
      return false;
    }
    if (form.motherBirthDate && form.motherBirthDate > todayIso) {
      nextErrors.motherBirthDate = "Mother birthdate cannot be in the future.";
    }

    if (form.fatherBirthDate && form.fatherBirthDate > todayIso) {
      nextErrors.fatherBirthDate = "Father birthdate cannot be in the future.";
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
        }
      : {
          registrationType: "general",
          patientClassification: form.patientClassification || "",
        };

    return {
      ...omitParentLinks(form),
      ...childPatientData,
      ...reportedParentValues(form),
      philHealthNumber:
        form.philHealthStatus === "With PhilHealth"
          ? form.philHealthNumber || null
          : null,
      purokArea: form.purokArea || null,
      familySerialNumber: form.familySerialNumber || null,
      name: formatFullName(form.firstName, form.middleName, form.lastName),
      ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
    };
  }

  const handleSubmit = async (options = {}) => {
    if (saving || !validateForm()) {
      setModals((current) => ({ ...current, confirm: false }));
      return;
    }

    try {
      setSaving(true);
      const patientData = buildPatientPayload();
      const saved = await savePatient(patientData, withFormAddress(householdConnection, form), editingPatientId, headReplacement, options);
      const savedId = saved?.id ? String(saved.id) : "";
      setCreatedPatientId(savedId);
      setForm(registrationForm(saved));
      setHouseholdConnection(connectionForPatient(saved));
      setHeadReplacement(null);
      setModals({ ...modals, confirm: false, success: true });
      toast.success(householdEnabled && live ? "Patient and household saved." : live ? "Patient saved." : "Patient saved in this mock session.");
    } catch (error) {
      const prompt = walkIn ? duplicatePrompt(error) : null;
      if (prompt) {
        setDuplicates(prompt);
        setModals((current) => ({ ...current, confirm: false }));
        return;
      }
      if (walkIn && error?.code === "VISIT_CHECK_IN_KEY_CONFLICT") {
        toast.error("This walk-in was already registered and checked in. Check the patient list before registering again.");
        setModals((current) => ({ ...current, confirm: false }));
        return;
      }
      const mapped = registrationErrors(error);
      setFieldErrors((current) => ({ ...current, ...mapped }));
      setModals((current) => ({ ...current, confirm: false }));
    } finally {
      setSaving(false);
    }
  };

  function registerAnother() {
    setForm({ ...INITIAL_FORM_STATE });
    setHouseholdConnection(null);
    setHeadReplacement(null);
    setCreatedPatientId("");
    setFieldErrors({});
    setModals({ confirm: false, success: false });
    // A new registration is a new visit: it must not reuse the previous check-in key.
    if (walkIn) onNewWalkIn?.();
    navigate(walkIn ? `${patientsPath}/add?check_in=1` : `${patientsPath}/add`);
  }

  async function checkInMatch(match) {
    try {
      setSaving(true);
      if (!match.activeVisitId) await checkInExistingPatient(match.id, walkIn.key);
      setDuplicates(null);
      navigate(patientsPath);
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        // Another desk checked this patient in first; the outcome is the same as ours.
        setDuplicates(null);
        navigate(patientsPath);
      } else {
        toast.error(error.message || "Unable to check this patient in.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (patientId && !savedPatient) return (
    <DashboardLayout role={role} title="Edit Patient">
      <p className="text-sm text-gray-900">{live ? "This patient is unavailable." : "This patient is no longer available in the mock session."}</p>
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

                    <ModernSelect
                      label="Education Level"
                      name="educationLevel"
                      value={form.educationLevel}
                      onChange={handleSelectChange}
                      options={EDUCATION_LEVEL_SELECT_OPTIONS}
                      placeholder="Not recorded"
                      error={fieldErrors.educationLevel}
                    />

                    <ModernSelect
                      label="Education Completed"
                      name="educationCompleted"
                      value={form.educationCompleted}
                      onChange={handleSelectChange}
                      options={EDUCATION_COMPLETED_SELECT_OPTIONS}
                      placeholder="Not recorded"
                      error={fieldErrors.educationCompleted}
                    />

                    <NhtsRadioGroup
                      label="NHTS Status"
                      name="nhtsStatus"
                      value={form.nhtsStatus}
                      onChange={handleSelectChange}
                      error={fieldErrors.nhtsStatus}
                    />
                  </div>
                )}
                {householdEnabled ? (
                  <FamilyRegistryField
                    allowDirectCreate={live && !editingPatientId}
                    live={live} onSearch={onSearch} searchResults={searchResults} searchLoading={searchLoading} searchError={searchError} refreshError={refreshError} onRefresh={onRefresh}
                    registry={registry}
                    patient={{ ...form, id: editingPatientId }}
                    connection={householdConnection}
                    savedConnection={savedConnection}
                    headReplacement={headReplacement}
                    onChange={handleHouseholdChange}
                    onPendingChange={setHouseholdReviewPending}
                    error={fieldErrors.familySerialNumber}
                    relationshipError={fieldErrors.relationshipToHouseholdHead}
                  />
                ) : (
                  <FormInput
                    label="Family Serial Number"
                    name="familySerialNumber"
                    value={form.familySerialNumber}
                    onChange={handleChange}
                    placeholder="Optional"
                    error={fieldErrors.familySerialNumber}
                  />
                )}
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

              <FormPanel
                icon={Users}
                title="Parent Information"
                description={infant ? "Mother name is required for infants. Father name is optional. A shared FSN does not confirm biological parenthood." : "Reported parent names are optional. A shared FSN does not confirm biological parenthood."}
              >
                <div className="space-y-4">
                  {Object.keys(PARENT_FIELDS).map((role) => (
                    <ParentFields
                      key={role}
                      role={role}
                      form={form}
                      errors={fieldErrors}
                      todayIso={todayIso}
                      required={role === "mother" && infant}
                      onChange={handleChange}
                      onBirthDateChange={handleParentBirthDateChange}
                    />
                  ))}
                  <HistoricalParentLinks patient={form} />
                </div>
              </FormPanel>
              <FormPanel icon={Users} title="Guardian Information" description="Optional guardian details, recorded separately from parents and household membership.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[["guardianName", "Guardian name"], ["guardianRelationship", "Guardian relationship"], ["guardianContactNumber", "Guardian contact"]].map(([name, label]) => (
                    <label key={name} className="space-y-1.5 text-sm text-neutral-700">{label}<Input name={name} value={form[name]} onChange={handleChange} type={name === 'guardianContactNumber' ? 'tel' : 'text'} /></label>
                  ))}
                </div>
              </FormPanel>

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
                    readOnly={householdConnection?.kind === "existing"}
                    value={form.streetAddress}
                    onChange={handleChange}
                    placeholder="House No., Street, Sitio"
                    error={fieldErrors.streetAddress}
                    required
                  />

                  <FormInput
                    label="Purok / Area"
                    name="purokArea"
                    readOnly={householdConnection?.kind === "existing"}
                    value={form.purokArea}
                    onChange={handleChange}
                    placeholder="Optional, e.g. Purok 3"
                    error={fieldErrors.purokArea}
                  />

                  <div>
                    <FormInput
                      label="Barangay"
                      name="barangay"
                      readOnly={householdConnection?.kind === "existing"}
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
                    readOnly={householdConnection?.kind === "existing"}
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
              className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 disabled:opacity-50 sm:w-auto"
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
        onClose={() => { setModals({ confirm: false, success: false }); navigate(postSaveDestination({ checkIn: Boolean(walkIn), patientsPath, patientId: createdPatientId })); }}
        footer={<>
          <Button type="button" variant="ghost" onClick={registerAnother}>Register Another Patient</Button>
          <Button type="button" onClick={() => { setModals({ confirm: false, success: false }); navigate(walkIn ? patientsPath : `${patientsPath}/${createdPatientId}${live ? "?tab=patient-info&edit=demographics" : ""}`); }}>{walkIn ? "Back to queue" : "Edit Patient"}</Button>
        </>}
      ><PatientRegistrationSuccess householdEnabled={householdEnabled} live={live} serialNumber={form.familySerialNumber} /></ModalShell>}
      {modals.confirm && <ModalShell
        title="Save Patient?" appearance="plain"
        onClose={() => setModals((current) => ({ ...current, confirm: false }))}
        footer={<>
          <Button type="button" variant="ghost" onClick={() => setModals((current) => ({ ...current, confirm: false }))}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={() => handleSubmit()}>Save Patient</Button>
        </>}
      ><p>{householdEnabled ? "Save this patient's details and household connection?" : "Save this patient's details?"}</p></ModalShell>}
      {duplicates && <ModalShell
        title="Possible duplicate patient" appearance="plain"
        onClose={() => setDuplicates(null)}
        footer={<>
          <Button type="button" variant="ghost" onClick={() => setDuplicates(null)}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={() => { setDuplicates(null); handleSubmit({ confirmDuplicate: true }); }}>Register anyway</Button>
        </>}
      >
        <p>This RHU already has a patient with the same name and birthdate. Use the existing record to avoid a duplicate.</p>
        <ul>{duplicates.matches.map((match) => <li key={match.id}>
          {match.fullName}{match.birthdate ? `, born ${match.birthdate}` : ""}
          {match.activeVisitId ? " — already in today's queue" : ""}
          {" "}<Button type="button" variant="ghost" disabled={saving} onClick={() => checkInMatch(match)}>{match.activeVisitId ? "Back to queue" : "Use this patient"}</Button>
        </li>)}</ul>
      </ModalShell>}
    </>
  );
}

export default function AddPatient() {
  return <PatientRegistrationPage />;
}

// Optional reported information is independent of historical parent links.
function ParentFields({
  role,
  form,
  errors,
  todayIso,
  required = false,
  onChange,
  onBirthDateChange,
}) {
  const fields = PARENT_FIELDS[role];
  return (
    <div className="grid min-w-0 gap-4 border-t border-[#EEF2F6] pt-5 sm:grid-cols-2 xl:grid-cols-3">
      <label className="space-y-1.5 text-sm text-neutral-700">{fields.label} name{required ? "" : " (optional)"}
      <Input
        name={fields.name}
        value={form[fields.name]}
        onChange={onChange}
        required={required}
        aria-invalid={Boolean(errors[fields.name])}
        aria-describedby={errors[fields.name] ? `${fields.name}-error` : undefined}
      />
      {errors[fields.name] && <span id={`${fields.name}-error`} className="block text-xs text-red-700">{errors[fields.name]}</span>}
      </label>

      <DatePickerField
        label={`${fields.label} Date of Birth`}
        name={fields.birthDate}
        value={form[fields.birthDate]}
        mode="birthdate"
        maxDate={todayIso}
        disableFuture
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
