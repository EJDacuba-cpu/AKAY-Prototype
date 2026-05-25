import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  UserPlus,
  MapPin,
  HeartPulse,
  Shield,
  FileText,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

function calculateAge(birthDate) {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);

  let age = today.getFullYear() - dob.getFullYear();

  const monthDifference = today.getMonth() - dob.getMonth();
  const dayDifference = today.getDate() - dob.getDate();

  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age--;
  }

  return age;
}

export default function AddPatient() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
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
    philhealthNumber: "",
    philhealthCategory: "",
    patientCategory: "",
    status: "Active",
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

      return {
        ...prev,
        [name]: value,
      };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    navigate("/rhu/patients");
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .anim-card {
          opacity: 0;
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>

      <DashboardLayout role="rhu" title="Add Patient">
        {/* Header */}
        <div className="mb-8 anim-card" style={{ animationDelay: "0ms" }}>
          <Link
            to="/rhu/patients"
            className="mb-4 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2E59] transition-all duration-200 hover:gap-2.5 hover:text-[#092347]"
          >
            <ArrowLeft size={16} />
            Back to Patients
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06]">
              <UserPlus size={20} className="text-[#0B2E59]" />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
                Add Patient
              </h1>
              <p className="mt-0.5 text-sm text-[#6B7280]">
                Register a new patient profile at the Rural Health Unit.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <section
            className="anim-card rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={{ animationDelay: "50ms" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <HeartPulse size={16} className="text-[#0B2E59]" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Basic Information
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Enter the patient’s personal information.
                </p>
              </div>
            </div>

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

              <FieldSelect
                label="Civil Status"
                name="civilStatus"
                value={form.civilStatus}
                onChange={handleChange}
              >
                <option value="">Select civil status</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </FieldSelect>

              <FieldInput
                label="Contact Number"
                name="contactNumber"
                value={form.contactNumber}
                onChange={handleChange}
                placeholder="09XXXXXXXXX"
              />
            </div>
          </section>

          {/* Address */}
          <section
            className="anim-card rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <MapPin size={16} className="text-[#0B2E59]" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Address Information
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Current residential address.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <FieldInput
                label="Street Address"
                name="streetAddress"
                value={form.streetAddress}
                onChange={handleChange}
                placeholder="House No., Purok, Street"
                required
              />

              <FieldSelect
                label="Barangay"
                name="barangay"
                value={form.barangay}
                onChange={handleChange}
                required
              >
                <option value="">Select barangay</option>
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
              </FieldSelect>

              <FieldInput
                label="Municipality"
                name="municipality"
                value={form.municipality}
                onChange={handleChange}
                required
              />
            </div>
          </section>

          {/* Health Identification */}
          <section
            className="anim-card rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={{ animationDelay: "250ms" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <Shield size={16} className="text-[#0B2E59]" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Health Identification
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  PhilHealth details, if applicable.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <FieldInput
                label="PhilHealth Account Number"
                name="philhealthNumber"
                value={form.philhealthNumber}
                onChange={handleChange}
                placeholder="Optional"
              />

              <FieldSelect
                label="PhilHealth Category"
                name="philhealthCategory"
                value={form.philhealthCategory}
                onChange={handleChange}
              >
                <option value="">Select category</option>
                <option>Member</option>
                <option>Dependent</option>
                <option>Senior Citizen</option>
                <option>Indigent</option>
                <option>None</option>
              </FieldSelect>
            </div>
          </section>

          {/* BHC Patient Classification */}
          <section
            className="anim-card rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={{ animationDelay: "350ms" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <FileText size={16} className="text-[#0B2E59]" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Patient Classification
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Patient Classification Visit history and consultation details
                  should be recorded under Health Records.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <FieldSelect
                label="Patient Category"
                name="patientCategory"
                value={form.patientCategory}
                onChange={handleChange}
                required
              >
                <option value="">Select patient category</option>
                <option>General Consultation</option>
                <option>Maternal</option>
                <option>Senior Citizen</option>
                <option>Immunization</option>
              </FieldSelect>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Notes
              </label>

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                className="min-h-[100px] w-full resize-none rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm leading-relaxed text-[#1A1A1A] outline-none transition-all duration-200 placeholder:text-[#BCC3CD] focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
                placeholder="Optional notes about the patient profile..."
              />
            </div>
          </section>

          {/* Action Buttons */}
          <div
            className="anim-card flex items-center justify-end gap-3 pt-2"
            style={{ animationDelay: "450ms" }}
          >
            <button
              type="button"
              onClick={() => navigate("/rhu/patients")}
              className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-xs font-semibold text-[#6B7280] transition-all duration-200 hover:bg-[#F9FAFB] hover:shadow-sm active:scale-[0.98]"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#0B2E59]/10 transition-all duration-200 hover:bg-[#092347] hover:shadow-md hover:shadow-[#0B2E59]/20 active:scale-[0.98]"
            >
              <UserPlus size={14} />
              Save Patient Profile
            </button>
          </div>
        </form>
      </DashboardLayout>
    </>
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
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        className={`h-10 w-full rounded-lg border border-[#E8ECF0] px-3 text-sm text-[#1A1A1A] outline-none transition-all duration-200 focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04] ${
          readOnly
            ? "cursor-not-allowed border-[#E8ECF0] bg-[#F3F4F6] text-[#6B7280]"
            : "bg-[#FAFBFC] hover:border-[#BCC3CD]"
        }`}
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full appearance-none rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 pr-8 text-sm text-[#1A1A1A] outline-none transition-all duration-200 hover:border-[#BCC3CD] focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
        }}
      >
        {children}
      </select>
    </div>
  );
}

