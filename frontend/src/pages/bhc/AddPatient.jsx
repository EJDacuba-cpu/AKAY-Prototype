import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  UserPlus,
  MapPinHouse,
  FileText,
  Baby,
  HeartPulse,
} from "lucide-react"; // FIXED: Added missing icons

import DashboardLayout from "../../components/layout/DashboardLayout";
import ConfirmationModal from "../../components/common/modals/ConfirmationModal";
import SuccessModal from "../../components/common/modals/SuccessModal";

// Import extracted utils and components
import {
  calculateAge,
  normalizePhilippineContact,
  formatFullName,
  formatTpal,
} from "../../utils/patientUtils";
import {
  SectionHeader,
  PhilippineContactInput,
  TpalHistoryGrid,
} from "../../components/features/patients/PatientFormComponents";

// Import existing reusable inputs
import FormInput from "../../components/common/forms/FormInput";
import FormSelect from "../../components/common/forms/FormSelect";
import FormTextarea from "../../components/common/forms/FormTextarea";

import { createBhcPatient } from "../../services/patientService";

// Animation Utility
const stagger = (i) => ({
  animationDelay: `${i * 80}ms`,
});

// Initial State Definition
const INITIAL_FORM_STATE = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
  age: "",
  sex: "",
  civilStatus: "",
  contactNumber: "",
  streetAddress: "",
  barangay: "",
  municipality: "Bulakan",
  patientClassification: "",
  notes: "",
  // Immunization
  guardianName: "",
  guardianRelationship: "",
  guardianContact: "",
  birthWeight: "",
  feedingStatus: "",
  childAgeGroup: "",
  // Maternal
  lmp: "",
  pmp: "",
  cycleDuration: "",
  gravida: "",
  para: "",
  term: "",
  preterm: "",
  abortion: "",
  living: "",
};

export default function AddPatient() {
  const navigate = useNavigate();

  // Unified State Management
  const [modals, setModals] = useState({
    confirm: false,
    success: false,
  });
  const [saving, setSaving] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState("");
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const isImmunization = form.patientClassification === "Immunization";

  // --- HANDLERS ---

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => {
      // Phone Normalization
      if (name === "contactNumber" || name === "guardianContact") {
        return { ...prev, [name]: normalizePhilippineContact(value) };
      }

      // Age Calculation
      if (name === "birthDate") {
        return {
          ...prev,
          birthDate: value,
          age: calculateAge(value),
        };
      }

      // Dynamic Field Reset based on Classification
      if (name === "patientClassification") {
        const isMaternal = value === "Maternal";
        const isImmunization = value === "Immunization";

        return {
          ...prev,
          patientClassification: value,
          ...(isImmunization
            ? {
                civilStatus: "",
                contactNumber: "",
              }
            : {}),
          // Reset Maternal fields if not Maternal
          ...(isMaternal
            ? {}
            : {
                lmp: "",
                pmp: "",
                cycleDuration: "",
                gravida: "",
                para: "",
                term: "",
                preterm: "",
                abortion: "",
                living: "",
              }),
          // Reset Immunization fields if not Immunization
          ...(isImmunization
            ? {}
            : {
                guardianName: "",
                guardianRelationship: "",
                guardianContact: "",
                birthWeight: "",
                feedingStatus: "",
              }),
        };
      }

      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);

      const patientData = {
        ...form,
        id: Date.now().toString(),
        name: formatFullName(form.firstName, form.middleName, form.lastName),
        category: form.patientClassification,
        ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
        tpal:
          form.patientClassification === "Maternal"
            ? formatTpal(form.term, form.preterm, form.abortion, form.living)
            : "",
      };

      const created = await createBhcPatient(patientData);
      const nextId =
        created?.details?.id || created?.patient?.id || patientData.id;

      setCreatedPatientId(nextId);
      setModals({ ...modals, confirm: false, success: true });
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setSaving(false);
    }
  };

  // --- RENDER ---

  return (
    <>
      <DashboardLayout role="bhc" title="Add Patient">
        {/* Header */}
        <div className="anim-fade-up mb-8" style={stagger(0)}>
          <div className="flex flex-col gap-2">
            <Link
              to="/bhc/patients"
              className="inline-flex w-fit items-center gap-2 text-xs font-semibold text-gray-500 transition-colors hover:text-[#B91C1C]"
            >
              <ArrowLeft size={14} />
              Back to Patients
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Add New Patient
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Register a new patient profile into the Barangay Health Center
                system.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setModals({ ...modals, confirm: true });
          }}
          className="space-y-6"
        >
          {/* SECTION 1: BASIC INFO */}
          <section
            className="anim-fade-up rounded-xl border border-gray-200 border-t-4 border-t-[#B91C1C] bg-white p-6 shadow-sm"
            style={stagger(1)}
          >
            <SectionHeader
              icon={UserPlus}
              title="Basic Information"
              description="Personal identity and demographic details."
            />

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="First Name"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
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
                required
              />

              <FormInput
                label="Date of Birth"
                name="birthDate"
                type="date"
                value={form.birthDate}
                onChange={handleChange}
                required
              />
              <FormInput
                label="Age"
                name="age"
                type="text"
                value={form.age ? `${form.age} years old` : ""}
                readOnly
                className="bg-gray-50"
              />
              <FormSelect
                label="Sex"
                name="sex"
                value={form.sex}
                onChange={handleChange}
                required
              >
                <option value="">Select sex</option>
                <option>Male</option>
                <option>Female</option>
              </FormSelect>

              {!isImmunization && (
                <>
                  <FormSelect
                    label="Civil Status"
                    name="civilStatus"
                    value={form.civilStatus}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Civil Status</option>
                    <option>Single</option>
                    <option>Married</option>
                  </FormSelect>

                  <div className="lg:col-span-2">
                    <PhilippineContactInput
                      label="Contact Number"
                      name="contactNumber"
                      value={form.contactNumber}
                      onChange={handleChange}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* SECTION 2: ADDRESS */}
          <section
            className="anim-fade-up rounded-xl border border-gray-200 border-t-4 border-t-[#B91C1C] bg-white p-6 shadow-sm"
            style={stagger(2)}
          >
            <SectionHeader
              icon={MapPinHouse}
              title="Address Information"
              description="Current residential address details."
            />

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FormInput
                label="Street Address"
                name="streetAddress"
                value={form.streetAddress}
                onChange={handleChange}
                placeholder="House No., Purok, Street"
                required
              />

              <div className="lg:col-span-2">
                <div className="grid gap-5 md:grid-cols-2">
                  <FormSelect
                    label="Barangay"
                    name="barangay"
                    value={form.barangay}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select barangay</option>
                    {/* Options */}
                    <option>Bagumbayan</option>
                    <option>Balubad</option>
                    <option>Bambang</option>
                    <option>Matungao</option>
                    <option>Maysantol</option>
                    <option>Perez</option>
                    <option>Pitpitan</option>
                    <option>San Francisco</option>
                    <option>San Jose</option>
                    <option>San Nicolas</option>
                    <option>Santa Ana</option>
                    <option>Santa Ines</option>
                    <option>Taliptip</option>
                    <option>Tibig</option>
                  </FormSelect>
                  <FormInput
                    label="Municipality"
                    name="municipality"
                    value={form.municipality}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: CLASSIFICATION */}
          <section
            className="anim-fade-up rounded-xl border border-gray-200 border-t-4 border-t-[#B91C1C] bg-white p-6 shadow-sm"
            style={stagger(3)}
          >
            <SectionHeader
              icon={FileText}
              title="Patient Classification"
              description="Select the primary classification for health record management."
            />

            <div className="grid gap-5 md:grid-cols-2">
              <FormSelect
                label="Patient Classification"
                name="patientClassification"
                value={form.patientClassification}
                onChange={handleChange}
                required
              >
                <option value="">Select Classification</option>
                <option>General Consultation</option>
                <option>Maternal</option>
                <option>Immunization</option>
                <option>Senior Citizen</option>
              </FormSelect>
            </div>

            <div className="mt-4">
              <FormTextarea
                label="Notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional notes..."
              />
            </div>
          </section>

          {/* DYNAMIC: IMMUNIZATION */}
          {isImmunization && (
            <section
              className="anim-fade-up rounded-xl border border-gray-200 border-t-4 border-t-[#B91C1C] bg-white p-6 shadow-sm"
              style={stagger(4)}
            >
              <SectionHeader
                icon={Baby}
                title="Immunization / Child Information"
                description="Fill out child specific tracking data."
              />

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <FormInput
                  label="Guardian Name"
                  name="guardianName"
                  value={form.guardianName}
                  onChange={handleChange}
                  required
                />
                <FormInput
                  label="Relationship"
                  name="guardianRelationship"
                  value={form.guardianRelationship}
                  onChange={handleChange}
                  required
                />
                <PhilippineContactInput
                  label="Guardian Contact"
                  name="guardianContact"
                  value={form.guardianContact}
                  onChange={handleChange}
                />
                <FormInput
                  label="Birth Weight (kg)"
                  name="birthWeight"
                  type="number"
                  value={form.birthWeight}
                  onChange={handleChange}
                />
                <FormSelect
                  label="Feeding Status"
                  name="feedingStatus"
                  value={form.feedingStatus}
                  onChange={handleChange}
                >
                  <option value="">Select Status</option>
                  <option>Exclusive Breastfeeding</option>
                  <option>Mixed Feeding</option>
                  <option>Formula Feeding</option>
                </FormSelect>
              </div>
            </section>
          )}

          {/* DYNAMIC: MATERNAL */}
          {form.patientClassification === "Maternal" && (
            <section
              className="anim-fade-up rounded-xl border border-gray-200 border-t-4 border-t-[#B91C1C] bg-white p-6 shadow-sm"
              style={stagger(4)}
            >
              <SectionHeader
                icon={HeartPulse}
                title="Maternal / Obstetric History"
                description="Provide complete pregnancy and menstrual tracking data."
              />

              {/* Menstrual History */}
              <div className="mb-8">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                  Menstrual History
                </h3>
                <div className="grid gap-5 md:grid-cols-3">
                  <FormInput
                    label="LMP"
                    name="lmp"
                    type="date"
                    value={form.lmp}
                    onChange={handleChange}
                  />
                  <FormInput
                    label="PMP"
                    name="pmp"
                    type="date"
                    value={form.pmp}
                    onChange={handleChange}
                  />
                  <FormInput
                    label="Cycle (Days)"
                    name="cycleDuration"
                    type="number"
                    value={form.cycleDuration}
                    onChange={handleChange}
                    placeholder="e.g. 28"
                  />
                </div>
              </div>

              {/* Obstetric History */}
              <div className="mb-8">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                  Obstetric History (GTPAL)
                </h3>

                <div className="grid gap-5 lg:grid-cols-2 mb-6">
                  <FormInput
                    label="Gravida (G)"
                    name="gravida"
                    type="number"
                    value={form.gravida}
                    onChange={handleChange}
                    placeholder="Total pregnancies"
                  />
                  <FormInput
                    label="Para (P)"
                    name="para"
                    type="number"
                    value={form.para}
                    onChange={handleChange}
                    placeholder="Births > 20 weeks"
                  />
                </div>

                <TpalHistoryGrid form={form} onChange={handleChange} />
              </div>
            </section>
          )}

          {/* ACTIONS */}
          <div
            className="anim-fade-up flex items-center justify-end gap-4 pt-4"
            style={stagger(5)}
          >
            <button
              type="button"
              onClick={() => navigate("/bhc/patients")}
              className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#991B1B]"
            >
              <UserPlus size={14} />
              Save Profile
            </button>
          </div>
        </form>
      </DashboardLayout>

      {/* Modals */}
      <SuccessModal
        open={modals.success}
        title="Patient Successfully Added"
        description="The patient profile has been successfully saved to the system."
        buttonText="Back to Patients"
        onClose={() => navigate("/bhc/patients")}
        secondaryButtonText="Add Health Record"
        onSecondaryAction={() =>
          navigate(`/bhc/health-records/add?patientId=${createdPatientId}`)
        }
      />
      <ConfirmationModal
        open={modals.confirm}
        title="Save Patient Profile?"
        description="Please confirm that the patient information entered is accurate before saving."
        confirmText="Save Patient"
        cancelText="Cancel"
        onConfirm={handleSubmit}
        onCancel={() => setModals({ ...modals, confirm: false })}
        loading={saving}
      />
    </>
  );
}
