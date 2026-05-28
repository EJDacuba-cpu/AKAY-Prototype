import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  User,
  Stethoscope,
  HeartPulse,
  ArrowLeft,
  Save,
  Send,
  Search,
  AlertCircle,
  Syringe,
  Check,
  Baby,
  Lock,
  Clock,
  X,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import healthRecordService, {
  getRhuHealthRecords,
} from "../../services/healthRecordService";
import { getPatientDetailsList } from "../../services/patientService";
import { getCurrentUser } from "../../utils/auth";

/* ═══════════════════════════════════════════════════════════════
   KEYFRAMES
   ═══════════════════════════════════════════════════════════════ */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes subtlePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    50%      { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.08); }
  }
  .anim-fade-up    { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-pulse-next { animation: subtlePulse 2.2s ease-in-out infinite; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ═══════════════════════════════════════════════════════════════
   IMMUNIZATION — CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
const VACCINE_FIELDS = [
  "bcg_vaccine",
  "hepb_birth",
  "pentavalent_dose1",
  "pentavalent_dose2",
  "pentavalent_dose3",
  "opv_dose1",
  "opv_dose2",
  "opv_dose3",
  "ipv_dose1",
  "ipv_dose2",
  "pcv_dose1",
  "pcv_dose2",
  "pcv_dose3",
  "mmr_dose1",
  "mmr_dose2",
];

const VACCINE_SERIES = {
  pentavalent: ["pentavalent_dose1", "pentavalent_dose2", "pentavalent_dose3"],
  opv: ["opv_dose1", "opv_dose2", "opv_dose3"],
  pcv: ["pcv_dose1", "pcv_dose2", "pcv_dose3"],
  ipv: ["ipv_dose1", "ipv_dose2"],
  mmr: ["mmr_dose1", "mmr_dose2"],
};

const VACCINE_TIMELINE = [
  {
    id: "birth",
    label: "At Birth",
    sublabel: "0 weeks",
    order: 0,
    vaccines: [
      {
        field: "bcg_vaccine",
        label: "BCG Vaccine",
        series: null,
        doseIndex: -1,
      },
      {
        field: "hepb_birth",
        label: "Hep B Birth Dose",
        series: null,
        doseIndex: -1,
      },
    ],
  },
  {
    id: "week6",
    label: "6 Weeks",
    sublabel: "1.5 months",
    order: 1,
    vaccines: [
      {
        field: "pentavalent_dose1",
        label: "Pentavalent Dose 1",
        series: "pentavalent",
        doseIndex: 0,
      },
      { field: "opv_dose1", label: "OPV Dose 1", series: "opv", doseIndex: 0 },
      { field: "pcv_dose1", label: "PCV Dose 1", series: "pcv", doseIndex: 0 },
      { field: "ipv_dose1", label: "IPV Dose 1", series: "ipv", doseIndex: 0 },
    ],
  },
  {
    id: "week10",
    label: "10 Weeks",
    sublabel: "2.5 months",
    order: 2,
    vaccines: [
      {
        field: "pentavalent_dose2",
        label: "Pentavalent Dose 2",
        series: "pentavalent",
        doseIndex: 1,
      },
      { field: "opv_dose2", label: "OPV Dose 2", series: "opv", doseIndex: 1 },
      { field: "pcv_dose2", label: "PCV Dose 2", series: "pcv", doseIndex: 1 },
    ],
  },
  {
    id: "week14",
    label: "14 Weeks",
    sublabel: "3.5 months",
    order: 3,
    vaccines: [
      {
        field: "pentavalent_dose3",
        label: "Pentavalent Dose 3",
        series: "pentavalent",
        doseIndex: 2,
      },
      { field: "opv_dose3", label: "OPV Dose 3", series: "opv", doseIndex: 2 },
      { field: "pcv_dose3", label: "PCV Dose 3", series: "pcv", doseIndex: 2 },
      { field: "ipv_dose2", label: "IPV Dose 2", series: "ipv", doseIndex: 1 },
    ],
  },
  {
    id: "month9",
    label: "9 Months",
    sublabel: "36 weeks",
    order: 4,
    vaccines: [
      { field: "mmr_dose1", label: "MMR Dose 1", series: "mmr", doseIndex: 0 },
    ],
  },
  {
    id: "month12",
    label: "12–15 Months",
    sublabel: "Catch-up",
    order: 5,
    vaccines: [
      { field: "mmr_dose2", label: "MMR Dose 2", series: "mmr", doseIndex: 1 },
    ],
  },
];

const VACCINE_LABELS = {};
VACCINE_TIMELINE.forEach((g) =>
  g.vaccines.forEach((v) => {
    VACCINE_LABELS[v.field] = v.label;
  }),
);

function isVaccineEligible(field, data) {
  for (const seriesFields of Object.values(VACCINE_SERIES)) {
    const idx = seriesFields.indexOf(field);
    if (idx === -1) continue;
    return seriesFields.slice(0, idx).every((f) => data[f]);
  }
  return true;
}

function getTimelineOrder(field) {
  for (let g = 0; g < VACCINE_TIMELINE.length; g++) {
    for (let v = 0; v < VACCINE_TIMELINE[g].vaccines.length; v++) {
      if (VACCINE_TIMELINE[g].vaccines[v].field === field) return g * 100 + v;
    }
  }
  return -1;
}

function getVaccineStatus(field, data) {
  if (data[field]) return "administered";
  if (!isVaccineEligible(field, data)) return "locked";
  const thisOrder = getTimelineOrder(field);
  const hasLaterChecked = VACCINE_TIMELINE.some((g) =>
    g.vaccines.some(
      (v) => getTimelineOrder(v.field) > thisOrder && data[v.field],
    ),
  );
  return hasLaterChecked ? "behind" : "upcoming";
}

function getTimelineNodeStatus(group, data) {
  const statuses = group.vaccines.map((v) => getVaccineStatus(v.field, data));
  if (statuses.every((s) => s === "administered")) return "completed";
  if (statuses.some((s) => s === "administered")) return "in-progress";
  return "pending";
}

function applyAutomation(data) {
  const next = { ...data };
  for (const seriesFields of Object.values(VACCINE_SERIES)) {
    const highest = seriesFields.reduce((h, f, i) => (next[f] ? i : h), -1);
    if (highest > 0) {
      for (let i = 0; i < highest; i++) next[seriesFields[i]] = true;
    }
  }
  return next;
}

function getNextInSchedule(data) {
  for (const g of VACCINE_TIMELINE) {
    for (const v of g.vaccines) {
      if (getVaccineStatus(v.field, data) === "behind") {
        return { ...v, groupLabel: g.label, priority: "behind" };
      }
    }
  }
  for (const g of VACCINE_TIMELINE) {
    for (const v of g.vaccines) {
      if (getVaccineStatus(v.field, data) === "upcoming") {
        return { ...v, groupLabel: g.label, priority: "upcoming" };
      }
    }
  }
  return null;
}

function isFIC(data) {
  return VACCINE_FIELDS.every((f) => data[f]);
}

function getImmunizationStats(data) {
  const completed = VACCINE_FIELDS.filter((f) => data[f]).length;
  const remaining = VACCINE_FIELDS.length - completed;
  const pct = Math.round((completed / VACCINE_FIELDS.length) * 100);
  return { completed, remaining, total: VACCINE_FIELDS.length, pct };
}

/* ═══════════════════════════════════════════════════════════════
   REUSABLE FORM SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FormSection({ title, subtitle, icon, children, delay = 0, accent }) {
  const borderClass = accent === "pink" ? "border-t-2 border-t-pink-600" : "";
  return (
    <div
      className={`anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm ${borderClass}`}
      style={stagger(delay)}
    >
      <div className="flex items-center gap-2.5 border-b border-[#F3F4F6] pb-4">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent === "pink" ? "bg-pink-50 text-pink-600" : "bg-red-50 text-[#B91C1C]"}`}
        >
          {icon}
        </div>
        <div>
          <h2
            className={`text-sm font-bold ${accent === "pink" ? "text-pink-800" : "text-[#1A1A1A]"}`}
          >
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[#6B7280]">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function FieldInput({ label, required, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function FieldSelect({ label, required, children, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        required={required}
        className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

function BpInputGroup({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        Blood Pressure (mmHg)
      </label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          placeholder="Systolic"
          value={systolic}
          onChange={(e) => onSystolicChange(e.target.value)}
          className="h-10 w-full rounded-l-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border-y border-[#E8ECF0] bg-[#F3F4F6] text-sm font-bold text-[#6B7280]">
          /
        </div>
        <input
          type="number"
          placeholder="Diastolic"
          value={diastolic}
          onChange={(e) => onDiastolicChange(e.target.value)}
          className="h-10 w-full rounded-r-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <p className="mt-1 text-[9px] text-[#BFBFBF]">Systolic / Diastolic</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SMART IMMUNIZATION SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function StatusChip({ status, compact }) {
  const map = {
    administered: {
      label: "Administered",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: <Check size={compact ? 8 : 9} strokeWidth={3} />,
    },
    upcoming: {
      label: "Upcoming",
      bg: "bg-amber-50",
      text: "text-amber-700",
      icon: <Clock size={compact ? 8 : 9} />,
    },
    behind: {
      label: "Behind Schedule",
      bg: "bg-red-50",
      text: "text-red-600",
      icon: <X size={compact ? 8 : 9} strokeWidth={3} />,
    },
    locked: {
      label: "Not Yet Available",
      bg: "bg-gray-100",
      text: "text-gray-400",
      icon: <Lock size={compact ? 8 : 9} />,
    },
  };
  const c = map[status];
  if (!c) return null;
  const size = compact
    ? "rounded-md px-1.5 py-0.5 text-[9px]"
    : "rounded-lg px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${c.bg} ${c.text} ${size}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function ImmunizationSummaryCard({ data }) {
  const stats = getImmunizationStats(data);
  const nextItem = getNextInSchedule(data);
  const fic = isFIC(data);

  return (
    <div className="rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            Immunization Coverage
          </h3>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#1F2937]">
              {stats.completed}
            </span>{" "}
            vaccine{stats.completed !== 1 ? "s" : ""} recorded
            <span className="mx-1.5 text-[#D4D4D4]">·</span>
            <span className="font-semibold text-[#1F2937]">
              {stats.remaining}
            </span>{" "}
            in schedule
          </p>
        </div>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-50">
          <Baby size={18} className="text-[#B91C1C]" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Coverage
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${fic ? "text-emerald-600" : "text-[#B91C1C]"}`}
          >
            {stats.pct}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${fic ? "bg-emerald-500" : "bg-[#B91C1C]"}`}
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </div>

      {nextItem && !fic && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
          <Clock size={13} className="flex-shrink-0 text-amber-600" />
          <p className="min-w-0 text-[11px] leading-snug text-amber-800">
            Next in schedule:{" "}
            <span className="font-bold">{nextItem.label}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function FICCard() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <ShieldCheck size={20} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-emerald-800">
            Fully Immunized Child
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-600">
            All {VACCINE_FIELDS.length} vaccines in the schedule have been
            recorded.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScheduleStatusPanel({ data }) {
  const nextItem = getNextInSchedule(data);
  if (!nextItem || isFIC(data)) return null;

  const isBehind = nextItem.priority === "behind";

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${isBehind ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-lg ${isBehind ? "bg-red-100" : "bg-amber-100"}`}
        >
          {isBehind ? (
            <X size={12} className="text-red-600" strokeWidth={3} />
          ) : (
            <Clock size={12} className="text-amber-700" />
          )}
        </div>
        <h4
          className={`text-[10px] font-bold uppercase tracking-widest ${isBehind ? "text-red-700" : "text-amber-800"}`}
        >
          {isBehind ? "Behind Schedule" : "Next in Schedule"}
        </h4>
      </div>
      <p
        className={`text-sm font-bold ${isBehind ? "text-red-900" : "text-amber-900"}`}
      >
        {nextItem.label}
      </p>
      <p
        className={`mt-1 text-xs leading-relaxed ${isBehind ? "text-red-700" : "text-amber-700"}`}
      >
        {isBehind
          ? "A later vaccine in this series was recorded without this dose. Please verify with the immunization card."
          : `Scheduled at ${nextItem.groupLabel}.`}
      </p>
    </div>
  );
}

function SmartVaccineCheckbox({
  label,
  field,
  checked,
  status,
  isNext,
  isBehind,
  onChange,
}) {
  const isLocked = status === "locked";

  return (
    <button
      type="button"
      onClick={() => !isLocked && onChange(field, !checked)}
      disabled={isLocked}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200
        ${isNext ? "anim-pulse-next border border-amber-200 bg-amber-50/70" : ""}
        ${isBehind && !isNext ? "border border-red-200 bg-red-50/50" : ""}
        ${checked && !isNext && !isBehind ? "bg-emerald-50/40" : ""}
        ${!checked && !isNext && !isBehind ? "bg-[#FAFAFA] hover:bg-[#F5F5F5]" : ""}
        ${isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        ${!isNext && !isBehind ? "border border-transparent" : ""}
      `}
    >
      <div
        className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200
        ${checked ? "border-[#B91C1C] bg-[#B91C1C]" : "border-[#D4D4D4] bg-white group-hover:border-[#BFBFBF]"}`}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span
        className={`min-w-0 flex-1 text-xs font-medium transition-colors duration-200 ${checked ? "text-[#991B1B]" : "text-[#6B7280]"}`}
      >
        {label}
      </span>
      <StatusChip status={status} compact />
      {isNext && (
        <span className="flex-shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-amber-700">
          Next
        </span>
      )}
      {isBehind && !isNext && (
        <span className="flex-shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-red-700">
          Behind
        </span>
      )}
    </button>
  );
}

function VaccineTimelineNode({ group, data, nextField, onChange }) {
  const nodeStatus = getTimelineNodeStatus(group, data);
  const doneCount = group.vaccines.filter((v) => data[v.field]).length;
  const totalCount = group.vaccines.length;

  const dotStyles = {
    completed: "border-emerald-500 bg-emerald-500",
    "in-progress": "border-amber-500 bg-amber-500",
    pending: "border-[#D4D4D4] bg-white",
  };

  const nodeChip = {
    completed: {
      label: "Completed",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    "in-progress": {
      label: `${doneCount}/${totalCount}`,
      bg: "bg-amber-50",
      text: "text-amber-700",
    },
    pending: { label: "Pending", bg: "bg-gray-100", text: "text-gray-400" },
  };
  const chip = nodeChip[nodeStatus];

  return (
    <div className="relative pb-7 last:pb-0">
      <div
        className={`absolute left-[-22px] top-[8px] h-3 w-3 rounded-full border-2 transition-colors duration-300 ${dotStyles[nodeStatus]}`}
      />
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-xs font-bold tracking-wide text-[#1F2937]">
          {group.label}
        </h3>
        <span className="text-[10px] font-medium text-[#C9C9C9]">
          {group.sublabel}
        </span>
        <span
          className={`ml-auto rounded-lg px-2 py-0.5 text-[10px] font-semibold ${chip.bg} ${chip.text}`}
        >
          {chip.label}
        </span>
      </div>
      <div className="space-y-1.5">
        {group.vaccines.map((vaccine) => {
          const status = getVaccineStatus(vaccine.field, data);
          return (
            <SmartVaccineCheckbox
              key={vaccine.field}
              label={vaccine.label}
              field={vaccine.field}
              checked={data[vaccine.field]}
              status={status}
              isNext={vaccine.field === nextField}
              isBehind={status === "behind"}
              onChange={onChange}
            />
          );
        })}
      </div>
    </div>
  );
}

function VaccineTimeline({ data, onChange }) {
  const nextItem = getNextInSchedule(data);
  const nextField = nextItem?.field || null;

  return (
    <div className="relative ml-1 pl-6">
      <div className="absolute left-[-0.5px] top-2 bottom-2 w-px bg-[#E8ECF0]" />
      {VACCINE_TIMELINE.map((group) => (
        <VaccineTimelineNode
          key={group.id}
          group={group}
          data={data}
          nextField={nextField}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function AddHealthRecord() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || "rhu";
  const basePath = userRole === "bhc" ? "/bhc" : "/rhu";
  const healthRecordsPath = `${basePath}/health-records`;

  const recordId = searchParams.get("recordId");
  const preselectedPatientId = searchParams.get("patientId") || "";
  const isFollowUp = !!recordId;

  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");

  const [dateOfVisit, setDateOfVisit] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [timeOfVisit, setTimeOfVisit] = useState(
    new Date().toTimeString().split(" ")[0].slice(0, 5),
  );
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [summaryOfPresentIllness, setSummaryOfPresentIllness] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medication, setMedication] = useState("");
  const [attendingStaff, setAttendingStaff] = useState("");
  const [consultationNotes, setConsultationNotes] = useState("");

  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temp, setTemp] = useState("");
  const [pulse, setPulse] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const [followUpStatus, setFollowUpStatus] = useState("Routine Monitoring");
  const [followUpDate, setFollowUpDate] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [needsReferral, setNeedsReferral] = useState("no");
  const [patientCondition, setPatientCondition] = useState("Improving");

  // Referral context handoff to BHC CreateReferral form.
  // Implemented without referencing `selectedPatient` (which is declared later) to avoid TDZ errors.
  const referralContextRef = useMemo(() => {
    const recordIdFromQuery = searchParams.get("recordId") || "";
    const patientIdFromQuery = searchParams.get("patientId") || "";

    return {
      recordId: recordIdFromQuery,
      patientId: selectedPatientId || patientIdFromQuery,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, searchParams]);

  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");

  const [immunizationData, setImmunizationData] = useState({
    bcg_vaccine: false,
    hepb_birth: false,
    pentavalent_dose1: false,
    pentavalent_dose2: false,
    pentavalent_dose3: false,
    opv_dose1: false,
    opv_dose2: false,
    opv_dose3: false,
    ipv_dose1: false,
    ipv_dose2: false,
    pcv_dose1: false,
    pcv_dose2: false,
    pcv_dose3: false,
    mmr_dose1: false,
    mmr_dose2: false,
    feeding_status: "",
  });

  const immunizationFIC = useMemo(
    () => isFIC(immunizationData),
    [immunizationData],
  );

  useEffect(() => {
    async function loadPatients() {
      const parsedPatients = await getPatientDetailsList();
      setPatients(parsedPatients);
      if (preselectedPatientId) setSelectedPatientId(preselectedPatientId);
    }
    loadPatients();
  }, [preselectedPatientId]);

  useEffect(() => {
    if (!recordId) return;
    async function loadFollowUpRecord() {
      const records = await getRhuHealthRecords();
      const found = records.find(
        (r) => r.id === recordId || r._id === recordId,
      );
      if (found?.patientId) setSelectedPatientId(found.patientId);
    }
    loadFollowUpRecord();
  }, [recordId]);

  const filteredPatients = patients.filter((patient) =>
    `${patient.name || (patient.firstName ? `${patient.firstName} ${patient.lastName}` : "")} ${patient.contactNumber || patient.contact || ""}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  const selectedPatient = patients.find(
    (patient) => patient.id === selectedPatientId,
  );
  const [followUpRecord, setFollowUpRecord] = useState(null);

  useEffect(() => {
    async function loadFollowUpPreview() {
      if (!isFollowUp) {
        setFollowUpRecord(null);
        return;
      }
      const records = await getRhuHealthRecords();
      setFollowUpRecord(
        records.find((r) => r.id === recordId || r._id === recordId) || null,
      );
    }
    loadFollowUpPreview();
  }, [isFollowUp, recordId]);

  const getPatientClassification = () => {
    if (!selectedPatient) return "";
    return (
      selectedPatient.patientClassification ||
      selectedPatient.category ||
      ""
    ).toLowerCase();
  };

  /* ── Workflow Helper Variables ── */
  const patientClass = getPatientClassification();
  const isImmunization = patientClass === "immunization";
  const isMaternal = patientClass === "maternal";
  const isGeneral = !isImmunization && !isMaternal;

  const formattedBp = (() => {
    const sys = systolicBp || "N/A";
    const dia = diastolicBp || "N/A";
    return systolicBp || diastolicBp ? `${sys}/${dia}` : "N/A";
  })();

  const concatenatedVitalSigns = `BP: ${formattedBp} | Temp: ${temp || "N/A"}°C | Pulse: ${pulse || "N/A"} bpm | Weight: ${weight || "N/A"} kg | Height: ${height || "N/A"} cm`;

  useEffect(() => {
    if (getPatientClassification() === "maternal")
      setFollowUpStatus("Routine Monitoring");
  }, [selectedPatientId]);

  useEffect(() => {
    if (followUpStatus === "For Referral") {
      setNeedsReferral("yes");
      setPatientCondition("Needs Further Assessment");
    } else {
      setNeedsReferral("no");
      if (patientCondition === "Needs Further Assessment")
        setPatientCondition("Improving");
    }
  }, [followUpStatus]);

  useEffect(() => {
    const registryLmp = selectedPatient?.lmp || selectedPatient?.LMP;
    if (!registryLmp) {
      setExpectedDeliveryDate("");
      setAog("");
      return;
    }
    const lmpDate = new Date(registryLmp);
    const visitDate = dateOfVisit ? new Date(dateOfVisit) : new Date();
    if (isNaN(lmpDate.getTime())) {
      setExpectedDeliveryDate("Invalid Date");
      setAog("Invalid Date");
      return;
    }
    const edd = new Date(lmpDate);
    edd.setDate(edd.getDate() + 7);
    edd.setMonth(edd.getMonth() - 3);
    edd.setFullYear(edd.getFullYear() + 1);
    setExpectedDeliveryDate(edd.toISOString().split("T")[0]);
    const timeDiff = visitDate.getTime() - lmpDate.getTime();
    if (timeDiff < 0) {
      setAog("Invalid (LMP is ahead of visit)");
      return;
    }
    const totalDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    if (weeks > 42) {
      setAog("Post-term (>42 Weeks)");
      return;
    }
    const weekStr = `${weeks} week${weeks !== 1 ? "s" : ""}`;
    const dayStr = days > 0 ? ` and ${days} day${days > 1 ? "s" : ""}` : "";
    setAog(`${weekStr}${dayStr}`);
  }, [selectedPatient, dateOfVisit]);

  const handleVaccineChange = (field, value) => {
    setImmunizationData((prev) => {
      const updated = { ...prev, [field]: value };
      if (typeof value === "boolean") return applyAutomation(updated);
      return updated;
    });
  };

  async function handleSave(e) {
    e.preventDefault();

    if (!selectedPatientId) {
      alert("Please select a patient first.");
      return;
    }

    const finalStatus = followUpStatus;

    const finalChiefComplaint =
      isImmunization && !chiefComplaint ? "Vaccination Visit" : chiefComplaint;

    const formData = {
      patientId: selectedPatientId,

      patientName:
        selectedPatient?.name ||
        `${selectedPatient?.firstName || ""} ${selectedPatient?.lastName || ""}`,

      patientClassification:
        selectedPatient?.patientClassification ||
        selectedPatient?.category ||
        "General Consultation",

      dateOfVisit,
      timeOfVisit,
      chiefComplaint: finalChiefComplaint,
      summaryOfPresentIllness,
      diagnosis,

      vitalSigns: concatenatedVitalSigns,

      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      temperature: temp || null,
      pulseRate: pulse || null,
      weight: weight || null,
      height: height || null,

      medication,
      attendingStaff,
      consultationNotes,

      followUpStatus: finalStatus,
      followUpDate,
      monitoringNotes,
      patientCondition,

      needsReferral,

      referralReason: "",
      referralCategory: null,

      referralAssessmentStatus:
        needsReferral === "yes" ? "Pending RHU Assessment" : null,

      lmp: selectedPatient?.lmp || selectedPatient?.LMP || null,
      pmp: selectedPatient?.pmp || null,
      cycleDuration: selectedPatient?.cycleDuration || null,
      gravida: selectedPatient?.gravida || null,
      para: selectedPatient?.para || null,
      tpal: selectedPatient?.tpal || null,

      expectedDeliveryDate,
      aog,

      immunizationData,

      createdByRole: userRole,
    };

    try {
      const savedRecord =
        await healthRecordService.createHealthRecord(formData);

      // AUTO REDIRECT TO CREATE REFERRAL
      if (needsReferral === "yes" && userRole === "bhc") {
        navigate(
          `/bhc/referrals/create?recordId=${
            savedRecord.data.id || savedRecord.data._id
          }&patientId=${selectedPatientId}`,
        );
        return;
      }

      // NORMAL SAVE
      navigate(healthRecordsPath);
    } catch (error) {
      console.error("Failed to save record:", error);

      alert("May error sa pag-save ng record. Pakisuri ang console.");
    }
  }

  /* ═══════════════════════════════════════════════════════════════ */
  // When switching to “Create Referral”, immediately navigate to the BHC CreateReferral form.

  return (
    <DashboardLayout role={userRole} title="Add Health Record">
      <style>{keyframes}</style>

      <div className="anim-fade-up mb-6" style={stagger(0)}>
        <Link
          to={healthRecordsPath}
          className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} /> Back to Health Records
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
          {isFollowUp ? "Follow-up Health Record" : "Add Health Record"}
        </h1>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          {isFollowUp
            ? `Create a follow-up record for ${followUpRecord?.patientName || "this patient"}.`
            : "Record a patient visit, follow-up, monitoring update, or health encounter."}
        </p>
        {isFollowUp && followUpRecord && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#B91C1C]" />
            <p className="text-xs text-red-800">
              Creating a follow-up record for{" "}
              <span className="font-semibold">
                {followUpRecord.patientName}
              </span>
              . Original record:{" "}
              <span className="font-mono font-semibold">{recordId}</span>
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* ═══ 1. PATIENT SELECTION (ALWAYS VISIBLE) ═══ */}
        <FormSection
          title="Patient Selection"
          subtitle="Search and select an existing patient profile from the registry."
          icon={<User size={14} />}
          delay={1}
        >
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Search Existing Patient
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                />
                <input
                  type="text"
                  placeholder="Type patient name or contact number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] pl-10 pr-3.5 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Select Patient ({filteredPatients.length} found)
              </label>
              <select
                required
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={isFollowUp}
                className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
              >
                <option value="">-- Choose Patient --</option>
                {filteredPatients.map((patient) => {
                  const pName =
                    patient.name ||
                    `${patient.firstName || ""} ${patient.lastName || ""}`;
                  const pAge = patient.ageSex
                    ? patient.ageSex
                    : patient.age
                      ? `${patient.age} yrs`
                      : "";
                  const pClass =
                    patient.patientClassification || patient.category || "";
                  return (
                    <option key={patient.id} value={patient.id}>
                      {pName}
                      {pAge ? ` • ${pAge}` : ""}
                      {pClass ? ` [${pClass}]` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            {selectedPatient && (
              <div className="anim-fade-up rounded-xl border border-red-100 bg-red-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100">
                    <User size={11} className="text-[#B91C1C]" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#B91C1C]">
                    Patient Preview
                  </span>
                </div>
                <p className="text-sm font-bold text-[#1A1A1A]">
                  {selectedPatient.name ||
                    `${selectedPatient.firstName || ""} ${selectedPatient.lastName || ""}`}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Age/Sex:{" "}
                  {selectedPatient.ageSex ||
                    (selectedPatient.age
                      ? `${selectedPatient.age} years old / ${selectedPatient.sex || "—"}`
                      : "—")}
                </p>
                <p className="text-xs text-[#6B7280]">
                  Contact:{" "}
                  {selectedPatient.contactNumber ||
                    selectedPatient.contact ||
                    "—"}
                </p>
                <p className="text-xs text-[#6B7280]">
                  Classification:{" "}
                  <span className="font-semibold text-[#B91C1C]">
                    {selectedPatient.patientClassification ||
                      selectedPatient.category ||
                      "General Consultation"}
                  </span>
                </p>
              </div>
            )}
          </div>
        </FormSection>

        {/* ═══ 2. IMMUNIZATION WORKFLOW (IMMUNIZATION ONLY) ═══ */}
        {isImmunization && (
          <FormSection
            title="Smart Immunization Tracker"
            subtitle="Digital immunization card with automated schedule tracking."
            icon={<Syringe size={14} />}
            delay={2}
          >
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <ImmunizationSummaryCard data={immunizationData} />
              {immunizationFIC ? (
                <FICCard />
              ) : (
                <ScheduleStatusPanel data={immunizationData} />
              )}
            </div>

            <div className="mb-6 max-w-xs">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Feeding Status
              </label>
              <select
                value={immunizationData.feeding_status}
                onChange={(e) =>
                  handleVaccineChange("feeding_status", e.target.value)
                }
                className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
              >
                <option value="">Select status</option>
                <option>Breastfeeding</option>
                <option>Formula Milk</option>
                <option>Mixed Feeding</option>
              </select>
            </div>

            <div className="rounded-2xl border border-[#F0F0F0] bg-[#FCFCFC] p-5">
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-50">
                  <Syringe size={11} className="text-[#B91C1C]" />
                </div>
                <div>
                  <h3 className="text-[11px] font-bold tracking-wide text-[#1F2937]">
                    Vaccine Schedule
                  </h3>
                  <p className="text-[9px] text-[#C9C9C9]">
                    Based on the standard immunization schedule
                  </p>
                </div>
              </div>
              <VaccineTimeline
                data={immunizationData}
                onChange={handleVaccineChange}
              />
            </div>

            <p className="mt-3 text-center text-[9px] text-[#D4D4D4]">
              <Lock size={8} className="mr-1 inline-block -mt-px" />
              Checking a higher dose automatically fills in previous doses in
              the same series.
            </p>
          </FormSection>
        )}

        {/* ═══ 3. MATERNAL WORKFLOW (MATERNAL ONLY) ═══ */}
        {isMaternal && (
          <FormSection
            title="Maternal & Prenatal Assessment"
            subtitle="Monitor pregnancy progression and maternal clinical vitals."
            icon={<HeartPulse size={14} />}
            delay={2}
            accent="pink"
          >
            <div className="border-t border-[#F3F4F6] pt-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-pink-700">
                Obstetric Profile
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    Registered LMP
                  </label>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    {selectedPatient?.lmp
                      ? new Date(selectedPatient.lmp).toLocaleDateString(
                          "en-US",
                          { year: "numeric", month: "long", day: "numeric" },
                        )
                      : "Not set"}
                  </p>
                </div>
                <FieldInput
                  label="Calculated AOG"
                  value={aog || "Calculating..."}
                  readOnly
                />
                <FieldInput
                  label="Expected Delivery Date"
                  value={expectedDeliveryDate || "Calculating..."}
                  readOnly
                />
              </div>
            </div>
          </FormSection>
        )}

        {/* ═══ 4. CONSULTATION INFORMATION (HIDDEN FOR IMMUNIZATION) ═══ */}
        {!isImmunization && (
          <FormSection
            title="Consultation Information"
            subtitle="Record consultation findings and observations."
            icon={<Stethoscope size={14} />}
            delay={3}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <FieldInput
                label="Date of Visit"
                type="date"
                required
                value={dateOfVisit}
                onChange={(e) => setDateOfVisit(e.target.value)}
              />
              <FieldInput
                label="Time of Visit"
                type="time"
                required
                value={timeOfVisit}
                onChange={(e) => setTimeOfVisit(e.target.value)}
              />
              <FieldInput
                label="Chief Complaint"
                placeholder="e.g. Fever, vomiting, cough"
                required
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
              />
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Summary of Present Illness and Physical Examination{" "}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={summaryOfPresentIllness}
                onChange={(e) => setSummaryOfPresentIllness(e.target.value)}
                placeholder="Record the detailed history of the present illness and complete physical examination findings here..."
                className="min-h-[120px] w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <FieldInput
                label="Initial Diagnosis"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
              <FieldInput
                label="Initial Actions Taken"
                value={medication}
                onChange={(e) => setMedication(e.target.value)}
              />
              <FieldInput
                label="Name of Practitioner"
                value={attendingStaff}
                onChange={(e) => setAttendingStaff(e.target.value)}
              />
            </div>
          </FormSection>
        )}

        {/* ═══ 5. VITAL SIGNS (ALWAYS VISIBLE) ═══ */}
        <FormSection
          title="Vital Signs"
          subtitle="Record the patient's physiological measurements."
          icon={<HeartPulse size={14} />}
          delay={4}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <BpInputGroup
              systolic={systolicBp}
              diastolic={diastolicBp}
              onSystolicChange={setSystolicBp}
              onDiastolicChange={setDiastolicBp}
            />
            <FieldInput
              label="Temperature"
              placeholder="e.g. 36.5 °C"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            />
            <FieldInput
              label="Pulse Rate"
              placeholder="e.g. 72 bpm"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <FieldInput
              label="Weight"
              type="number"
              placeholder="e.g. 60"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <FieldInput
              label="Height"
              type="number"
              placeholder="e.g. 165"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          {(weight || height) && (
            <p className="mt-1 text-right text-[9px] font-medium text-[#BFBFBF]">
              {weight ? "Weight in kg" : ""}
              {weight && height ? " • " : ""}
              {height ? "Height in cm" : ""}
            </p>
          )}
          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {isImmunization
                ? "Vaccination Visit Notes (Optional)"
                : "Additional Consultation Notes (Optional)"}
            </label>
            <textarea
              value={consultationNotes}
              onChange={(e) => setConsultationNotes(e.target.value)}
              placeholder={
                isImmunization
                  ? "e.g. Post-vaccination observations, adverse events, etc..."
                  : "Other observations not covered in the summary..."
              }
              className="min-h-20 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
            />
          </div>
        </FormSection>

        {/* ═══ 6. PATIENT MONITORING (ALWAYS VISIBLE) ═══ */}
        <FormSection
          title="Patient Monitoring"
          subtitle="Track patient progress and follow-up schedules."
          icon={<HeartPulse size={14} />}
          delay={5}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldSelect
              label="Visit Type"
              value={followUpStatus}
              onChange={(e) => setFollowUpStatus(e.target.value)}
            >
              <option>Routine Monitoring</option>
              <option>Follow-up</option>
              <option>For Referral</option>
              <option>Completed</option>
            </FieldSelect>
            <FieldInput
              label="Follow-up Date"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </div>
          <div className="mt-4">
            <FieldSelect
              label="Current Condition"
              value={patientCondition}
              onChange={(e) => setPatientCondition(e.target.value)}
            >
              <option>Improving</option>
              <option>Stable</option>
              <option>No Improvement Observed</option>
              <option>Needs Further Assessment</option>
              <option>Recovered</option>
            </FieldSelect>
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Monitoring and Follow-up
            </label>
            <textarea
              value={monitoringNotes}
              onChange={(e) => setMonitoringNotes(e.target.value)}
              placeholder="Write follow-up or monitoring notes..."
              className="min-h-20 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
            />
          </div>
        </FormSection>

        {/* ═══ 7. ASSESSMENT RECOMMENDATION (ALWAYS VISIBLE) ═══ */}
        <FormSection
          title="Assessment Recommendation"
          subtitle="Determine if this case requires further evaluation."
          icon={<Send size={14} />}
          delay={6}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <label
              className={`flex min-h-[96px] cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all duration-200 ${needsReferral === "no" ? "border-[#B91C1C] bg-red-50" : "border-[#E8ECF0] bg-white"}`}
            >
              <input
                type="radio"
                name="needsReferral"
                value="no"
                checked={needsReferral === "no"}
                onChange={(e) => setNeedsReferral(e.target.value)}
                className="sr-only"
              />
              <Save
                size={18}
                className={
                  needsReferral === "no" ? "text-[#B91C1C]" : "text-[#9CA3AF]"
                }
              />
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  Save Health Record
                </p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Save consultation and monitoring information.
                </p>
              </div>
            </label>
            <label
              className={`flex min-h-[96px] cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all duration-200 ${needsReferral === "yes" ? "border-amber-500 bg-amber-50" : "border-[#E8ECF0] bg-white"}`}
            >
              <input
                type="radio"
                name="needsReferral"
                value="yes"
                checked={needsReferral === "yes"}
                onChange={(e) => setNeedsReferral(e.target.value)}
                className="sr-only"
              />
              <Send
                size={18}
                className={
                  needsReferral === "yes" ? "text-amber-600" : "text-[#9CA3AF]"
                }
              />
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  Create Referral
                </p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Forward patient case for further medical assessment.
                </p>
              </div>
            </label>
          </div>
        </FormSection>

        {/* ═══ ACTIONS ═══ */}
        <div
          className="anim-fade-up flex items-center justify-end gap-3 pt-1 pb-4"
          style={stagger(7)}
        >
          <button
            type="button"
            onClick={() => navigate(healthRecordsPath)}
            className="rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98]"
          >
            <Save
              size={15}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            Save Health Record
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
