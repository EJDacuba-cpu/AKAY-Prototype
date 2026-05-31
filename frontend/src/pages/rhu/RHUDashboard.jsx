import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Package,
  QrCode,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getRhuPatientVolume,
  getRhuPatientVolumeUpdatedTime,
  saveRhuPatientVolume,
} from "../../services/volumeService";
import {
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulseLive {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.45; transform: scale(1.6); }
  }

  .anim-fade-up {
    opacity: 0;
    animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .anim-count {
    animation: countUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .pulse-live {
    animation: pulseLive 2s ease-in-out infinite;
  }
`;

const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

const incomingReferrals = [
  {
    trackingId: "AKY-2026-001",
    patient: "Juan Reyes",
    bhc: "Pitpitan Health Center",
    category: "B1",
    priority: "Medium",
    status: "Pending",
  },
  {
    trackingId: "AKY-2026-002",
    patient: "Maria Rosa",
    bhc: "Pitpitan Health Center",
    category: "C2",
    priority: "High",
    status: "Received",
  },
  {
    trackingId: "AKY-2026-005",
    patient: "Antonio Santos",
    bhc: "Taliptip Health Center",
    category: "B1",
    priority: "Medium",
    status: "For Monitoring",
  },
];

const monitoringPatients = [
  {
    patient: "Maria Rosa",
    source: "Referral",
    category: "Pregnant Patient",
    status: "For Monitoring",
  },
  {
    patient: "Juan Reyes",
    source: "Referral",
    category: "Senior Citizen",
    status: "Follow-up Required",
  },
  {
    patient: "Pedro Ramos",
    source: "Walk-in",
    category: "General Consultation",
    status: "Under Observation",
  },
];

export default function RHUDashboard() {
  return (
    <DashboardLayout role="rhu" title="Dashboard">
      <style>{keyframes}</style>

      {/* Header */}
      <div
        className="anim-fade-up mb-8 flex items-center gap-3.5"
        style={stagger(0)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <Activity size={20} />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            RHU Dashboard Overview
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Summary of incoming referrals, walk-in patients, monitoring cases,
            doctor schedule, and medicine alerts.
          </p>
        </div>
      </div>

      {/* Analytics */}
      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Incoming Referrals Today"
          value="14"
          subtitle="New BHC-to-RHU referrals"
          icon={<ClipboardList size={17} />}
          color="navy"
          delay={1}
        />

        <StatCard
          title="High Priority Referrals"
          value="4"
          subtitle="Needs urgent review"
          icon={<AlertTriangle size={17} />}
          color="red"
          delay={2}
        />

        <StatCard
          title="Walk-in Patients Today"
          value="18"
          subtitle="Direct RHU visits"
          icon={<Users size={17} />}
          color="blue"
          delay={3}
        />

        <StatCard
          title="Patients for Monitoring"
          value="9"
          subtitle="For observation or follow-up"
          icon={<HeartPulse size={17} />}
          color="amber"
          delay={4}
        />
      </div>

      {/* Main Layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left/Main Column */}
        <div className="min-w-0 space-y-6">
          <PatientVolumeControl delay={5} />

          <SectionCard
            title="Incoming Referral Queue"
            subtitle="Recently submitted BHC-to-RHU referrals awaiting RHU action."
            count={incomingReferrals.length}
            linkTo="/rhu/incoming-referrals"
            icon={<ClipboardList size={14} />}
            delay={6}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    <th className="px-6 py-3">Tracking ID</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Referring BHC</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#F8FAFC]">
                  {incomingReferrals.map((referral) => (
                    <tr
                      key={referral.trackingId}
                      className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#0B2E59] transition-colors duration-200 group-hover:border-[#DBEAFE] group-hover:bg-[#EFF6FF]">
                          {referral.trackingId}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-[13px] font-semibold text-[#1A1A1A]">
                        {referral.patient}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#6B7280]">
                        {referral.bhc}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <CategoryBadge category={referral.category} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <PriorityBadge priority={referral.priority} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge status={referral.status} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <Link
                          to="/rhu/incoming-referrals"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#0B2E59] transition-all duration-200 hover:bg-[#0B2E59]/[0.06] active:scale-[0.96]"
                        >
                          Review
                          <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Patients for Monitoring"
            subtitle="Patients requiring observation, follow-up, or continued monitoring."
            count={monitoringPatients.length}
            linkTo="/rhu/patient-monitoring"
            icon={<HeartPulse size={14} />}
            delay={7}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    <th className="px-6 py-3">Patient</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#F8FAFC]">
                  {monitoringPatients.map((item) => (
                    <tr
                      key={item.patient}
                      className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={item.patient} />
                          <span className="text-[13px] font-semibold text-[#1A1A1A]">
                            {item.patient}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <SourceBadge source={item.source} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#6B7280]">
                        {item.category}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <Link
                          to="/rhu/patient-monitoring"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#0B2E59] transition-all duration-200 hover:bg-[#0B2E59]/[0.06] active:scale-[0.96]"
                        >
                          Monitor
                          <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Right Sidebar */}
        <aside className="space-y-6">
          <WorkflowPanel delay={8} />

          <DoctorScheduleCard delay={13} />

          <MedicineAlertCard delay={14} />
        </aside>
      </div>
    </DashboardLayout>
  );
}

/* ─── Patient Volume Control ─── */
function PatientVolumeControl({ delay = 0 }) {
  const volumeMap = {
    Low: {
      percent: "18%",
      statusColor: "emerald",
      title: "Low",
      description: "Low patient volume. RHU receiving is open.",
      waitingLevel: "Low",
      receiving: "Open",
      bar: "from-emerald-400 to-emerald-500",
      box: "border-emerald-100 bg-emerald-50/60",
      icon: "bg-emerald-100 text-emerald-700",
      badge: "bg-emerald-50 text-emerald-700",
    },
    Normal: {
      percent: "38%",
      statusColor: "emerald",
      title: "Normal",
      description: "Standard waiting time. RHU patient flow is manageable.",
      waitingLevel: "Normal",
      receiving: "Open",
      bar: "from-emerald-400 to-emerald-500",
      box: "border-emerald-100 bg-emerald-50/60",
      icon: "bg-emerald-100 text-emerald-700",
      badge: "bg-emerald-50 text-emerald-700",
    },
    High: {
      percent: "82%",
      statusColor: "amber",
      title: "High",
      description:
        "High patient volume. Expect longer waiting time for non-urgent referrals.",
      waitingLevel: "High",
      receiving: "Limited",
      bar: "from-amber-400 to-amber-500",
      box: "border-amber-100 bg-amber-50/60",
      icon: "bg-amber-100 text-amber-700",
      badge: "bg-amber-50 text-amber-700",
    },
  };

  const [volume, setVolume] = useState("Normal");
  const [lastUpdated, setLastUpdated] = useState("Not updated yet");

  useEffect(() => {
    const savedVolume = getRhuPatientVolume();
    const savedUpdatedTime = getRhuPatientVolumeUpdatedTime("Not updated yet");

    if (savedVolume && volumeMap[savedVolume]) {
      setVolume(savedVolume);
    }

    if (savedUpdatedTime) {
      setLastUpdated(savedUpdatedTime);
    }
  }, []);

  function handleVolumeChange(nextVolume) {
    const updateTime = new Date().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    setVolume(nextVolume);
    setLastUpdated(updateTime);

    saveRhuPatientVolume(nextVolume, updateTime);

    window.dispatchEvent(new Event("akay-rhu-volume-updated"));
  }

  const selected = volumeMap[volume] || volumeMap.Normal;

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <div className="border-b border-[#F3F4F6] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              RHU Patient Volume Indicator
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              RHU staff can update this indicator so BHCs can view patient
              volume before sending referrals.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold ${selected.badge}`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`pulse-live absolute inline-flex h-full w-full rounded-full ${
                  selected.statusColor === "amber"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  selected.statusColor === "amber"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
            </span>
            Live
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-6 lg:grid-cols-[240px_1fr]">
        <div className={`rounded-xl border p-5 ${selected.box}`}>
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${selected.icon}`}>
              <HeartPulse size={20} />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
                Current Volume
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-[#0B2E59]">
                {selected.title}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#4B5563]">
            {selected.description}
          </p>

          <p className="mt-3 text-[10px] font-semibold text-[#9CA3AF]">
            Last updated: {lastUpdated}
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-[#4B5563]">
              Set patient volume
            </p>
            <p className="text-[10px] font-medium text-[#9CA3AF]">
              Visible to BHC users
            </p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {["Low", "Normal", "High"].map((option) => {
              const active = volume === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleVolumeChange(option)}
                  className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-all active:scale-[0.98] ${
                    active
                      ? "border-[#0B2E59] bg-[#0B2E59] text-white shadow-md shadow-[#0B2E59]/15"
                      : "border-[#E8ECF0] bg-white text-[#6B7280] hover:border-[#D1D5DB] hover:text-[#0B2E59]"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="h-2.5 overflow-hidden rounded-full bg-[#E8ECF0]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${selected.bar} transition-all duration-500`}
              style={{ width: selected.percent }}
            />
          </div>

          <div className="mt-2 flex justify-between text-[10px] font-semibold text-[#BCC3CD]">
            <span>Low</span>
            <span>Normal</span>
            <span>High</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <VolumeMini label="Waiting level" value={selected.waitingLevel} />
            <VolumeMini label="Referral receiving" value={selected.receiving} />
            <VolumeMini label="Updated by" value="RHU" />
          </div>
        </div>
      </div>
    </section>
  );
}

function VolumeMini({ label, value }) {
  return (
    <div className="rounded-lg bg-white px-3 py-3">
      <p className="text-[10px] font-medium text-[#9CA3AF]">{label}</p>
      <p className="mt-1 text-xs font-bold text-[#0B2E59]">{value}</p>
    </div>
  );
}

/* ─── RHU Workflow Panel ─── */
function WorkflowPanel({ delay = 0 }) {
  return (
    <section
      className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            RHU Workflow Shortcuts
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Common tasks for RHU personnel.
          </p>
        </div>

        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
          Today
        </span>
      </div>

      <div className="space-y-3">
        <WorkflowShortcut
          href="/rhu/qr-scanner"
          icon={<QrCode size={17} />}
          label="Patient Arrival"
          title="Scan Referral QR"
          description="Retrieve referral using QR or Tracking ID."
          color="navy"
        />

        <WorkflowShortcut
          href="/rhu/incoming-referrals"
          icon={<ClipboardList size={17} />}
          label="Referral Queue"
          title="Review Incoming"
          description="Check pending and high-priority referrals."
          color="blue"
        />

        <WorkflowShortcut
          href="/rhu/patients/add"
          icon={<UserPlus size={17} />}
          label="Direct Visit"
          title="Add Walk-in Patient"
          description="Record patients who visited RHU directly."
          color="amber"
        />

        <WorkflowShortcut
          href="/rhu/feedback"
          icon={<FileText size={17} />}
          label="Return Slip"
          title="Submit Feedback"
          description="Encode RHU feedback for BHC referral cases."
          color="slate"
        />
      </div>
    </section>
  );
}

function WorkflowShortcut({
  href,
  icon,
  label,
  title,
  description,
  color = "navy",
}) {
  const map = {
    navy: {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      labelBg: "#EFF6FF",
      labelColor: "#2563EB",
    },
    blue: {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      labelBg: "#EFF6FF",
      labelColor: "#2563EB",
    },
    amber: {
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      labelBg: "#FFFBEB",
      labelColor: "#D97706",
    },
    slate: {
      iconBg: "#F8FAFC",
      iconColor: "#64748B",
      labelBg: "#F8FAFC",
      labelColor: "#64748B",
    },
  };

  const c = map[color] || map.navy;

  return (
    <Link
      to={href}
      className="group block rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:bg-white hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: c.iconBg, color: c.iconColor }}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[9px] font-bold"
              style={{ backgroundColor: c.labelBg, color: c.labelColor }}
            >
              {label}
            </span>

            <ArrowRight
              size={13}
              className="flex-shrink-0 text-[#0B2E59] transition-transform group-hover:translate-x-1"
            />
          </div>

          <p className="text-xs font-bold text-[#0B2E59]">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

/* ─── Section Card ─── */
function SectionCard({
  title,
  subtitle,
  count,
  linkTo,
  icon,
  children,
  delay = 0,
}) {
  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02] transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.03]"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#F3F4F6] px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              {icon}
            </div>

            <h2 className="text-sm font-semibold text-[#0B2E59]">{title}</h2>

            <span className="rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#6B7280]">
              {count}
            </span>
          </div>

          <p className="mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>
        </div>

        <Link
          to={linkTo}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F3F4F6] px-3 py-1.5 text-[11px] font-semibold text-[#0B2E59] transition-all duration-200 hover:bg-[#EFF6FF] hover:text-[#2563EB] active:scale-[0.96]"
        >
          View All
          <ArrowRight size={12} />
        </Link>
      </div>

      {children}
    </section>
  );
}

/* ─── Sidebar Cards ─── */
function DoctorScheduleCard({ delay = 0 }) {
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  const doctors = Array.isArray(doctorAvailability.doctors)
    ? doctorAvailability.doctors
    : [];

  return (
    <section
      className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm shadow-black/[0.02] transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.03]"
      style={stagger(delay)}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#0B2E59]">
            Doctor Availability
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            RHU-managed doctor availability records.
          </p>
        </div>

        <div className="rounded-lg bg-[#EFF6FF] p-2 text-[#2563EB]">
          <CalendarDays size={16} />
        </div>
      </div>

      <div className="space-y-3">
        {doctors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#F3F4F6] bg-[#FAFBFC] p-4 text-xs text-[#9CA3AF]">
            No doctors encoded yet.
          </div>
        ) : doctors.map((doctor) => (
          <div
            key={doctor.doctorId || doctor.id}
            className="rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-4 transition-all duration-200 hover:border-[#DBEAFE] hover:bg-white hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#EFF6FF] p-2 text-[#2563EB]">
                <Stethoscope size={14} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#0B2E59]">
                  {doctor.doctorName || doctor.name}
                </p>

                <p className="mt-1 text-[11px] text-[#6B7280]">
                  {doctor.doctorType || doctor.role}
                </p>

                {doctor.availabilityNote && (
                  <p className="mt-1 text-[10px] text-[#9CA3AF]">
                    {doctor.availabilityNote}
                  </p>
                )}

                <div className="mt-2">
                  <DoctorBadge
                    status={doctor.availabilityStatus || doctor.status}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/rhu/doctor-schedule"
        className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#092347] hover:shadow-lg hover:shadow-[#0B2E59]/25 active:scale-[0.98]"
      >
        Manage Availability
        <ArrowRight size={13} />
      </Link>
    </section>
  );
}

function MedicineAlertCard({ delay = 0 }) {
  return (
    <section
      className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm shadow-black/[0.02] transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.03]"
      style={stagger(delay)}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#0B2E59]">Medicine Alerts</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Referral-related stock notices.
          </p>
        </div>

        <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600">
          <AlertTriangle size={10} />3 alerts
        </span>
      </div>

      <div className="space-y-2.5">
        <MedicineAlert item="Amoxicillin" status="Low Stock" />
        <MedicineAlert item="Tetanus Vaccine" status="Unavailable" />
        <MedicineAlert item="Syringe" status="Low Stock" />
      </div>

      <Link
        to="/rhu/medicine-management"
        className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0B2E59] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F9FAFB] hover:shadow-md active:scale-[0.98]"
      >
        Manage Medicine Availability
        <ArrowRight size={13} />
      </Link>
    </section>
  );
}

/* ─── Small Components ─── */
function StatCard({ title, value, subtitle, icon, color = "navy", delay = 0 }) {
  const map = {
    navy: { border: "#0B2E59", iconBg: "#EFF6FF", iconColor: "#2563EB" },
    blue: { border: "#2563EB", iconBg: "#EFF6FF", iconColor: "#2563EB" },
    amber: { border: "#D97706", iconBg: "#FFFBEB", iconColor: "#D97706" },
    red: { border: "#DC2626", iconBg: "#FEF2F2", iconColor: "#DC2626" },
  };

  const c = map[color] || map.navy;

  return (
    <div
      className="anim-fade-up group relative overflow-hidden rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.04]"
      style={{ borderTopColor: c.border, ...stagger(delay) }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${c.iconBg} 0%, transparent 50%)`,
        }}
      />

      <div className="relative flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div
          className="rounded-lg p-2.5 transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: c.iconBg, color: c.iconColor }}
        >
          {icon}
        </div>
      </div>

      <p
        className="anim-count relative mt-4 text-2xl font-bold leading-none tracking-tight text-[#0B2E59]"
        style={stagger(delay + 2)}
      >
        {value}
      </p>

      <p className="relative mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>
    </div>
  );
}

function Avatar({ name }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F4F6] text-[10px] font-bold text-[#4B5563]">
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending: { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8" },
    Received: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    "Follow-up Required": { bg: "#FEFCE8", text: "#A16207", dot: "#EAB308" },
    "Under Observation": { bg: "#F5F3FF", text: "#6D28D9", dot: "#8B5CF6" },
    Completed: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
  };

  const s = map[status] || map.Pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    High: { bg: "#FEF2F2", text: "#B91C1C", dot: "#EF4444" },
    Medium: { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    Normal: { bg: "#F8FAFC", text: "#475569", dot: "#10B981" },
  };

  const s = map[priority] || map.Normal;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {priority}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="inline-block rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 font-mono text-[10px] font-bold text-blue-700">
      {category}
    </span>
  );
}

function SourceBadge({ source }) {
  const map = {
    Referral: "bg-blue-50 text-blue-700",
    "Walk-in": "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-block rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
        map[source] || "bg-slate-100 text-slate-600"
      }`}
    >
      {source}
    </span>
  );
}

function DoctorBadge({ status }) {
  const map = {
    Available: "bg-emerald-50 text-emerald-700",
    "On Duty": "bg-blue-50 text-blue-700",
    "Fully Booked": "bg-amber-50 text-amber-700",
    "Not Available": "bg-slate-100 text-slate-600",
    "On Leave": "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function MedicineAlert({ item, status }) {
  const danger = status === "Unavailable";

  return (
    <div
      className="group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 hover:shadow-sm"
      style={{
        borderColor: danger ? "#FECACA" : "#FDE68A",
        background: danger
          ? "linear-gradient(135deg, #FEF2F2 0%, #FFF 100%)"
          : "linear-gradient(135deg, #FFFBEB 0%, #FFF 100%)",
      }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
        style={{
          backgroundColor: danger ? "#FEE2E2" : "#FEF3C7",
          color: danger ? "#DC2626" : "#D97706",
        }}
      >
        <Package size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[#1A1A1A]">
          {item}
        </p>

        <p className="text-[10px] text-[#9CA3AF]">
          {danger ? "0 remaining" : "Requires restock review"}
        </p>
      </div>

      <span
        className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold"
        style={{
          backgroundColor: danger ? "#FEE2E2" : "#FEF3C7",
          color: danger ? "#DC2626" : "#D97706",
        }}
      >
        {status}
      </span>
    </div>
  );
}


