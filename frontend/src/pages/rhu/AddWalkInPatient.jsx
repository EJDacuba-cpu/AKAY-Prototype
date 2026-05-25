import { useState } from "react";
import { useNavigate } from "react-router";
import DashboardLayout from "../../layouts/DashboardLayout";

function calculateAge(birthDate) {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

export default function AddWalkInPatient() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    birthDate: "",
    age: "",
    sex: "",
    contactNumber: "",
    address: "",
    visitType: "",
    chiefComplaint: "",
    specialization: "",
    assignedDoctor: "",
    visitDate: new Date().toISOString().split("T")[0],
    visitTime: "",
    status: "Waiting",
    notes: "",
  });

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => {
      if (name === "birthDate") {
        return {
          ...prev,
          birthDate: value,
          age: calculateAge(value),
        };
      }

      if (name === "visitType") {
        let suggestedSpecialization = "";

        if (value === "Prenatal Concern")
          suggestedSpecialization = "Maternal Care";
        if (value === "Child Health Check-up")
          suggestedSpecialization = "Pediatrics";
        if (value === "Senior Citizen Check-up")
          suggestedSpecialization = "Senior Citizen Care";
        if (value === "Consultation" || value === "Follow-up")
          suggestedSpecialization = "General Consultation";

        return {
          ...prev,
          visitType: value,
          specialization: suggestedSpecialization,
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Frontend demo only.
    // Later, this will send data to Laravel API and save to Supabase PostgreSQL.
    navigate("/rhu/walk-in-patients");
  }

  return (
    <DashboardLayout role="rhu" title="Add Walk-in Patient">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          Add Walk-in Patient
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Record a direct RHU patient visit that is not from a BHC referral.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Patient Information
          </h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="First Name"
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Middle Name"
              name="middleName"
              value={form.middleName}
              onChange={handleChange}
            />

            <FieldInput
              label="Last Name"
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Date of Birth"
              name="birthDate"
              type="date"
              value={form.birthDate}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Age"
              name="age"
              type="text"
              value={form.age ? `${form.age} years old` : ""}
              onChange={handleChange}
              readOnly
              required
            />

            <FieldSelect
              label="Sex"
              name="sex"
              value={form.sex}
              onChange={handleChange}
              required
            >
              <option value="">Select sex</option>
              <option>Male</option>
              <option>Female</option>
            </FieldSelect>

            <FieldInput
              label="Contact Number"
              name="contactNumber"
              value={form.contactNumber}
              onChange={handleChange}
              placeholder="09XXXXXXXXX"
            />

            <div className="lg:col-span-2">
              <FieldInput
                label="Address"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="House No., Street, Barangay, Municipality"
                required
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Visit Information
          </h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FieldSelect
              label="Visit Type"
              name="visitType"
              value={form.visitType}
              onChange={handleChange}
              required
            >
              <option value="">Select visit type</option>
              <option>Consultation</option>
              <option>Prenatal Concern</option>
              <option>Child Health Check-up</option>
              <option>Senior Citizen Check-up</option>
              <option>Follow-up</option>
            </FieldSelect>

            <FieldInput
              label="Visit Date"
              name="visitDate"
              type="date"
              value={form.visitDate}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Visit Time"
              name="visitTime"
              type="time"
              value={form.visitTime}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Chief Complaint"
              name="chiefComplaint"
              value={form.chiefComplaint}
              onChange={handleChange}
              placeholder="Example: Fever and cough"
              required
            />

            <FieldSelect
              label="Suggested Specialization"
              name="specialization"
              value={form.specialization}
              onChange={handleChange}
              required
            >
              <option value="">Select specialization</option>
              <option>General Consultation</option>
              <option>Maternal Care</option>
              <option>Pediatrics</option>
              <option>Senior Citizen Care</option>
            </FieldSelect>

            <FieldSelect
              label="Assigned Doctor"
              name="assignedDoctor"
              value={form.assignedDoctor}
              onChange={handleChange}
              required
            >
              <option value="">Select doctor</option>
              <option>Dr. Ana Reyes</option>
              <option>Dr. Maria Santos</option>
              <option>Dr. Jose Cruz</option>
            </FieldSelect>

            <FieldSelect
              label="Initial Status"
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option>Waiting</option>
              <option>In Consultation</option>
              <option>For Monitoring</option>
              <option>Completed</option>
            </FieldSelect>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Notes / Initial Observation
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              className="min-h-28 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
              placeholder="Write initial notes or observations..."
            />
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs leading-relaxed text-[#4B5563]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> This
            record is for RHU walk-in patients only. BHC-to-RHU referral
            patients should be processed under Incoming Referrals or QR Scanner.
          </p>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/rhu/walk-in-patients")}
            className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F9FAFB]"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
          >
            Save Walk-in Patient
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}

function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  readOnly,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        className={`h-10 w-full rounded-lg border border-[#E8ECF0] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04] ${
          readOnly ? "bg-slate-100 text-slate-500" : "bg-[#FAFBFC]"
        }`}
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      >
        {children}
      </select>
    </div>
  );
}
