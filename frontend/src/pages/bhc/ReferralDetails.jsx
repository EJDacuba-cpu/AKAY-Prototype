import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  QrCode,
  Stethoscope,
  User,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { getReferralByTrackingId } from "../../services/referrals";
import { getPatientById } from "../../services/patientService";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

const TABS = [
  { key: "record", label: "Referral Record", icon: ClipboardList },
  { key: "returnSlip", label: "RHU Return Slip", icon: MessageSquare },
  { key: "timeline", label: "Referral Timeline", icon: Clock },
];

const OFFICIAL_REFERRAL_STATUSES = [
  "Pending",
  "Received",
  "For Monitoring",
  "Completed",
  "No-Show",
];

const stagger = (index) => ({ animationDelay: `${index * 55}ms` });

export default function ReferralDetails() {
  const { trackingId } = useParams();
  const [referral, setReferral] = useState(null);
  const [patient, setPatient] = useState(null);
  const [activeTab, setActiveTab] = useState("record");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadReferral() {
      setLoading(true);
      setNotFound(false);

      try {
        const found = await getReferralByTrackingId(trackingId);

        if (!found) {
          if (!active) return;
          setReferral(null);
          setPatient(null);
          setNotFound(true);
          return;
        }

        const linkedPatient = found.patientId
          ? await getPatientById(found.patientId)
          : null;

        if (!active) return;
        setReferral(found);
        setPatient(linkedPatient);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setReferral(null);
        setPatient(null);
        setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReferral();

    return () => {
      active = false;
    };
  }, [trackingId]);

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Referral Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading referral details...
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !referral) {
    return (
      <DashboardLayout role="bhc" title="Referral Not Found">
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
            <ArrowLeft size={15} />
            Back to Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Referral Details">
      <style>{keyframes}</style>

      <div className="anim-fade-up mb-3" style={stagger(0)}>
        <Link
          to="/bhc/referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0B2E59]"
        >
          <ArrowLeft size={15} />
          Back to Referrals
        </Link>
      </div>

      <ReferralHeader referral={referral} patient={patient} />

      <div
        className="anim-fade-up mb-5 border-b border-slate-200"
        style={stagger(2)}
      >
        <nav className="-mb-px flex overflow-x-auto" role="tablist">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-[#0B2E59] text-[#0B2E59]"
                    : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="anim-fade-up min-w-0" style={stagger(3)}>
          {activeTab === "record" && (
            <ReferralRecord referral={referral} patient={patient} />
          )}
          {activeTab === "returnSlip" && <ReturnSlipTab referral={referral} />}
          {activeTab === "timeline" && <TimelineTab referral={referral} />}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <SystemReference referral={referral} />
          <ReferralStatusPanel referral={referral} />
          <BhcActionsPanel
            referral={referral}
            onViewReturnSlip={() => setActiveTab("returnSlip")}
          />
        </aside>
      </div>
    </DashboardLayout>
  );
}

function ReferralHeader({ referral, patient }) {
  const referralDate = getReferralDate(referral);

  return (
    <header
      className="anim-fade-up mb-5 border-b border-slate-200 pb-5"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#0B2E59]">
              {getPatientName(referral, patient)}
            </h1>
            <StatusBadge status={referral.status} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <InfoChip
              icon={<User size={12} />}
              value={getAgeSex(referral, patient)}
            />
            <InfoChip
              icon={<Phone size={12} />}
              value={getContact(referral, patient)}
            />
            <InfoChip value={getPatientClassification(referral, patient)} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderDetail label="Tracking ID" value={referral.trackingId} mono />
        <HeaderDetail
          label="Date / Time of Referral"
          value={`${formatDate(referralDate)} - ${formatTime(referralDate)}`}
        />
        <HeaderDetail
          label="Referring HCI"
          value={getReferringHci(referral, patient)}
        />
        <HeaderDetail
          label="Destination Facility"
          value={getDestinationFacility(referral)}
        />
        <HeaderDetail
          label="Referral Category"
          value={getReferralCategory(referral)}
        />
        <HeaderDetail
          label="PhilHealth Acct No."
          value={getPhilHealth(referral, patient)}
        />
        <HeaderDetail
          label="Referring Practitioner"
          value={getReferringPractitioner(referral)}
        />
      </div>
    </header>
  );
}

function ReferralRecord({ referral, patient }) {
  const referralDate = getReferralDate(referral);

  return (
    <div className="space-y-4">
      <RecordSection
        title="Patient Demographics"
        description="Patient details captured in the original referral."
        icon={<User size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Name of Patient" value={getPatientName(referral, patient)} strong />
          <Detail label="Date of Birth" value={getBirthDate(referral, patient)} />
          <Detail
            label="Age / Sex / Civil Status"
            value={getAgeSexCivil(referral, patient)}
          />
          <Detail
            label="Address"
            value={getPatientAddress(referral, patient)}
            icon={<MapPin size={12} />}
          />
          <Detail
            label="Contact Number"
            value={getContact(referral, patient)}
          />
          <Detail
            label="Patient Classification"
            value={getPatientClassification(referral, patient)}
            badge
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Referral Information"
        description="BHC referral form and routing details."
        icon={<ClipboardList size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Tracking ID" value={referral.trackingId} mono />
          <Detail label="Referral Category" value={getReferralCategory(referral)} badge />
          <Detail label="Date of Referral" value={formatDate(referralDate)} />
          <Detail label="Time of Referral" value={formatTime(referralDate)} />
          <Detail
            label="Referring HCI"
            value={getReferringHci(referral, patient)}
            icon={<Building2 size={12} />}
          />
          <Detail
            label="Destination Facility"
            value={getDestinationFacility(referral)}
            icon={<Building2 size={12} />}
          />
          <Detail
            label="Referring Practitioner"
            value={getReferringPractitioner(referral)}
          />
          <Detail
            label="Urgency"
            value={getReferralUrgency(referral)}
            badge
          />
          <Detail
            label="Preferred RHU Doctor"
            value={
              referral.preferredRhuDoctorName ||
              referral.preferredDoctor ||
              "RHU to assign"
            }
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Clinical Summary"
        description="Clinical basis sent by the BHC for RHU assessment."
        icon={<Stethoscope size={14} />}
      >
        <div className="space-y-4">
          <NarrativeBlock
            label="Chief Complaint / Concern"
            value={referral.chiefComplaint || referral.concern}
            empty="No chief complaint recorded."
          />
          <NarrativeBlock
            label="Clinical Summary"
            value={
              referral.clinicalSummary ||
              referral.summaryOfPresentIllness ||
              referral.physicalExamination
            }
            empty="No clinical summary recorded."
          />
          <NarrativeBlock
            label="Initial Diagnosis / Assessment"
            value={referral.initialDiagnosis || referral.diagnosis}
            empty="No initial diagnosis recorded."
          />
          <NarrativeBlock
            label="Initial Actions Taken"
            value={referral.initialActionsTaken || referral.actionsTaken}
            empty="No initial actions recorded."
          />
          <NarrativeBlock
            label="Reason for Referral"
            value={referral.reasonForReferral || referral.referralReason}
            empty="No reason for referral recorded."
          />
        </div>
      </RecordSection>
    </div>
  );
}

function ReturnSlipTab({ referral }) {
  const feedback = referral.feedback || referral.returnSlip;

  if (!feedback) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <MessageSquare size={26} />
        </div>
        <h2 className="text-sm font-bold text-slate-700">
          No RHU Return Slip yet.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
          RHU feedback will appear here after assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RecordSection title="Receiving Details" icon={<CheckCircle2 size={14} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Date Received" value={feedback.dateOfReceipt} />
          <Detail label="Time Received" value={feedback.timeOfReceipt} />
          <Detail
            label="Receiving Facility"
            value={feedback.receivingFacility || getDestinationFacility(referral)}
          />
          <Detail
            label="Receiving Personnel"
            value={feedback.receivingPractitioner || feedback.receivingPersonnel}
          />
          <Detail
            label="Submitted At"
            value={formatDateTime(feedback.submittedAt)}
          />
          <Detail
            label="Submitted By"
            value={
              feedback.submittedBy ||
              feedback.receivingPractitioner ||
              feedback.receivingPersonnel
            }
          />
        </div>
      </RecordSection>

      <RecordSection title="RHU Diagnosis / Findings" icon={<Activity size={14} />}>
        <Narrative
          value={feedback.rhuDiagnosis}
          empty="No RHU diagnosis or findings recorded."
        />
      </RecordSection>

      <RecordSection title="Actions Taken" icon={<CheckCircle2 size={14} />}>
        <Narrative
          value={feedback.actionsTaken}
          empty="No RHU actions recorded."
        />
      </RecordSection>

      <RecordSection
        title="RHU Assessment Outcome / Recommendation"
        icon={<FileText size={14} />}
      >
        <Narrative
          value={[
            feedback.assessmentOutcome,
            feedback.followUpDate && `Follow-up Date: ${formatDate(feedback.followUpDate)}`,
            feedback.recommendation,
          ]
            .filter(Boolean)
            .join("\n\n")}
          empty="No RHU assessment outcome recorded."
        />
      </RecordSection>

      <RecordSection
        title="Remarks / Instructions to BHC"
        icon={<MessageSquare size={14} />}
      >
        <Narrative
          value={feedback.remarks}
          empty="No additional notes recorded."
        />
      </RecordSection>
    </div>
  );
}

function TimelineTab({ referral }) {
  const items = [
    [
      "Referral Submitted",
      referral.createdAt || referral.dateOfReferral || referral.referralDate,
    ],
    ["Received by RHU", referral.receivedAt],
    ["For Monitoring", referral.monitoringStartedAt],
    ["Return Slip Submitted", referral.feedback?.submittedAt],
    ["Completed", referral.completedAt],
  ];

  if (referral.noShowAt) {
    items.splice(1, 0, ["No-Show", referral.noShowAt]);
  }

  return (
    <RecordSection
      title="Referral Timeline"
      description="Read-only BHC view of RHU tracking updates."
      icon={<Clock size={14} />}
    >
      <div className="space-y-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                value ? "bg-[#0B2E59]" : "bg-slate-200"
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-[10.5px] text-slate-400">
                {value ? formatDateTime(value) : "Pending"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </RecordSection>
  );
}

function SystemReference({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-[13px] font-bold text-slate-800">
          System Reference
        </h2>
        <p className="text-[10.5px] text-slate-400">QR code and tracking ID</p>
      </div>
      <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50">
        <QrCode size={56} className="text-[#0B2E59]/60" />
      </div>
      <p className="text-center font-mono text-xs font-bold text-[#0B2E59]">
        {referral.trackingId}
      </p>
    </section>
  );
}

function ReferralStatusPanel({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold text-slate-800">
        Referral Status
      </h2>
      <StatusBadge status={referral.status} />
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {getStatusDescription(referral)}
      </p>
    </section>
  );
}

function BhcActionsPanel({ referral, onViewReturnSlip }) {
  const hasReturnSlip = !!(referral.feedback || referral.returnSlip);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="mb-3 px-1 text-[13px] font-bold text-slate-800">
        BHC Actions
      </h2>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Printer size={14} />
          Print Referral Slip
        </button>
        <Link
          to={`/bhc/referrals/${referral.trackingId}/qr`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#092347]"
        >
          <QrCode size={14} />
          Open Full QR Code
        </Link>
        {hasReturnSlip && (
          <button
            type="button"
            onClick={onViewReturnSlip}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <FileText size={14} />
            View / Print Return Slip
          </button>
        )}
      </div>
    </section>
  );
}

function HeaderDetail({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold text-slate-700 ${
          mono ? "font-mono text-[#0B2E59]" : ""
        }`}
        title={value || "Not recorded"}
      >
        {value || "Not recorded"}
      </p>
    </div>
  );
}

function InfoChip({ icon, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      {value || "Not recorded"}
    </span>
  );
}

function RecordSection({ title, description, icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
          {icon}
        </div>
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value, icon, strong, mono, badge }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </p>
      {badge ? (
        <ClassBadge value={value} />
      ) : (
        <p
          className={`mt-1 leading-relaxed ${
            mono
              ? "font-mono text-sm font-bold text-[#0B2E59]"
              : strong
                ? "text-sm font-bold text-slate-800"
                : "text-sm text-slate-700"
          }`}
        >
          {value || "Not recorded"}
        </p>
      )}
    </div>
  );
}

function NarrativeBlock({ label, value, empty }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <Narrative value={value} empty={empty} />
    </div>
  );
}

function Narrative({ value, empty }) {
  return (
    <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
      {value || empty}
    </div>
  );
}

function StatusBadge({ status }) {
  const officialStatus = getOfficialStatus(status);
  const map = {
    Pending: "bg-slate-100 text-slate-700",
    Received: "bg-blue-100 text-blue-700",
    "For Monitoring": "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    "No-Show": "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
        map[officialStatus] || map.Pending
      }`}
    >
      {officialStatus}
    </span>
  );
}

function ClassBadge({ value }) {
  const map = {
    A1: "bg-blue-100 text-blue-700",
    A2: "bg-blue-100 text-blue-700",
    B1: "bg-amber-100 text-amber-700",
    B2: "bg-amber-100 text-amber-700",
    C1: "bg-red-100 text-red-700",
    C2: "bg-red-100 text-red-700",
    Unclassified: "bg-slate-100 text-slate-600",
    Maternal: "bg-pink-100 text-pink-700",
    "Maternal Care": "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
    "General Consultation": "bg-blue-100 text-blue-700",
    Emergency: "bg-red-100 text-red-700",
    Urgent: "bg-amber-100 text-amber-700",
    "Non-Urgent": "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`mt-1 inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {value || "Not recorded"}
    </span>
  );
}

function getOfficialStatus(status) {
  const raw = String(status || "Pending").trim();
  if (OFFICIAL_REFERRAL_STATUSES.includes(raw)) return raw;

  const lower = raw.toLowerCase();
  if (lower.includes("assessment") || lower.includes("monitoring")) {
    return "For Monitoring";
  }
  if (lower.includes("received")) return "Received";
  if (lower.includes("completed")) return "Completed";
  if (lower.includes("show")) return "No-Show";
  return "Pending";
}

function getStatusDescription(referral) {
  const status = getOfficialStatus(referral.status);
  const map = {
    Pending: "Referral was submitted by BHC and is awaiting RHU action.",
    Received: "RHU has received the patient and is reviewing the case.",
    "For Monitoring": "RHU marked this referral for monitoring before final return slip submission.",
    Completed: "RHU submitted the return slip and completed this referral.",
    "No-Show": "Patient did not arrive within the expected referral date.",
  };
  return map[status] || map.Pending;
}

function isRhuFacility(value = "") {
  return /rhu|rural health unit/i.test(String(value));
}

function cleanBarangayName(value = "") {
  return String(value).replace(/^barangay\s+/i, "").trim();
}

function getReferringHci(referral = {}, patient = null) {
  const candidates = [
    referral.referringHealthCenter,
    referral.referringBHC,
    referral.bhcName,
    referral.sourceFacility,
    referral.referringFacility,
    referral.bhc,
    referral.referringHci,
  ].filter(Boolean);

  const valid = candidates.find((item) => !isRhuFacility(item));
  if (valid) return valid;

  const barangay =
    referral.referringBarangay ||
    referral.patientBarangay ||
    referral.barangay ||
    patient?.barangay;

  return barangay
    ? `Barangay ${cleanBarangayName(barangay)} Health Center`
    : "Barangay Health Center";
}

function getDestinationFacility(referral = {}) {
  return (
    referral.destinationFacility ||
    referral.referredFacility ||
    referral.receivingFacility ||
    "Rural Health Unit Bulakan"
  );
}

function getReferralDate(referral = {}) {
  const raw =
    referral.dateOfReferral ||
    referral.referralDate ||
    referral.dateSubmitted ||
    referral.createdAt ||
    referral.date;

  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  return `${formatDate(value)} ${formatTime(value)}`;
}

function getPatientName(referral = {}, patient = null) {
  return (
    referral.patientName ||
    referral.patient ||
    patient?.name ||
    [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") ||
    "Unknown Patient"
  );
}

function getAgeSex(referral = {}, patient = null) {
  if (referral.ageSex) return referral.ageSex;
  if (patient?.ageSex) return patient.ageSex;
  return [referral.age || patient?.age, referral.sex || patient?.sex]
    .filter(Boolean)
    .join(" / ");
}

function getAgeSexCivil(referral = {}, patient = null) {
  return [
    getAgeSex(referral, patient),
    referral.civilStatus || referral.civil_status || patient?.civilStatus,
  ]
    .filter(Boolean)
    .join(" / ");
}

function getContact(referral = {}, patient = null) {
  return (
    referral.contactNumber ||
    referral.contact ||
    referral.patientContact ||
    patient?.contactNumber ||
    patient?.contact ||
    ""
  );
}

function getPatientClassification(referral = {}, patient = null) {
  return (
    referral.patientClassification ||
    referral.classification ||
    patient?.patientClassification ||
    patient?.category ||
    referral.category ||
    "General Consultation"
  );
}

function getReferralCategory(referral = {}) {
  return referral.referralCategory || referral.category || "Unclassified";
}

function getReferralUrgency(referral = {}) {
  const raw =
    referral.urgency ||
    referral.priorityLevel ||
    referral.priority ||
    "Non-Urgent";

  const map = {
    High: "Emergency",
    Medium: "Urgent",
    Normal: "Non-Urgent",
  };

  return map[raw] || raw;
}

function getBirthDate(referral = {}, patient = null) {
  return referral.birthDate || referral.dateOfBirth || patient?.birthDate || "";
}

function getPatientAddress(referral = {}, patient = null) {
  const patientAddress = patient
    ? [patient.address, patient.barangay, patient.municipality]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    referral.patientAddress ||
    referral.address ||
    [referral.street, referral.barangay, referral.municipality]
      .filter(Boolean)
      .join(", ") ||
    patientAddress ||
    ""
  );
}

function getPhilHealth(referral = {}, patient = null) {
  return (
    referral.philHealth ||
    referral.philHealthNumber ||
    referral.philhealthNumber ||
    patient?.philHealth ||
    patient?.philHealthNumber ||
    ""
  );
}

function getReferringPractitioner(referral = {}) {
  return (
    referral.practitioner ||
    referral.referringPractitioner ||
    referral.attendingStaff ||
    "BHC Staff"
  );
}
