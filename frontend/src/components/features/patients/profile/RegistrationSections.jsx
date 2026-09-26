import { formatLongDate, formatPatientName } from "../../../../utils/formatters";
import { calculateAge, calculateAgeInMonths } from "../../../../utils/patientUtils";
import {
  BULAKAN_BARANGAYS,
  getPatientAge,
  getPatientValue,
  hasDisplayValue,
} from "../../../../utils/patientProfile";
import {
  FieldList,
  ProfileSection,
  SectionEditActions,
  TextAction,
} from "./ProfileSection";

const PARENT_FIELDS = [
  ["Parent / Guardian", ["parentName", "parent_name"]],
  ["Mother", ["motherName", "mother_name"]],
  ["Mother's birthday", ["motherBirthDate", "mother_birth_date"]],
  ["Father", ["fatherName", "father_name"]],
  ["Guardian", ["guardianName", "guardian_name"]],
  ["Guardian relationship", ["guardianRelationship", "guardian_relationship"]],
  ["Guardian contact", ["guardianContactNumber", "guardian_contact_number"]],
  ["Household head", ["householdHead", "household_head"]],
  ["Relation to head", ["relationshipToHouseholdHead", "relationship_to_household_head"]],
];

const BIRTH_FIELDS = [
  ["Birth place", ["birthPlace", "birth_place"]],
  ["Time of birth", ["birthTime", "birth_time"]],
  ["Birth weight", ["birthWeight", "birth_weight"]],
  ["Birth height", ["birthHeight", "birth_height"]],
];

const INPUT_CLASS =
  "mt-1 h-9 w-full min-w-0 rounded-md border bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/15";

function EditField({ label, required, readOnly, error, value, ...props }) {
  return (
    <label className="min-w-0 text-xs text-slate-500">
      {label}
      {required && <span className="text-[#B91C1C]"> *</span>}
      <input
        {...props}
        value={value ?? ""}
        required={required}
        readOnly={readOnly}
        aria-invalid={Boolean(error)}
        className={`${INPUT_CLASS} ${
          error
            ? "border-[#B91C1C]"
            : readOnly
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500"
              : "border-slate-300"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] font-medium text-[#B91C1C]">{error}</span>}
    </label>
  );
}

function EditSelect({ label, required, error, children, value, ...props }) {
  return (
    <label className="min-w-0 text-xs text-slate-500">
      {label}
      {required && <span className="text-[#B91C1C]"> *</span>}
      <select
        {...props}
        value={value ?? ""}
        required={required}
        aria-invalid={Boolean(error)}
        className={`${INPUT_CLASS} ${error ? "border-[#B91C1C]" : "border-slate-300"}`}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-[11px] font-medium text-[#B91C1C]">{error}</span>}
    </label>
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

function EditLinkedMotherSelect({ value, search, options, onSearchChange, onChange }) {
  return (
    <div className="min-w-0 text-xs text-slate-500 @sm:col-span-2">
      <label>
        Registered mother link
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search registered mother"
          className={`${INPUT_CLASS} border-slate-300`}
        />
      </label>
      <select
        aria-label="Linked mother"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} mt-2 border-slate-300`}
      >
        <option value="">No linked mother selected</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {getMotherPatientLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditGrid({ children }) {
  return <div className="grid gap-x-4 gap-y-3 @sm:grid-cols-2">{children}</div>;
}

/**
 * The patient's registration details as three inline-editable sections:
 * Demographics, Contact & Address, and (for children, or when the data
 * exists) Family & Birth. Only one section edits at a time; the page owns the
 * form, validation and save.
 */
export default function RegistrationSections({
  patient,
  form,
  editingSection,
  onEdit,
  onCancel,
  onSave,
  onChange,
  fieldErrors = {},
  saving = false,
  motherSearch,
  motherPatientOptions,
  onMotherSearchChange,
  onMotherPatientChange,
}) {
  const read = (keys, fallback = "") => getPatientValue(patient, keys, fallback);
  const editing = editingSection !== null;

  const linkedMother = patient.motherPatient || patient.mother_patient || patient.mother || null;
  const displayMotherName =
    read(["motherName", "mother_name"]) ||
    (linkedMother ? formatPatientName(linkedMother, "") : "");
  const hasParentData =
    PARENT_FIELDS.some(([, keys]) => hasDisplayValue(read(keys))) ||
    hasDisplayValue(displayMotherName);
  const hasBirthData = BIRTH_FIELDS.some(([, keys]) => hasDisplayValue(read(keys)));

  const formAgeYears = calculateAge(form.birthDate);
  const formAgeMonths = calculateAgeInMonths(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isFormMinor = hasBirthDate && formAgeYears !== "" && Number(formAgeYears) < 18;
  const isEpiTargetAge = hasBirthDate && formAgeMonths !== "" && Number(formAgeMonths) <= 12;
  const shouldRequireCivilStatus = hasBirthDate && !isEpiTargetAge;
  const showChildSections =
    hasParentData ||
    hasBirthData ||
    (editingSection === "family" || editingSection === "demographics"
      ? isFormMinor
      : Number(read(["age"], 99)) < 18);

  const actionsFor = (section) =>
    editingSection === section ? (
      <SectionEditActions
        saving={saving}
        onCancel={onCancel}
        onSave={() => onSave(section)}
      />
    ) : (
      <TextAction
        onClick={() => onEdit(section)}
        disabled={editing}
        title={editing ? "Save or cancel the section you are editing first" : undefined}
        aria-label={`Edit ${section === "demographics" ? "demographics" : section === "contact" ? "contact and address" : "family and birth"}`}
      >
        Edit
      </TextAction>
    );

  const familyRows = [
    ...PARENT_FIELDS.map(([label, keys]) => {
      const value = label === "Mother" ? displayMotherName : read(keys);
      return hasDisplayValue(value)
        ? [label, label.includes("birthday") ? formatLongDate(value, "") : value]
        : null;
    }),
    ...BIRTH_FIELDS.map(([label, keys]) =>
      hasDisplayValue(read(keys)) ? [label, read(keys)] : null,
    ),
  ].filter(Boolean);
  const age = getPatientAge(patient);
  const birthday = formatLongDate(read(["birthDate", "birthdate", "dateOfBirth", "date_of_birth"]), "");
  const address = [
    read(["address", "streetAddress", "street_address"]),
    read(["purok", "purokArea", "purok_area"]),
    read(["barangay"]),
    read(["municipality", "city"]),
  ]
    .filter(Boolean)
    .join(", ");
  const philHealth = [
    read(["philHealthStatus", "philhealth_status", "philHealthMembership", "philhealth_membership"]),
    read(["philHealthNumber", "philhealthNumber", "philhealth_number"]),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <ProfileSection id="demographics" title="Demographics" actions={actionsFor("demographics")}>
        {editingSection === "demographics" ? (
          <EditGrid>
            <EditField label="First name" name="firstName" value={form.firstName} onChange={onChange} error={fieldErrors.firstName} required />
            <EditField label="Middle name" name="middleName" value={form.middleName} onChange={onChange} />
            <EditField label="Last name" name="lastName" value={form.lastName} onChange={onChange} error={fieldErrors.lastName} required />
            <EditField label="Birthday" name="birthDate" type="date" value={form.birthDate} onChange={onChange} error={fieldErrors.birthDate} required />
            <EditField label="Age" name="age" value={form.age} readOnly />
            <EditSelect label="Sex" name="sex" value={form.sex} onChange={onChange} error={fieldErrors.sex} required>
              <option value="">Select sex</option>
              <option>Male</option>
              <option>Female</option>
            </EditSelect>
            <EditSelect label="Civil status" name="civilStatus" value={form.civilStatus} onChange={onChange} error={fieldErrors.civilStatus} required={shouldRequireCivilStatus}>
              <option value="">Select civil status</option>
              <option>Single</option>
              <option>Married</option>
              <option>Widowed</option>
              <option>Separated</option>
            </EditSelect>
            <EditField label="Occupation" name="occupation" value={form.occupation} onChange={onChange} />
            <EditField label="NHTS status" name="nhtsStatus" value={form.nhtsStatus} onChange={onChange} />
            {!showChildSections && (
              <EditField label="Family serial number" name="familySerialNumber" value={form.familySerialNumber} onChange={onChange} />
            )}
            {form.civilStatus === "Married" && (
              <>
                <EditField label="Spouse name" name="spouseName" value={form.spouseName} onChange={onChange} />
                <EditField label="Spouse occupation" name="spouseOccupation" value={form.spouseOccupation} onChange={onChange} />
              </>
            )}
          </EditGrid>
        ) : (
          <FieldList
            rows={[
              ["Birthday", [birthday, age !== "" ? `${age} yrs` : ""].filter(Boolean).join(" · ")],
              ["Sex", read(["sex"])],
              ["Civil status", read(["civilStatus", "civil_status"])],
              ["Occupation", read(["occupation"])],
              ["NHTS status", read(["nhtsStatus", "nhts_status"])],
              ...(!showChildSections ? [["Family serial no.", read(["familySerialNumber", "family_serial_number"])]] : []),
              ...(hasDisplayValue(read(["spouseName", "spouse_name"])) ? [["Spouse", read(["spouseName", "spouse_name"])]] : []),
              ...(hasDisplayValue(read(["spouseOccupation", "spouse_occupation"])) ? [["Spouse occupation", read(["spouseOccupation", "spouse_occupation"])]] : []),
            ]}
          />
        )}
      </ProfileSection>

      <ProfileSection id="contact" title="Contact & Address" actions={actionsFor("contact")}>
        {editingSection === "contact" ? (
          <EditGrid>
            <EditField label="Contact number" name="contactNumber" value={form.contactNumber} onChange={onChange} />
            <EditSelect label="PhilHealth membership" name="philHealthStatus" value={form.philHealthStatus} onChange={onChange}>
              <option value="">Select membership</option>
              <option>With PhilHealth</option>
              <option>No PhilHealth</option>
            </EditSelect>
            {form.philHealthStatus === "With PhilHealth" && (
              <EditField label="PhilHealth number" name="philHealthNumber" value={form.philHealthNumber} onChange={onChange} error={fieldErrors.philHealthNumber} required />
            )}
            <EditField label="Street address" name="streetAddress" value={form.streetAddress} onChange={onChange} error={fieldErrors.streetAddress} required />
            <EditField label="Purok / Area" name="purokArea" value={form.purokArea} onChange={onChange} />
            <EditSelect label="Barangay" name="barangay" value={form.barangay} onChange={onChange} error={fieldErrors.barangay} required>
              <option value="">Select barangay</option>
              {BULAKAN_BARANGAYS.map((barangay) => (
                <option key={barangay}>{barangay}</option>
              ))}
            </EditSelect>
            <EditField label="Municipality / City" name="municipality" value={form.municipality} onChange={onChange} error={fieldErrors.municipality} required />
          </EditGrid>
        ) : (
          <FieldList
            rows={[
              ["Contact", read(["contact", "contactNumber", "contact_number"])],
              ["PhilHealth", philHealth],
              ["Address", address],
            ]}
          />
        )}
      </ProfileSection>

      {showChildSections && (
        <ProfileSection id="family" title="Family & Birth" actions={actionsFor("family")}>
          {editingSection === "family" ? (
            <EditGrid>
              <EditField label="Mother name" name="motherName" value={form.motherName} onChange={onChange} error={fieldErrors.motherName} required={isFormMinor} />
              <EditField label="Family serial number" name="familySerialNumber" value={form.familySerialNumber} onChange={onChange} />
              <EditLinkedMotherSelect
                value={form.motherPatientId}
                search={motherSearch}
                options={motherPatientOptions}
                onSearchChange={onMotherSearchChange}
                onChange={onMotherPatientChange}
              />
              <EditField label="Father name" name="fatherName" value={form.fatherName} onChange={onChange} />
              <EditField label="Guardian name" name="guardianName" value={form.guardianName} onChange={onChange} />
              <EditField label="Guardian relationship" name="guardianRelationship" value={form.guardianRelationship} onChange={onChange} />
              <EditField label="Guardian contact" name="guardianContactNumber" value={form.guardianContactNumber} onChange={onChange} />
              <EditField label="Birth place" name="birthPlace" value={form.birthPlace} onChange={onChange} />
              <EditField label="Time of birth" name="birthTime" type="time" value={form.birthTime} onChange={onChange} />
              <EditField label="Birth weight" name="birthWeight" value={form.birthWeight} onChange={onChange} />
              <EditField label="Birth height" name="birthHeight" value={form.birthHeight} onChange={onChange} />
            </EditGrid>
          ) : (
            <FieldList rows={familyRows} />
          )}
        </ProfileSection>
      )}
    </>
  );
}
