import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  UserPlus,
  MapPinHouse,
} from "lucide-react"; // FIXED: Added missing icons

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  FormInput,
  FormSelect,
  SuccessModal
} from "../../components/common";

// Import extracted utils and components
import {
  calculateAge,
  normalizePhilippineContact,
  formatFullName,
} from "../../utils/patientUtils";
import {
  SectionHeader,
  PhilippineContactInput,
} from "../../components/features/patients/PatientFormComponents";

import { createBhcPatient } from "../../services/patientService";
import { queryKeys } from "../../utils/queryKeys";

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
};

export default function AddPatient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Unified State Management
  const [modals, setModals] = useState({
    confirm: false,
    success: false,
  });
  const [saving, setSaving] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState("");
  const [form, setForm] = useState(INITIAL_FORM_STATE);


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
        ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
      };

      const created = await createBhcPatient(patientData);
      const nextId =
        created?.id || created?.details?.id || created?.patient?.id || patientData.id;

      queryClient.invalidateQueries({ queryKey: queryKeys.patients("bhc") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary("bhc"),
      });
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
              Register Patient
            </button>
          </div>
        </form>
      </DashboardLayout>

      {/* Modals */}
      <SuccessModal
        open={modals.success}
        title="Patient Registered Successfully"
        description="Patient Registered Successfully
The patient profile has been created. You may now add the first health record or return to the patient list."
        buttonText="Back to Patient List"
        onClose={() => navigate("/bhc/patients")}
        secondaryButtonText="Add Health Record"
        onSecondaryAction={() =>
          navigate(`/bhc/health-records/add?patientId=${createdPatientId}`)
        }
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
      />
    </>
  );
}
