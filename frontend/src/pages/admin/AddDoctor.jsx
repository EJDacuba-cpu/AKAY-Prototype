import { useState } from "react";
import { useNavigate } from "react-router";
import { Stethoscope } from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function AddDoctor() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    contactNumber: "",
    specialization: "",
    expertise: "",
    assignedFacility: "Rural Health Unit Bulakan",
    day: "",
    startTime: "",
    endTime: "",
    room: "",
    status: "Active",
  });

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Frontend demo only.
    // Later, this will send data to Laravel API and save to Supabase PostgreSQL.
    navigate("/admin/doctors");
  }

  return (
    <DashboardLayout role="admin" title="Add Doctor">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Add Doctor
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Register a doctor profile with specialization, expertise, and RHU
            schedule.
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <Stethoscope size={22} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Doctor Information
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Enter the doctor’s basic profile information.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Full Name"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              placeholder="Example: Dr. Maria Santos"
              required
            />

            <FieldInput
              label="Email Address"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="doctor@akay.local"
              required
            />

            <FieldInput
              label="Contact Number"
              name="contactNumber"
              value={form.contactNumber}
              onChange={handleChange}
              placeholder="09XXXXXXXXX"
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Specialization and Expertise
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            This helps RHU staff match referrals with the appropriate doctor.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <FieldSelect
              label="Specialization"
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
              <option>Immunization-related Cases</option>
            </FieldSelect>

            <FieldSelect
              label="Assigned Facility"
              name="assignedFacility"
              value={form.assignedFacility}
              onChange={handleChange}
              required
            >
              <option>Rural Health Unit Bulakan</option>
            </FieldSelect>
          </div>

          <div className="mt-4">
            <FieldTextarea
              label="Expertise / Case Focus"
              name="expertise"
              value={form.expertise}
              onChange={handleChange}
              placeholder="Example: Prenatal and pregnancy-related cases"
              required
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Doctor Schedule
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Set the doctor’s initial duty schedule.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <FieldSelect
              label="Day"
              name="day"
              value={form.day}
              onChange={handleChange}
              required
            >
              <option value="">Select day</option>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Wednesday</option>
              <option>Thursday</option>
              <option>Friday</option>
              <option>Saturday</option>
            </FieldSelect>

            <FieldInput
              label="Start Time"
              name="startTime"
              type="time"
              value={form.startTime}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="End Time"
              name="endTime"
              type="time"
              value={form.endTime}
              onChange={handleChange}
              required
            />

            <FieldInput
              label="Room"
              name="room"
              value={form.room}
              onChange={handleChange}
              placeholder="Example: Consultation Room 1"
              required
            />

            <FieldSelect
              label="Account Status"
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option>Active</option>
              <option>Inactive</option>
            </FieldSelect>
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs leading-relaxed text-[#4B5563]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> Doctor
            information is used for referral prioritization and schedule
            coordination. Final patient assignment should still be verified by
            authorized RHU personnel.
          </p>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin/doctors")}
            className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F9FAFB]"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
          >
            Save Doctor
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
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
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

function FieldTextarea({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="min-h-28 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}
