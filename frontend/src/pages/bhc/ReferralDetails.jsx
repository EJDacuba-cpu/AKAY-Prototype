import { useState, useEffect } from "react";
import {
  ArrowLeft,
  FileText,
  Printer,
  QrCode,
  ClipboardList,
  User,
  Stethoscope,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  MessageSquare,
} from "lucide-react";
import { Link, useParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getReferralById } from "../../services/referrals";
import { getPatientById } from "../../services/patientService";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulseSoft { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .anim-fade-up  { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .pulse-soft    { animation: pulseSoft 2.5s ease-in-out infinite; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Formatters ─── */
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";
const fmtTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

/* ─── Tab Config ─── */
const TABS = [
  { key: "referral", label: "Referral Information", icon: ClipboardList },
  { key: "clinical", label: "Clinical Summary", icon: Stethoscope },
  { key: "rhu", label: "RHU Feedback", icon: MessageSquare },
  { key: "timeline", label: "Referral Timeline", icon: Clock },
];

/* ─── Main Component ─── */
export default function ReferralDetails() {
  const { trackingId } = useParams();
  const [referral, setReferral] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [patientExtra, setPatientExtra] = useState(null);
  const [activeTab, setActiveTab] = useState("referral");

  useEffect(() => {
    async function fetchReferral() {
      try {
        setLoading(true);
        const data = await getReferralById(trackingId);
        if (!data) {
          setNotFound(true);
        } else {
          setReferral(data);
          const found = await getPatientById(data.patientId);
          if (found) {
            setPatientExtra(found);
          }
        }
      } catch (error) {
        console.error(error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchReferral();
  }, [trackingId]);

  /* ─── Derived Data ─── */
  const patientAddress = patientExtra
    ? [patientExtra.address, patientExtra.barangay, patientExtra.municipality]
        .filter(Boolean)
        .join(", ")
    : null;
  const patientPhilHealth =
    patientExtra?.philHealth || patientExtra?.philHealthNumber || null;

  const isCompleted = referral?.status === "Completed";

  /* ─── States ─── */
  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Referral Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading referral details...
        </div>
      </DashboardLayout>
    );
  }

  if (notFound) {
    return (
      <DashboardLayout role="bhc" title="Not Found">
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertTriangle size={30} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            Referral Not Found
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            The referral record you are looking for does not exist or the link
            is broken.
          </p>
          <Link
            to="/bhc/referrals"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#0B2E59] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#092347]"
          >
            Back to Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Referral Details">
      <style>{keyframes}</style>

      {/* ─── BACK LINK + HEADER ─── */}
      <div className="anim-fade-up mb-4" style={stagger(0)}>
        <Link
          to="/bhc/referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0B2E59]"
        >
          <ArrowLeft size={15} /> Back to Referrals
        </Link>
      </div>

      {/* ─── PAGE TITLE BAR ─── */}
      <div
        className="anim-fade-up mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        style={stagger(1)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/10 text-[#0B2E59]">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Referral Slip</h1>
            <p className="font-mono text-xs font-semibold text-[#0B2E59]/70">
              {referral.trackingId}
            </p>
          </div>
        </div>
        <StatusBadge status={referral.status} />
      </div>

      {/* ─── TAB BAR ─── */}
      <div
        className="anim-fade-up mb-5 border-b border-slate-200"
        style={stagger(2)}
      >
        <nav className="-mb-px flex gap-0 overflow-x-auto" role="tablist">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const isRhuLocked = tab.key === "rhu" && !isCompleted;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                disabled={isRhuLocked}
                className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  isActive
                    ? "border-[#0B2E59] text-[#0B2E59]"
                    : isRhuLocked
                      ? "cursor-not-allowed border-transparent text-slate-300"
                      : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
                }`}
              >
                <Icon size={14} />
                {tab.label}
                {isRhuLocked && (
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                    Locked
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── CONTENT AREA ─── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        {/* ════════════════════════════════════════════
            MAIN TAB CONTENT
        ════════════════════════════════════════════ */}
        <div className="anim-fade-up min-w-0" style={stagger(3)}>
          {activeTab === "referral" && (
            <TabReferral
              referral={referral}
              patientAddress={patientAddress}
              patientPhilHealth={patientPhilHealth}
            />
          )}
          {activeTab === "clinical" && <TabClinical referral={referral} />}
          {activeTab === "rhu" && (
            <TabRHU referral={referral} isCompleted={isCompleted} />
          )}
          {activeTab === "timeline" && <TabTimeline referral={referral} />}
        </div>

        {/* ════════════════════════════════════════════
            SIDEBAR — MINIMAL
        ════════════════════════════════════════════ */}
        <aside className="space-y-4">
          {/* QR Card */}
          <div
            className="anim-fade-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center"
            style={stagger(4)}
          >
            <div className="mx-auto mb-3 flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50">
              <QrCode size={64} className="text-[#0B2E59]/60" />
            </div>
            <p className="font-mono text-xs font-bold text-slate-700">
              {referral.trackingId}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Scan to verify at RHU
            </p>
          </div>

          {/* Quick Actions */}
          <div
            className="anim-fade-up flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            style={stagger(5)}
          >
            <Link
              to={`/bhc/referrals/${referral.id}/print`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Printer size={14} /> Print Referral Slip
            </Link>
            <Link
              to={`/bhc/referrals/${referral.id}/qr`}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#092347]"
            >
              <QrCode size={14} /> Open Full QR Code
            </Link>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 1 — REFERRAL INFORMATION
═══════════════════════════════════════════════════ */
function TabReferral({ referral, patientAddress, patientPhilHealth }) {
  return (
    <div className="space-y-4">
      {/* Section A — Referral Header */}
      <HealthSection title="Referral Header" icon={<ClipboardList size={14} />}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          <MetaField label="Tracking ID" value={referral.trackingId} mono />

          <MetaField
            label="Date of Referral"
            value={fmtDate(referral.createdAt)}
          />
          <MetaField
            label="Time of Referral"
            value={fmtTime(referral.createdAt)}
          />

          <MetaField
            label="Referring Health Center"
            value="Pitpitan Health Center"
          />

          <MetaField
            label="Destination Facility"
            value={referral.referredFacility}
          />
          <MetaField label="Name of Practitioner" value="BHC Staff" />
        </div>
      </HealthSection>

      {/* Section B — Patient Information */}
      <HealthSection title="Patient Information" icon={<User size={14} />}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <FormField
            label="Patient Name"
            value={referral.patientName || referral.patient}
            bold
          />
          <FormField label="Age / Sex / Civil Status" value={referral.ageSex} />
          <FormField
            label="Address"
            value={patientAddress || "—"}
            icon={<MapPin size={12} />}
          />
          <FormField
            label="Patient Classification"
            value={referral.classification}
            isBadge
          />
          {patientPhilHealth && (
            <FormField label="PhilHealth Number" value={patientPhilHealth} />
          )}
          <FormField label="Chief Complaint" value={referral.chiefComplaint} />
        </div>
      </HealthSection>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 2 — CLINICAL SUMMARY
═══════════════════════════════════════════════════ */
function TabClinical({ referral }) {
  return (
    <div className="space-y-4">
      {/* 1. Summary of Present Illness & Physical Examination */}
      <HealthSection
        title="Summary of Present Illness & Physical Examination"
        icon={<Stethoscope size={14} />}
        accent="blue"
      >
        <ClinicalNarrative
          value={
            referral.chiefComplaint ||
            "No clinical summary provided in the referral record."
          }
          large
        />
      </HealthSection>

      {/* 2. Initial Diagnosis */}
      <HealthSection title="Initial Diagnosis" icon={<FileText size={14} />}>
        <ClinicalBlock
          label="Working Diagnosis / Assessment"
          value={referral.diagnosis || "No initial diagnosis recorded."}
        />
      </HealthSection>

      {/* 3. Initial Actions Taken */}
      <HealthSection
        title="Initial Actions Taken"
        icon={<CheckCircle2 size={14} />}
      >
        {referral.initialActionsTaken ? (
          <ClinicalBlock value={referral.initialActionsTaken} />
        ) : (
          <HealthEmpty
            message="Not specified in this referral record."
            sub="Initial interventions prior to escalation were not documented."
          />
        )}
      </HealthSection>

      {/* 4. Reason for Referral */}
      <HealthSection
        title="Reason for Referral"
        icon={<AlertCircle size={14} />}
        accent="amber"
      >
        <ClinicalBlock
          label="Clinical justification for RHU escalation"
          value={referral.reasonForReferral || "No reason specified."}
          highlight
        />
      </HealthSection>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 3 — RHU FEEDBACK / RETURN SLIP
═══════════════════════════════════════════════════ */
function TabRHU({ referral, isCompleted }) {
  /* Not completed — show waiting state */
  if (!isCompleted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ShieldCheck size={26} />
          </div>
          <h3 className="text-sm font-bold text-slate-700">
            Awaiting RHU Response
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
            This section will contain the RHU return slip details once the
            receiving facility completes the referral and submits clinical
            feedback.
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
            <span className="pulse-soft h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[11px] font-semibold text-slate-500">
              Current Status: {referral.status}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* Completed but no feedback data */
  if (!referral.feedback) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white">
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-400">
            <ShieldCheck size={26} />
          </div>
          <h3 className="text-sm font-bold text-emerald-700">
            No Return Slip Details Attached
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-emerald-500">
            The receiving facility has marked this referral as completed but has
            not yet submitted the clinical return slip details.
          </p>
        </div>
      </div>
    );
  }

  /* Full return slip */
  return (
    <div className="space-y-4">
      <HealthSection
        title="RHU Return Slip"
        icon={<ShieldCheck size={14} />}
        accent="emerald"
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <FormField
            label="Date Received"
            value={referral.feedback.dateOfReceipt || "—"}
          />
          <FormField
            label="Time Received"
            value={referral.feedback.timeOfReceipt || "—"}
          />
          <FormField
            label="Receiving Facility"
            value={referral.feedback.receivingFacility || "Rural Health Unit"}
          />
          <FormField
            label="Receiving Practitioner"
            value={referral.feedback.receivingPractitioner || "RHU Staff"}
          />
        </div>
      </HealthSection>

      <HealthSection
        title="RHU Assessment / Diagnosis"
        icon={<Activity size={14} />}
      >
        <ClinicalBlock
          value={referral.feedback.rhuDiagnosis || "No RHU diagnosis recorded."}
        />
      </HealthSection>

      <HealthSection
        title="Actions Taken / Recommendations"
        icon={<CheckCircle2 size={14} />}
        accent="emerald"
      >
        <ClinicalBlock
          value={
            referral.feedback.actionsTaken ||
            "No actions or recommendations recorded."
          }
        />
      </HealthSection>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 4 — REFERRAL TIMELINE
═══════════════════════════════════════════════════ */
function TabTimeline({ referral }) {
  const isNoShow = referral.status === "No-Show";

  const steps = [
    {
      label: "Pending RHU Review",
      desc: "Referral submitted and awaiting receipt at the destination facility.",
      color: "slate",
      active: referral.status === "Pending RHU Review",
      done: !["Pending RHU Review", "No-Show"].includes(referral.status),
      failed: isNoShow,
    },
    {
      label: "Received by RHU",
      desc: "Patient and referral documents received by the receiving facility.",
      color: "blue",
      active: referral.status === "Received by RHU",
      done: ["Under Assessment", "Completed"].includes(referral.status),
      failed: isNoShow,
    },
    {
      label: "Under Assessment",
      desc: "Patient is being evaluated by the RHU medical team.",
      color: "amber",
      active: referral.status === "Under Assessment",
      done: referral.status === "Completed",
      failed: isNoShow,
    },
    {
      label: "Completed",
      desc: "RHU has finalized assessment and submitted the return slip.",
      color: "emerald",
      active: referral.status === "Completed",
      done: referral.status === "Completed",
      failed: false,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-6 flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Clock size={14} />
        </div>
        <h2 className="text-sm font-bold text-slate-800">Referral Progress</h2>
        {isNoShow && (
          <span className="ml-2 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
            Patient Did Not Arrive
          </span>
        )}
      </div>

      <div className="relative">
        {steps.map((step, i) => (
          <div key={step.label}>
            {/* The step row */}
            <div className="flex gap-4">
              {/* Dot + line column */}
              <div className="flex flex-col items-center">
                <TimelineDot step={step} />
                {i < steps.length - 1 && <TimelineLine step={step} />}
              </div>
              {/* Content */}
              <div className={`pb-6 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <p
                  className={`text-sm font-bold ${
                    step.failed
                      ? "text-red-600"
                      : step.done
                        ? "text-emerald-700"
                        : step.active
                          ? "text-blue-700"
                          : "text-slate-300"
                  }`}
                >
                  {step.label}
                </p>
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    step.done || step.active
                      ? "text-slate-500"
                      : "text-slate-300"
                  }`}
                >
                  {step.desc}
                </p>
                {step.active && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-600">
                    <span className="pulse-soft h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Current
                  </span>
                )}
                {step.done && !step.failed && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-600">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5L4.5 7.5L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Done
                  </span>
                )}
                {step.failed && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase text-red-600">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 2L8 8M8 2L2 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    No-Show
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SHARED SUB-COMPONENTS
──────────────────────────────────────────── */

function HealthSection({ title, icon, children, accent }) {
  const accentBorder = {
    blue: "border-l-blue-500",
    amber: "border-l-amber-400",
    emerald: "border-l-emerald-400",
  };
  const accentIconBg = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm ${
        accent ? `border-l-4 ${accentBorder[accent]}` : ""
      }`}
    >
      <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent ? accentIconBg[accent] : "bg-slate-100 text-slate-500"
          }`}
        >
          {icon}
        </div>
        <h2 className="text-[13px] font-bold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MetaField({ label, value, mono, isStatus, isBadge }) {
  let display = (
    <p
      className="mt-0.5 truncate text-sm font-medium text-slate-700"
      title={value}
    >
      {value || "—"}
    </p>
  );

  if (mono)
    display = (
      <p className="mt-0.5 font-mono text-sm font-bold text-[#0B2E59]">
        {value}
      </p>
    );
  if (isStatus) display = <StatusBadge status={value} />;
  if (isBadge) display = <ClassBadge value={value} />;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {display}
    </div>
  );
}

function FormField({ label, value, bold, mono, isBadge, icon }) {
  let display = (
    <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
      {value || "—"}
    </p>
  );
  if (bold)
    display = (
      <p className="mt-0.5 text-sm font-bold leading-relaxed text-slate-800">
        {value || "—"}
      </p>
    );
  if (mono)
    display = (
      <p className="mt-0.5 font-mono text-sm font-bold text-[#0B2E59]">
        {value}
      </p>
    );
  if (isBadge) display = <ClassBadge value={value} />;

  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon} {label}
      </p>
      {display}
    </div>
  );
}

function ClinicalNarrative({ value, large }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-2">
        Clinical Endorsement — Handed off to RHU
      </p>
      <p
        className={`whitespace-pre-wrap leading-relaxed text-slate-700 ${
          large ? "text-[15px] leading-7" : "text-sm leading-6"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ClinicalBlock({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div>
      {label && (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
      )}
      <div
        className={`whitespace-pre-wrap rounded-xl border p-4 text-sm leading-relaxed ${
          highlight
            ? "border-amber-200 bg-amber-50/50 font-medium text-slate-800"
            : "border-slate-100 bg-slate-50 text-slate-600"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HealthEmpty({ message, sub }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-5 py-8 text-center">
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {sub && <p className="mt-1 text-xs text-slate-300">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  const m = {
    "Pending RHU Review": "bg-slate-100 text-slate-700",
    "Received by RHU": "bg-blue-100 text-blue-700",
    "Under Assessment": "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    "No-Show": "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${m[status] || m["Pending RHU Review"]}`}
    >
      {status}
    </span>
  );
}

function ClassBadge({ value }) {
  const m = {
    "General Consultation": "bg-slate-100 text-slate-600",
    "Maternal Care": "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${m[value] || "bg-slate-100 text-slate-600"}`}
    >
      {value}
    </span>
  );
}

/* ─── Timeline Visuals ─── */
function TimelineDot({ step }) {
  let cls = "h-4 w-4 rounded-full border-2 border-slate-200 bg-white";
  if (step.failed) cls = "h-4 w-4 rounded-full bg-red-500";
  else if (step.done) cls = "h-4 w-4 rounded-full bg-emerald-500";
  else if (step.active)
    cls = "h-4 w-4 rounded-full bg-blue-500 ring-4 ring-blue-100";

  let inner = null;
  if (step.done && !step.failed) {
    inner = (
      <svg
        width="8"
        height="8"
        viewBox="0 0 10 10"
        fill="none"
        className="text-white"
      >
        <path
          d="M2 5L4.5 7.5L8 3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (step.failed) {
    inner = (
      <svg
        width="8"
        height="8"
        viewBox="0 0 10 10"
        fill="none"
        className="text-white"
      >
        <path
          d="M2 2L8 8M8 2L2 8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (step.active) {
    inner = (
      <span className="pulse-soft block h-1.5 w-1.5 rounded-full bg-white" />
    );
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center ${cls} mt-0.5`}
    >
      {inner}
    </div>
  );
}

function TimelineLine({ step }) {
  let cls = "w-px flex-1 min-h-[28px]";
  if (step.failed) cls += " bg-red-200";
  else if (step.done) cls += " bg-emerald-300";
  else cls += " bg-slate-100";
  return <div className={cls} />;
}
