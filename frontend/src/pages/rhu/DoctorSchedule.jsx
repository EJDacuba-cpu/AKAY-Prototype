import { useState, useMemo } from "react";
import {
  CalendarDays,
  Clock,
  Search,
  Stethoscope,
  UserCheck,
  Users,
  RotateCcw,
  Activity,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

/* ─── Tab Configuration ─── */
const SCHEDULE_TABS = [
  { key: "", label: "All Doctors", icon: Users },
  { key: "Available", label: "Available", icon: UserCheck },
  { key: "On Duty", label: "On Duty", icon: Activity },
  { key: "Fully Booked", label: "Fully Booked", icon: Clock },
];

/* ─── Data ─── */
const initialDoctors = [
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
];

/* ─── Main Component ─── */
export default function DoctorSchedule() {
  const [doctors, setDoctors] = useState(initialDoctors);
  const [statusFilter, setStatusFilter] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    specialization: "All Specializations",
    day: "All Days",
  });

  function updateStatus(id, newStatus) {
    setDoctors((prev) =>
      prev.map((doctor) =>
        doctor.id === id ? { ...doctor, status: newStatus } : doctor,
      ),
    );
  }

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleTabChange = (statusKey) => {
    setStatusFilter(statusKey);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      specialization: "All Specializations",
      day: "All Days",
    });
    setStatusFilter("");
  };

  const hasActiveFilters =
    filters.search !== "" ||
    filters.specialization !== "All Specializations" ||
    filters.day !== "All Days" ||
    statusFilter !== "";

  // Base filter (Search, Spec, Day) - used for tab counts
  const baseFiltered = useMemo(() => {
    return doctors.filter((doctor) => {
      const matchesSearch =
        !filters.search ||
        doctor.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        doctor.id.toLowerCase().includes(filters.search.toLowerCase());
      const matchesSpec =
        filters.specialization === "All Specializations" ||
        doctor.specialization === filters.specialization;
      const matchesDay =
        filters.day === "All Days" || doctor.day === filters.day;
      return matchesSearch && matchesSpec && matchesDay;
    });
  }, [doctors, filters]);

  // Tab Counts
  const tabCounts = SCHEDULE_TABS.reduce((acc, tab) => {
    acc[tab.key] =
      tab.key === ""
        ? baseFiltered.length
        : baseFiltered.filter((d) => d.status === tab.key).length;
    return acc;
  }, {});

  // Fully filtered doctors (includes status tab filter)
  const filteredDoctors = useMemo(() => {
    return baseFiltered.filter(
      (doctor) => !statusFilter || doctor.status === statusFilter,
    );
  }, [baseFiltered, statusFilter]);

  // Today's Schedule (Mock logic for display: showing Monday)
  const todaySchedule = doctors.filter((d) => d.day === "Monday");

  return (
    <DashboardLayout role="rhu" title="Doctor Schedule">
      {/* ═══════════════════════════════════════════════════════════════
          TOP NAVIGATION: TABS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-6 flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] p-1">
        {SCHEDULE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
                isActive
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Icon size={13} className={isActive ? "text-[#0B2E59]" : ""} />
              {tab.label}
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                  isActive
                    ? "bg-[#0B2E59]/10 text-[#0B2E59]"
                    : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT: TABLE (LEFT) + SIDEBAR (RIGHT)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-start gap-6">
        {/* ── Left Table Content ── */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900">
                Doctor Schedule Registry
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Coordination and specialization matching for referrals
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              {filteredDoctors.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3">Doctor ID</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Specialization</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {filteredDoctors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-24 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <Users size={20} className="text-slate-400" />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-700">
                        No doctors found
                      </p>
                      <p className="mt-1 text-[11.5px] text-slate-400">
                        Try adjusting your search or filters
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredDoctors.map((doctor) => (
                    <tr
                      key={doctor.id}
                      className="group transition-colors hover:bg-slate-50/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-[#0B2E59]">
                          {doctor.id}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <p className="text-[12.5px] font-semibold text-slate-800">
                          {doctor.name}
                        </p>
                        <p className="text-[10.5px] text-slate-400">
                          {doctor.expertise}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <SpecializationBadge label={doctor.specialization} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          <CalendarDays size={11} className="text-slate-400" />
                          {doctor.day}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                          <Clock size={10} className="text-slate-300" />
                          {doctor.time}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge status={doctor.status} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => updateStatus(doctor.id, "Available")}
                            className="flex h-7 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            Available
                          </button>
                          <button
                            onClick={() =>
                              updateStatus(doctor.id, "Fully Booked")
                            }
                            className="flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                          >
                            Full
                          </button>
                          <button
                            onClick={() => updateStatus(doctor.id, "On Leave")}
                            className="flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100"
                          >
                            Leave
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right Filter Sidebar ── */}
        <aside className="w-[340px] shrink-0 space-y-5">
          {/* Filters Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-slate-900">
                Filters
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] font-medium text-[#0B2E59] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Search Doctor
                </label>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) =>
                      handleFilterChange("search", e.target.value)
                    }
                    placeholder="Name or ID..."
                    className="h-[34px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[12px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Specialization
                </label>
                <select
                  value={filters.specialization}
                  onChange={(e) =>
                    handleFilterChange("specialization", e.target.value)
                  }
                  className="h-[34px] w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-800 outline-none transition-colors focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Specializations</option>
                  <option>General Consultation</option>
                  <option>Maternal Care</option>
                  <option>Pediatrics</option>
                  <option>Senior Citizen Care</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Day
                </label>
                <select
                  value={filters.day}
                  onChange={(e) => handleFilterChange("day", e.target.value)}
                  className="h-[34px] w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-800 outline-none transition-colors focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Days</option>
                  <option>Monday</option>
                  <option>Tuesday</option>
                  <option>Wednesday</option>
                  <option>Thursday</option>
                  <option>Friday</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <RotateCcw size={11} />
                Reset All Filters
              </button>
            )}
          </div>

          {/* Today's Schedule Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <CalendarDays size={14} />
              </div>
              <div>
                <h2 className="text-[12px] font-bold text-slate-900">
                  Today's Schedule
                </h2>
                <p className="text-[10px] text-slate-400">
                  Quick view for RHU staff
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {todaySchedule.map((doctor) => (
                <div
                  key={doctor.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 transition-colors hover:border-slate-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-800">
                      {doctor.name}
                    </p>
                    <StatusBadge status={doctor.status} />
                  </div>
                  <p className="mt-1 text-[10.5px] font-medium text-blue-600">
                    {doctor.specialization}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
                    <Clock size={10} className="text-slate-400" />
                    {doctor.time}
                  </div>
                </div>
              ))}
              {todaySchedule.length === 0 && (
                <p className="py-4 text-center text-[11px] text-slate-400">
                  No doctors scheduled today.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}

/* ─── Sub-Components ─── */

function StatusBadge({ status }) {
  const map = {
    Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "On Duty": "bg-blue-50 text-blue-700 border-blue-200",
    "Fully Booked": "bg-amber-50 text-amber-700 border-amber-200",
    "Not Available": "bg-slate-100 text-slate-600 border-slate-200",
    "On Leave": "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[9.5px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

function SpecializationBadge({ label }) {
  const map = {
    "Maternal Care": "bg-pink-50 text-pink-700 border-pink-200",
    Pediatrics: "bg-violet-50 text-violet-700 border-violet-200",
    "General Consultation": "bg-blue-50 text-blue-700 border-blue-200",
    "Senior Citizen Care": "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[9.5px] font-semibold ${
        map[label] || "bg-slate-50 text-slate-700 border-slate-200"
      }`}
    >
      {label}
    </span>
  );
}
