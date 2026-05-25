import { useState } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Eye,
  HeartPulse,
  Search,
  Stethoscope,
  Users,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function PatientMonitoring() {
  const [patients, setPatients] = useState([
    {
      id: "MON-2026-001",
      patient: "Maria Rosa",
      ageSex: "31/F",
      source: "Referral",
      category: "Pregnant Patient",
      concern: "Pregnancy-related abdominal pain",
      assignedDoctor: "Dr. Maria Santos",
      nextFollowUp: "May 16, 2026",
      status: "For Monitoring",
    },
    {
      id: "MON-2026-002",
      patient: "Juan Reyes",
      ageSex: "31/M",
      source: "Referral",
      category: "Senior Citizen",
      concern: "Hypertension",
      assignedDoctor: "Dr. Ana Reyes",
      nextFollowUp: "May 17, 2026",
      status: "Follow-up Required",
    },
    {
      id: "MON-2026-003",
      patient: "Pedro Ramos",
      ageSex: "39/M",
      source: "Walk-in",
      category: "General Consultation",
      concern: "Fever and cough",
      assignedDoctor: "Dr. Ana Reyes",
      nextFollowUp: "May 18, 2026",
      status: "Under Observation",
    },
    {
      id: "MON-2026-004",
      patient: "Elena Cruz",
      ageSex: "27/F",
      source: "Walk-in",
      category: "Maternal Care",
      concern: "Dizziness",
      assignedDoctor: "Dr. Maria Santos",
      nextFollowUp: "May 19, 2026",
      status: "Completed",
    },
  ]);

  function updateStatus(id, newStatus) {
    setPatients((prev) =>
      prev.map((patient) =>
        patient.id === id ? { ...patient, status: newStatus } : patient,
      ),
    );
  }

  const monitoringCount = patients.filter(
    (item) => item.status === "For Monitoring",
  ).length;

  const followUpCount = patients.filter(
    (item) => item.status === "Follow-up Required",
  ).length;

  const observationCount = patients.filter(
    (item) => item.status === "Under Observation",
  ).length;

  const completedCount = patients.filter(
    (item) => item.status === "Completed",
  ).length;

  return (
    <DashboardLayout role="rhu" title="Patient Monitoring">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          Patient Monitoring
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Track RHU patients who require follow-up, observation, or continued
          monitoring.
        </p>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="For Monitoring"
          value={monitoringCount}
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="Follow-up Required"
          value={followUpCount}
          icon={<CalendarClock size={17} />}
          color="blue"
        />
        <StatCard
          title="Under Observation"
          value={observationCount}
          icon={<Activity size={17} />}
          color="purple"
        />
        <StatCard
          title="Completed"
          value={completedCount}
          icon={<CheckCircle2 size={17} />}
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
                placeholder="Search patient..."
              />
            </div>
          </div>

          <FilterSelect label="Source">
            <option>All Sources</option>
            <option>Referral</option>
            <option>Walk-in</option>
          </FilterSelect>

          <FilterSelect label="Category">
            <option>All Categories</option>
            <option>Pregnant Patient</option>
            <option>Senior Citizen</option>
            <option>General Consultation</option>
            <option>Maternal Care</option>
            <option>Pediatrics</option>
          </FilterSelect>

          <FilterSelect label="Status">
            <option>All Status</option>
            <option>For Monitoring</option>
            <option>Follow-up Required</option>
            <option>Under Observation</option>
            <option>Completed</option>
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Monitoring List
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Patients from referrals and walk-in visits that need continued
              care.
            </p>
          </div>

          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            {patients.length} records
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Monitoring ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Concern</th>
                <th className="px-4 py-3">Assigned Doctor</th>
                <th className="px-4 py-3">Next Follow-up</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {patients.map((patient) => (
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

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <SourceBadge source={patient.source} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.category}
                  </td>

                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.concern}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {patient.assignedDoctor}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                    {patient.nextFollowUp}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={patient.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-xs font-semibold text-[#0B2E59] hover:bg-[#F9FAFB]">
                        <Eye size={14} />
                      </button>

                      {patient.status !== "Completed" && (
                        <button
                          onClick={() => updateStatus(patient.id, "Completed")}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Complete
                        </button>
                      )}

                      {patient.status === "For Monitoring" && (
                        <button
                          onClick={() =>
                            updateStatus(patient.id, "Follow-up Required")
                          }
                          className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Follow-up
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
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span> Patient
          monitoring is used for RHU follow-up and observation. It can include
          both BHC referral patients and RHU walk-in patients.
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
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    purple: "border-t-purple-400 text-purple-700 bg-purple-50",
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
    "For Monitoring": "bg-amber-50 text-amber-700",
    "Follow-up Required": "bg-blue-50 text-blue-700",
    "Under Observation": "bg-purple-50 text-purple-700",
    Completed: "bg-emerald-50 text-emerald-700",
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

function SourceBadge({ source }) {
  const map = {
    Referral: "bg-blue-50 text-blue-700",
    "Walk-in": "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[source] || "bg-slate-100 text-slate-600"
      }`}
    >
      {source}
    </span>
  );
}
