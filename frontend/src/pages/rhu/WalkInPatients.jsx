import { useState } from "react";
import {
  Activity,
  Eye,
  FilePlus2,
  HeartPulse,
  Plus,
  Search,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function WalkInPatients() {
  const [walkIns, setWalkIns] = useState([
    {
      id: "WI-2026-001",
      patient: "Pedro Ramos",
      ageSex: "39/M",
      visitType: "Consultation",
      chiefComplaint: "Fever and cough",
      specialization: "General Consultation",
      assignedDoctor: "Dr. Ana Reyes",
      dateOfVisit: "May 14, 2026",
      status: "Waiting",
    },
    {
      id: "WI-2026-002",
      patient: "Elena Cruz",
      ageSex: "27/F",
      visitType: "Prenatal Concern",
      chiefComplaint: "Dizziness",
      specialization: "Maternal Care",
      assignedDoctor: "Dr. Maria Santos",
      dateOfVisit: "May 14, 2026",
      status: "In Consultation",
    },
    {
      id: "WI-2026-003",
      patient: "Mark Santos",
      ageSex: "8/M",
      visitType: "Child Health Check-up",
      chiefComplaint: "Follow-up check-up",
      specialization: "Pediatrics",
      assignedDoctor: "Dr. Jose Cruz",
      dateOfVisit: "May 14, 2026",
      status: "For Monitoring",
    },
    {
      id: "WI-2026-004",
      patient: "Linda Reyes",
      ageSex: "63/F",
      visitType: "Senior Citizen Check-up",
      chiefComplaint: "Blood pressure monitoring",
      specialization: "Senior Citizen Care",
      assignedDoctor: "Dr. Ana Reyes",
      dateOfVisit: "May 13, 2026",
      status: "Completed",
    },
  ]);

  function updateStatus(id, newStatus) {
    setWalkIns((prev) =>
      prev.map((patient) =>
        patient.id === id ? { ...patient, status: newStatus } : patient,
      ),
    );
  }

  const waitingCount = walkIns.filter(
    (item) => item.status === "Waiting",
  ).length;
  const consultationCount = walkIns.filter(
    (item) => item.status === "In Consultation",
  ).length;
  const monitoringCount = walkIns.filter(
    (item) => item.status === "For Monitoring",
  ).length;
  const completedCount = walkIns.filter(
    (item) => item.status === "Completed",
  ).length;

  return (
    <DashboardLayout role="rhu" title="Walk-in Patients">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Walk-in Patients
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Manage RHU patients who visited directly without BHC referral.
          </p>
        </div>

        <Link
          to="/rhu/walk-in-patients/add"
          className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#092347]"
        >
          <Plus size={15} />
          Add Walk-in Patient
        </Link>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Waiting"
          value={waitingCount}
          icon={<Users size={17} />}
          color="slate"
        />
        <StatCard
          title="In Consultation"
          value={consultationCount}
          icon={<Stethoscope size={17} />}
          color="blue"
        />
        <StatCard
          title="For Monitoring"
          value={monitoringCount}
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="Completed"
          value={completedCount}
          icon={<UserCheck size={17} />}
          color="green"
        />
      </div>

      <div className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Patient
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search walk-in patient..."
              />
            </div>
          </div>

          <FilterSelect label="Visit Type">
            <option>All Visit Types</option>
            <option>Consultation</option>
            <option>Prenatal Concern</option>
            <option>Child Health Check-up</option>
            <option>Senior Citizen Check-up</option>
            <option>Follow-up</option>
          </FilterSelect>

          <FilterSelect label="Specialization">
            <option>All Specializations</option>
            <option>General Consultation</option>
            <option>Maternal Care</option>
            <option>Pediatrics</option>
            <option>Senior Citizen Care</option>
          </FilterSelect>

          <FilterSelect label="Status">
            <option>All Status</option>
            <option>Waiting</option>
            <option>In Consultation</option>
            <option>For Monitoring</option>
            <option>Completed</option>
            <option>Referred to Hospital</option>
            <option>Cancelled</option>
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Walk-in Patient Queue
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Separate process from BHC-to-RHU referrals.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {walkIns.length} records
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Walk-in ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Visit Type</th>
                <th className="px-4 py-3">Chief Complaint</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3">Assigned Doctor</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {walkIns.map((patient) => (
                <tr
                  key={patient.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0B2E59]">
                      {patient.id}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      {patient.patient}
                    </p>
                    <p className="text-[10px] text-[#9CA3AF]">
                      {patient.ageSex}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.visitType}
                  </td>

                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.chiefComplaint}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <SpecializationBadge label={patient.specialization} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.assignedDoctor}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                    {patient.dateOfVisit}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={patient.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <Eye size={14} />
                      </button>

                      {patient.status === "Waiting" && (
                        <button
                          onClick={() =>
                            updateStatus(patient.id, "In Consultation")
                          }
                          className="rounded-lg bg-[#0B2E59] px-3 py-2 text-xs font-semibold text-white hover:bg-[#092347]"
                        >
                          Start
                        </button>
                      )}

                      {patient.status === "In Consultation" && (
                        <button
                          onClick={() =>
                            updateStatus(patient.id, "For Monitoring")
                          }
                          className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Monitor
                        </button>
                      )}

                      {patient.status === "For Monitoring" && (
                        <button
                          onClick={() => updateStatus(patient.id, "Completed")}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Complete
                        </button>
                      )}

                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <FilePlus2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span> Walk-in
          patients are RHU direct visits. They are separate from BHC referral
          records but may still be added to patient monitoring when needed.
        </p>
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
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    slate: "border-t-slate-400 text-slate-600 bg-slate-100",
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

function StatusBadge({ status }) {
  const map = {
    Waiting: "bg-slate-100 text-slate-600",
    "In Consultation": "bg-blue-50 text-blue-700",
    "For Monitoring": "bg-amber-50 text-amber-700",
    Completed: "bg-emerald-50 text-emerald-700",
    "Referred to Hospital": "bg-purple-50 text-purple-700",
    Cancelled: "bg-red-50 text-red-700",
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

function SpecializationBadge({ label }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      {label}
    </span>
  );
}
