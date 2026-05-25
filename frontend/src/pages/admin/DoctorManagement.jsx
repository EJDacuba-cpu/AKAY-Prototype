import { Link } from "react-router";
import { useState } from "react";
import {
  Activity,
  Edit3,
  Plus,
  Search,
  Stethoscope,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function DoctorManagement() {
  const [doctors, setDoctors] = useState([
    {
      id: "DOC-001",
      name: "Dr. Maria Santos",
      email: "maria.santos@akay.local",
      specialization: "Maternal Care",
      expertise: "Prenatal and pregnancy-related cases",
      schedule: "Monday, 8:00 AM - 12:00 PM",
      assignedFacility: "Rural Health Unit Bulakan",
      status: "Active",
    },
    {
      id: "DOC-002",
      name: "Dr. Jose Cruz",
      email: "jose.cruz@akay.local",
      specialization: "Pediatrics",
      expertise: "Child health check-up and pediatric consultation",
      schedule: "Monday, 1:00 PM - 5:00 PM",
      assignedFacility: "Rural Health Unit Bulakan",
      status: "Active",
    },
    {
      id: "DOC-003",
      name: "Dr. Ana Reyes",
      email: "ana.reyes@akay.local",
      specialization: "General Consultation",
      expertise: "General RHU consultation and walk-in assessment",
      schedule: "Tuesday, 8:00 AM - 5:00 PM",
      assignedFacility: "Rural Health Unit Bulakan",
      status: "Active",
    },
    {
      id: "DOC-004",
      name: "Dr. Carlo Mendoza",
      email: "carlo.mendoza@akay.local",
      specialization: "Senior Citizen Care",
      expertise: "Hypertension, follow-up, and elderly patient monitoring",
      schedule: "Wednesday, 8:00 AM - 12:00 PM",
      assignedFacility: "Rural Health Unit Bulakan",
      status: "Inactive",
    },
  ]);

  function updateStatus(id, newStatus) {
    setDoctors((prev) =>
      prev.map((doctor) =>
        doctor.id === id ? { ...doctor, status: newStatus } : doctor,
      ),
    );
  }

  const activeDoctors = doctors.filter(
    (doctor) => doctor.status === "Active",
  ).length;
  const inactiveDoctors = doctors.filter(
    (doctor) => doctor.status === "Inactive",
  ).length;
  const totalSpecializations = new Set(
    doctors.map((doctor) => doctor.specialization),
  ).size;

  return (
    <DashboardLayout role="admin" title="Doctor Management">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Doctor Management
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Manage RHU doctor profiles, specialization, expertise, and account
            status.
          </p>
        </div>
        <Link
          to="/admin/doctors/add"
          className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#092347]"
        >
          <Plus size={15} />
          Add Doctor
        </Link>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Doctors"
          value={doctors.length}
          icon={<Users size={17} />}
          color="navy"
        />
        <StatCard
          title="Active Doctors"
          value={activeDoctors}
          icon={<UserCheck size={17} />}
          color="green"
        />
        <StatCard
          title="Inactive Doctors"
          value={inactiveDoctors}
          icon={<UserX size={17} />}
          color="red"
        />
        <StatCard
          title="Specializations"
          value={totalSpecializations}
          icon={<Stethoscope size={17} />}
          color="blue"
        />
      </div>

      <div className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Doctor
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search doctor name..."
              />
            </div>
          </div>

          <FilterSelect label="Specialization">
            <option>All Specializations</option>
            <option>General Consultation</option>
            <option>Maternal Care</option>
            <option>Pediatrics</option>
            <option>Senior Citizen Care</option>
          </FilterSelect>

          <FilterSelect label="Facility">
            <option>All Facilities</option>
            <option>Rural Health Unit Bulakan</option>
          </FilterSelect>

          <FilterSelect label="Status">
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Doctor Profiles
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Doctor information used for referral prioritization and schedule
              coordination.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {doctors.length} doctors
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Doctor ID</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3">Expertise</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {doctors.map((doctor) => (
                <tr
                  key={doctor.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0B2E59]">
                      {doctor.id}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      {doctor.name}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {doctor.email}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <SpecializationBadge label={doctor.specialization} />
                  </td>

                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {doctor.expertise}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {doctor.schedule}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {doctor.assignedFacility}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={doctor.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <Edit3 size={14} />
                      </button>

                      {doctor.status === "Active" ? (
                        <button
                          onClick={() => updateStatus(doctor.id, "Inactive")}
                          className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(doctor.id, "Active")}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <div className="flex gap-3">
          <Activity size={18} className="text-[#0B2E59]" />
          <p className="text-xs leading-relaxed text-[#4B5563]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> Doctor
            specialization and expertise are used for referral prioritization
            and RHU coordination. Final medical decisions remain with authorized
            RHU personnel.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FilterSelect({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none">
        {children}
      </select>
    </div>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    blue: "border-t-blue-500 text-blue-700 bg-blue-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`flex-shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

function SpecializationBadge({ label }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: "bg-emerald-50 text-emerald-700",
    Inactive: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

