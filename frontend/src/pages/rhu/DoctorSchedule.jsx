import { useState } from "react";
import {
  CalendarDays,
  Clock,
  Search,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function DoctorSchedule() {
  const [doctors, setDoctors] = useState([
    {
      id: "DOC-001",
      name: "Dr. Maria Santos",
      specialization: "Maternal Care",
      expertise: "Prenatal and pregnancy-related cases",
      day: "Monday",
      time: "8:00 AM - 12:00 PM",
      room: "Consultation Room 1",
      status: "Available",
    },
    {
      id: "DOC-002",
      name: "Dr. Jose Cruz",
      specialization: "Pediatrics",
      expertise: "Child health check-up and pediatric consultation",
      day: "Monday",
      time: "1:00 PM - 5:00 PM",
      room: "Consultation Room 2",
      status: "On Duty",
    },
    {
      id: "DOC-003",
      name: "Dr. Ana Reyes",
      specialization: "General Consultation",
      expertise: "General RHU consultation and walk-in assessment",
      day: "Tuesday",
      time: "8:00 AM - 5:00 PM",
      room: "Consultation Room 3",
      status: "Fully Booked",
    },
    {
      id: "DOC-004",
      name: "Dr. Carlo Mendoza",
      specialization: "Senior Citizen Care",
      expertise: "Hypertension, follow-up, and elderly patient monitoring",
      day: "Wednesday",
      time: "8:00 AM - 12:00 PM",
      room: "Consultation Room 1",
      status: "Available",
    },
  ]);

  function updateStatus(id, newStatus) {
    setDoctors((prev) =>
      prev.map((doctor) =>
        doctor.id === id ? { ...doctor, status: newStatus } : doctor,
      ),
    );
  }

  const availableCount = doctors.filter(
    (doctor) => doctor.status === "Available",
  ).length;

  const onDutyCount = doctors.filter(
    (doctor) => doctor.status === "On Duty",
  ).length;

  const fullyBookedCount = doctors.filter(
    (doctor) => doctor.status === "Fully Booked",
  ).length;

  const totalDoctors = doctors.length;

  return (
    <DashboardLayout role="rhu" title="Doctor Schedule">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          Doctor Schedule
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          View doctor availability, specialization, and expertise for referral
          and walk-in patient coordination.
        </p>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Doctors"
          value={totalDoctors}
          icon={<Users size={17} />}
          color="navy"
        />
        <StatCard
          title="Available"
          value={availableCount}
          icon={<UserCheck size={17} />}
          color="green"
        />
        <StatCard
          title="On Duty"
          value={onDutyCount}
          icon={<Stethoscope size={17} />}
          color="blue"
        />
        <StatCard
          title="Fully Booked"
          value={fullyBookedCount}
          icon={<Clock size={17} />}
          color="amber"
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
                placeholder="Search doctor..."
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

          <FilterSelect label="Day">
            <option>All Days</option>
            <option>Monday</option>
            <option>Tuesday</option>
            <option>Wednesday</option>
            <option>Thursday</option>
            <option>Friday</option>
          </FilterSelect>

          <FilterSelect label="Status">
            <option>All Status</option>
            <option>Available</option>
            <option>On Duty</option>
            <option>Fully Booked</option>
            <option>Not Available</option>
            <option>On Leave</option>
          </FilterSelect>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Doctor Schedule List
              </h2>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Used for matching referrals with the right doctor
                specialization.
              </p>
            </div>

            <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
              {doctors.length} doctors
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <th className="px-6 py-3">Doctor ID</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Specialization</th>
                  <th className="px-4 py-3">Expertise</th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Room</th>
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

                    <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                      {doctor.name}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5">
                      <SpecializationBadge label={doctor.specialization} />
                    </td>

                    <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                      {doctor.expertise}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                      {doctor.day}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                      {doctor.time}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                      {doctor.room}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusBadge status={doctor.status} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => updateStatus(doctor.id, "Available")}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Available
                        </button>

                        <button
                          onClick={() =>
                            updateStatus(doctor.id, "Fully Booked")
                          }
                          className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Full
                        </button>

                        <button
                          onClick={() => updateStatus(doctor.id, "On Leave")}
                          className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Leave
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
                <CalendarDays size={20} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Today’s Schedule
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Quick view for RHU staff.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {doctors.slice(0, 3).map((doctor) => (
                <div
                  key={doctor.id}
                  className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-4"
                >
                  <p className="text-sm font-semibold text-[#0B2E59]">
                    {doctor.name}
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {doctor.specialization}
                  </p>
                  <p className="mt-1 text-xs text-[#9CA3AF]">{doctor.time}</p>

                  <div className="mt-3">
                    <StatusBadge status={doctor.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#0B2E59]">Note:</span> Doctor
              schedules help RHU staff prioritize referrals based on category
              and specialization. The system may suggest a specialization, but
              RHU staff still make the final decision.
            </p>
          </section>
        </aside>
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
    Available: "bg-emerald-50 text-emerald-700",
    "On Duty": "bg-blue-50 text-blue-700",
    "Fully Booked": "bg-amber-50 text-amber-700",
    "Not Available": "bg-slate-100 text-slate-600",
    "On Leave": "bg-red-50 text-red-700",
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

