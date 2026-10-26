import { formatEducation } from "../../../../utils/backgroundFormat";
import { formatLongDate } from "../../../../utils/formatters";
import { parentInformation } from "../../../../utils/parentLinks";
import { Input } from "../../../ui/input";
import {
  EDUCATION_COMPLETED_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  readEducation,
} from "../../../../utils/patientRegistrationPayload";
import { calculateAgeInMonths } from "../../../../utils/patientUtils";
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

const GUARDIAN_FIELDS = [
  ["Previously reported parent / guardian", ["parentName", "parent_name"]],
  ["Guardian", ["guardianName", "guardian_name"]],
  ["Guardian relationship", ["guardianRelationship", "guardian_relationship"]],
  ["Guardian contact", ["guardianContactNumber", "guardian_contact_number"]],
];

const INPUT_CLASS =
  "mt-1 h-9 w-full min-w-0 rounded-lg border bg-white px-3 text-sm text-neutral-900 shadow-xs outline-none transition focus:border-ink-300 focus:ring-4 focus:ring-ink-100";

function EditField({ label, required, readOnly, error, value, ...props }) {
  return (
    <label className="min-w-0 text-xs text-neutral-500">
      {label}
      {required && <span className="text-alert-600"> *</span>}
      <Input
        {...props}
        value={value ?? ""}
        required={required}
        readOnly={readOnly}
        aria-invalid={Boolean(error)}
        className={`${INPUT_CLASS} ${
          error
            ? "border-alert-300"
            : readOnly
              ? "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-500"
              : "border-neutral-300"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] font-medium text-alert-600">{error}</span>}
    </label>
  );
}

function EditSelect({ label, required, error, children, value, ...props }) {
  return (
    <label className="min-w-0 text-xs text-neutral-500">
      {label}
      {required && <span className="text-alert-600"> *</span>}
      <select
        {...props}
        value={value ?? ""}
        required={required}
        aria-invalid={Boolean(error)}
        className={`${INPUT_CLASS} ${error ? "border-alert-300" : "border-neutral-300"}`}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-[11px] font-medium text-alert-600">{error}</span>}
    </label>
  );
}

function EditGrid({ children }) {
  return <div className="grid gap-x-4 gap-y-3 @sm:grid-cols-2">{children}</div>;
}

/**
 * Registration identity, parent and separate guardian information for every age.
 * Only one section edits at a time; the page owns validation and saving.
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
  householdLocked = false,
  onViewHousehold,
  onManageParents,
}) {
  const read = (keys, fallback = "") => getPatientValue(patient, keys, fallback);
  const editing = editingSection !== null;

  const parents = ['mother', 'father'].map((role) => ({ role, ...parentInformation(patient, role) }));

  const formAgeMonths = calculateAgeInMonths(form.birthDate);
  const hasBirthDate = Boolean(form.birthDate);
  const isEpiTargetAge = hasBirthDate && formAgeMonths !== "" && Number(formAgeMonths) <= 12;
  const shouldRequireCivilStatus = hasBirthDate && !isEpiTargetAge;

  const actionsFor = (section) =>
    !onEdit ? null : editingSection === section ? (
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
        aria-label={`Edit ${section === "demographics" ? "demographics" : section === "contact" ? "contact and address" : "parent and guardian information"}`}
      >
        Edit
      </TextAction>
    );

  const familyRows = [
    ...GUARDIAN_FIELDS.map(([label, keys]) => {
      const value = read(keys);
      return hasDisplayValue(value)
        ? [label, label.includes("birthday") ? formatLongDate(value, "") : value]
        : null;
    }),
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
  const education = readEducation(patient);
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
            <EditSelect label="Education level" name="educationLevel" value={form.educationLevel} onChange={onChange} error={fieldErrors.educationLevel}>
              <option value="">Not recorded</option>
              {EDUCATION_LEVEL_OPTIONS.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </EditSelect>
            <EditSelect label="Education completed" name="educationCompleted" value={form.educationCompleted} onChange={onChange} error={fieldErrors.educationCompleted}>
              <option value="">Not recorded</option>
              {EDUCATION_COMPLETED_OPTIONS.map((completed) => (
                <option key={completed}>{completed}</option>
              ))}
            </EditSelect>
            <EditField label="NHTS status" name="nhtsStatus" value={form.nhtsStatus} onChange={onChange} />
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
              ["Education", formatEducation({ level: education.educationLevel, completed: education.educationCompleted })],
              ["NHTS status", read(["nhtsStatus", "nhts_status"])],
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
            <EditField label="Street address" name="streetAddress" value={form.streetAddress} onChange={onChange} error={fieldErrors.streetAddress} required readOnly={householdLocked} />
            <EditField label="Purok / Area" name="purokArea" value={form.purokArea} onChange={onChange} readOnly={householdLocked} />
            {householdLocked ? (
              <EditField label="Barangay" name="barangay" value={form.barangay} onChange={onChange} readOnly />
            ) : (
              <EditSelect label="Barangay" name="barangay" value={form.barangay} onChange={onChange} error={fieldErrors.barangay} required>
                <option value="">Select barangay</option>
                {BULAKAN_BARANGAYS.map((barangay) => (
                  <option key={barangay}>{barangay}</option>
                ))}
              </EditSelect>
            )}
            <EditField label="Municipality / City" name="municipality" value={form.municipality} onChange={onChange} error={fieldErrors.municipality} required readOnly={householdLocked} />
            {householdLocked && (
              <p className="col-span-full text-xs text-neutral-500">The address belongs to the household. Use Edit Family or Change Household to change it.</p>
            )}
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

      <ProfileSection
        id="household"
        title="Household"
        actions={onViewHousehold ? (
          <TextAction onClick={onViewHousehold} disabled={editing} title={editing ? "Save or cancel the section you are editing first" : undefined}>
            View Household
          </TextAction>
        ) : null}
      >
        <FieldList
          rows={[
            ["Family serial no.", read(["familySerialNumber", "family_serial_number"]) || "No household assigned"],
            ...(householdLocked ? [["Relationship to head", read(["relationshipToHouseholdHead", "relationship_to_household_head"])]] : []),
          ]}
        />
      </ProfileSection>

        <ProfileSection id="family" title="Parent Information" actions={actionsFor("family")}>
          <div className="space-y-4">
            {parents.map((parent) => {
              const label = parent.role === 'mother' ? 'Mother' : 'Father';
              return <div key={parent.role}>
                {editingSection === 'family' && !parent.linked ? (
                  <EditField label={`${label} name (reported, optional)`} name={`${parent.role}Name`} value={form[`${parent.role}Name`]} onChange={onChange} error={fieldErrors[`${parent.role}Name`]} />
                ) : <FieldList rows={[
                  [parent.linked ? `${label} (linked)` : `${label} (reported)`, parent.name],
                  ...(parent.birthDate ? [[`${label}'s birthday`, formatLongDate(parent.birthDate, '')]] : []),
                ]} />}
                {parent.linked && (parent.reportedName || parent.reportedBirthDate) && <p className="mt-2 text-xs text-neutral-600">Previously reported: {[parent.reportedName, formatLongDate(parent.reportedBirthDate, '')].filter(Boolean).join(' · ')}. Preserved separately.</p>}
              </div>;
            })}
            <p className="text-xs text-neutral-600">Connect registered parents through Families. Reported names are optional. A shared FSN does not confirm parenthood.</p>
            {onManageParents && <TextAction onClick={onManageParents} disabled={editing}>Manage parent connections in Families</TextAction>}
          </div>
        </ProfileSection>
        <ProfileSection id="guardian" title="Guardian Information" actions={editingSection === 'family' ? null : actionsFor('family')}>
          {editingSection === "family" ? (
            <EditGrid>
              <EditField label="Guardian name" name="guardianName" value={form.guardianName} onChange={onChange} />
              <EditField label="Guardian relationship" name="guardianRelationship" value={form.guardianRelationship} onChange={onChange} />
              <EditField label="Guardian contact" name="guardianContactNumber" value={form.guardianContactNumber} onChange={onChange} />
            </EditGrid>
          ) : (
            <FieldList rows={familyRows.length ? familyRows : [['Guardian', '']]} />
          )}
          <p className="mt-3 text-xs text-neutral-600">Record guardian details separately. Parent and household connections do not establish legal guardianship.</p>
        </ProfileSection>
    </>
  );
}
