import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileText,
  MapPin,
  Phone,
  QrCode,
  Stethoscope,
  User,
  UserCheck,
  UserX,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getReferrals,
  updateReferralByTrackingId,
} from "../../services/referrals";
import {
  getRhuPatientById,
  linkReferralPatientToRhu,
} from "../../services/patientService";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

const OFFICIAL_REFERRAL_STATUSES = [
  "Pending",
  "Received",
  "For Monitoring",
  "Completed",
  "No-Show",
];

const stagger = (index) => ({ animationDelay: `${index * 55}ms` });

export default function RHUReferralDetails() {
  const { trackingId } = useParams();
  const [referral, setReferral] = useState(null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReferral() {
      setLoading(true);
      setNotFound(false);

      try {
        const referrals = await getReferrals();
        const found = referrals.find(
          (item) => item.trackingId === trackingId || item.id === trackingId,
        );

        if (!found) {
          if (!active) return;
          setReferral(null);
          setPatient(null);
          setNotFound(true);
          return;
        }

        const linkedPatient = found.patientId
          ? await getRhuPatientById(found.patientId)
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

  async function applyStatus(nextStatus, extra = {}) {
    if (!referral || busy) return;
    setBusy(true);
    setMessage("");

    try {
      let patientId = referral.patientId;

      if (nextStatus === "Received") {
        patientId = await linkReferralPatientToRhu(referral);
      }

      const updated = await updateReferralByTrackingId(referral.trackingId, {
        status: nextStatus,
        patientId,
        ...extra,
      });

      if (updated) {
        setReferral(updated);

        if (patientId) {
          setPatient(await getRhuPatientById(patientId));
        }

        setMessage(getStatusMessage(nextStatus, extra));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Referral Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading referral details...
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !referral) {
    return (
      <DashboardLayout role="rhu" title="Referral Not Found">
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertTriangle size={30} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            Referral Not Found
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            No incoming referral record matches this Tracking ID.
          </p>
          <Link
            to="/rhu/incoming-referrals"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
          >
            <ArrowLeft size={15} />
            Back to Incoming Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="rhu" title="Referral Details">
      <style>{keyframes}</style>

      <div className="anim-fade-up mb-3" style={stagger(0)}>
        <Link
          to="/rhu/incoming-referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0F172A]"
        >
          <ArrowLeft size={15} />
          Back to Incoming Referrals
        </Link>
      </div>

      <ReferralHeader referral={referral} patient={patient} />

      <div
        className="anim-fade-up mb-5 border-b border-slate-200"
        style={stagger(2)}
      >
        <div className="-mb-px flex overflow-x-auto">
          <div className="flex items-center gap-2 whitespace-nowrap border-b-2 border-[#B91C1C] px-4 py-3 text-xs font-semibold text-[#0F172A]">
            <ClipboardList size={14} />
            Referral Record
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="anim-fade-up min-w-0" style={stagger(3)}>
          <ReferralRecord referral={referral} patient={patient} />
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              {message}
            </div>
          )}

          <SystemReference referral={referral} />
          <PatientProfileShortcut patient={patient} />
          <ReferralActions
            referral={referral}
            busy={busy}
            onStatusChange={applyStatus}
          />
          <StatusHistory referral={referral} />
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
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
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
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderDetail
          label="Tracking ID"
          value={referral.trackingId || referral.id}
          mono
        />
        <HeaderDetail
          label="Date / Time of Referral"
          value={`${formatDate(referralDate)} - ${formatTime(referralDate)}`}
        />
        <HeaderDetail
          label="Name of Referring HCI"
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

function HeaderDetail({ label, value, mono }) {
  const displayValue = formatDisplayValue(value, "Not recorded");

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold text-slate-700 ${
          mono ? "font-mono text-[#0F172A]" : ""
        }`}
        title={displayValue}
      >
        {displayValue}
      </p>
    </div>
  );
}

function ReferralRecord({ referral, patient }) {
  const referralDate = getReferralDate(referral);

  return (
    <div className="space-y-4">
      <RecordSection
        title="Patient Demographics"
        description="Basic patient details from the current referral record."
        icon={<User size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Detail
            label="Date of Birth"
            value={getBirthDate(referral, patient)}
          />
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
            icon={<Phone size={12} />}
          />
          <Detail
            label="PhilHealth Category"
            value={getPhilHealthCategory(referral, patient)}
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Referral Information"
        description="Official BHC-RHU referral form details for this tracking ID."
        icon={<ClipboardList size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Detail
            label="Referral Category"
            value={getReferralCategory(referral)}
            badge
          />
          <Detail label="Date of Referral" value={formatDate(referralDate)} />
          <Detail label="Time of Referral" value={formatTime(referralDate)} />
          <Detail
            label="Name of Referring HCI"
            value={getReferringHci(referral, patient)}
          />
          <Detail
            label="Destination Facility"
            value={getDestinationFacility(referral)}
          />
          <Detail
            label="PhilHealth Acct No."
            value={getPhilHealth(referral, patient)}
          />
          <Detail
            label="Name and Signature of Referring Practitioner"
            value={getReferringPractitioner(referral)}
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Clinical Data"
        description="Clinical basis and reason for this BHC-RHU referral."
        icon={<Stethoscope size={14} />}
      >
        <div className="space-y-4">
          <NarrativeBlock
            label="Chief Complaint"
            value={referral.chiefComplaint || referral.concern}
            empty="No chief complaint recorded."
          />
          <NarrativeBlock
            label="Summary of Present Illness and Physical Examination"
            value={
              referral.summaryOfPresentIllness ||
              referral.physicalExamination ||
              referral.clinicalSummary
            }
            empty="No clinical summary recorded."
          />
          <NarrativeBlock
            label="Initial Diagnosis"
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

function SystemReference({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-[13px] font-bold text-slate-800">
          Referral Tracking Details
        </h2>
        <p className="text-[10.5px] text-slate-400">QR code and tracking ID</p>
      </div>
      <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-xl border-2 border-dashed border-red-200 bg-red-50/50">
        <QrCode size={56} className="text-[#0F172A]/60" />
      </div>
      <p className="text-center font-mono text-xs font-bold text-[#0F172A]">
        {referral.trackingId}
      </p>
    </section>
  );
}

function PatientProfileShortcut({ patient }) {
  const patientId = patient?.id || patient?.patientId;

  if (!patientId) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-[13px] font-bold text-slate-800">Patient Profile</h2>
      <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
        View full RHU records and referral history in the patient profile.
      </p>
      <Link
        to={`/rhu/patients/${patientId}`}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50"
      >
        <User size={14} />
        View Patient Profile
      </Link>
    </section>
  );
}

function ReferralActions({ referral, busy, onStatusChange }) {
  const status = getOfficialStatus(referral.status);
  const button =
    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold text-slate-800">
        Referral Actions
      </h2>

      <div className="space-y-2">
        {status === "Pending" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("Received", {
                  receivedAt: new Date().toISOString(),
                })
              }
              className={`${button} bg-[#B91C1C] text-white hover:bg-[#991B1B]`}
            >
              <UserCheck size={14} />
              Receive Patient
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("No-Show", {
                  noShowAt: new Date().toISOString(),
                  previousStatus: "Pending",
                })
              }
              className={`${button} border border-red-100 bg-red-50 text-red-700 hover:bg-red-100`}
            >
              <UserX size={14} />
              Mark as No-Show
            </button>
          </>
        )}

        {status === "No-Show" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onStatusChange("Received", {
                lateArrival: true,
                previousStatus: "No-Show",
                receivedAt: new Date().toISOString(),
              })
            }
            className={`${button} bg-[#B91C1C] text-white hover:bg-[#991B1B]`}
          >
            <UserCheck size={14} />
            Receive Late Arrival
          </button>
        )}

        {status === "Received" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("For Monitoring", {
                  monitoringStartedAt: new Date().toISOString(),
                })
              }
              className={`${button} bg-[#B91C1C] text-white hover:bg-[#991B1B]`}
            >
              <Activity size={14} />
              Start Monitoring
            </button>
            <Link
              to={`/rhu/feedback/${referral.trackingId}`}
              className={`${button} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
            >
              <FileText size={14} />
              Submit Return Slip
            </Link>
          </>
        )}

        {status === "For Monitoring" && (
          <Link
            to={`/rhu/feedback/${referral.trackingId}`}
            className={`${button} bg-[#B91C1C] text-white hover:bg-[#991B1B]`}
          >
            <FileText size={14} />
            End Monitoring / Submit Return Slip
          </Link>
        )}

        {status === "Completed" && (
          <Link
            to={`/rhu/feedback/${referral.trackingId}`}
            className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <FileText size={14} />
            View Return Slip
          </Link>
        )}
      </div>
    </section>
  );
}

function StatusHistory({ referral }) {
  const items = [
    [
      "BHC Referral Submitted",
      referral.createdAt || referral.dateOfReferral || referral.referralDate,
    ],
    ["RHU Received", referral.receivedAt],
    ["RHU Assessment / Monitoring", referral.monitoringStartedAt],
    [
      "Return Slip Sent",
      referral.feedback?.submittedAt || referral.completedAt,
    ],
  ];

  if (referral.noShowAt) {
    items.splice(1, 0, ["No-Show", referral.noShowAt]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold text-slate-800">
        Referral Progress
      </h2>
      <div className="space-y-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                value ? "bg-[#B91C1C]" : "bg-slate-200"
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-[10.5px] text-slate-400">
                {value
                  ? `${formatDate(value)} ${formatTime(value)}`
                  : "Pending"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecordSection({ title, description, icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
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

function Detail({ label, value, icon, strong, badge }) {
  const displayValue = formatDisplayValue(value, "Not recorded");

  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </p>
      {badge ? (
        <ClassBadge value={displayValue} />
      ) : (
        <p
          className={`mt-1 leading-relaxed ${
            strong
              ? "text-sm font-bold text-slate-800"
              : "text-sm text-slate-700"
          }`}
        >
          {displayValue}
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
  const displayValue = formatDisplayValue(value, empty);

  return (
    <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
      {displayValue}
    </div>
  );
}

function InfoChip({ icon, value }) {
  const displayValue = formatDisplayValue(value, "Not recorded");

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      {displayValue}
    </span>
  );
}

function StatusBadge({ status }) {
  const officialStatus = getOfficialStatus(status);
  const map = {
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
        map[officialStatus] || map.Pending
      }`}
    >
      {officialStatus}
    </span>
  );
}

function ClassBadge({ value }) {
  const displayValue = formatDisplayValue(value, "Not recorded");
  const map = {
    A1: "bg-slate-100 text-slate-700",
    A2: "bg-slate-100 text-slate-700",
    B1: "bg-amber-100 text-amber-700",
    B2: "bg-amber-100 text-amber-700",
    C1: "bg-red-100 text-red-700",
    C2: "bg-red-100 text-red-700",
    Unclassified: "bg-slate-100 text-slate-600",
    Maternal: "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
    "General Consultation": "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`mt-1 inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[displayValue] || "bg-slate-100 text-slate-600"
      }`}
    >
      {displayValue}
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
  if (lower.includes("completed") || lower === "complete") return "Completed";
  if (lower.includes("show")) return "No-Show";
  return "Pending";
}

function getStatusMessage(status, extra = {}) {
  if (status === "Received" && extra.lateArrival) {
    return "Late arrival received. Referral is now marked as Received.";
  }
  if (status === "Received") return "Patient has been received by RHU.";
  if (status === "No-Show") return "Referral has been marked as No-Show.";
  if (status === "For Monitoring") {
    return "Referral status updated to For Monitoring.";
  }
  return `Referral status updated to ${status}.`;
}

function isRhuFacility(value = "") {
  return /rhu|rural health unit/i.test(String(value));
}

function cleanBarangayName(value = "") {
  return String(value)
    .replace(/^barangay\s+/i, "")
    .trim();
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
    referral.barangayHealthCenter,
    referral.barangay_health_center,
  ]
    .map((item) => formatFacilityName(item, ""))
    .filter(Boolean);

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
  return formatFacilityName(
    referral.destinationFacility ||
      referral.referredFacility ||
      referral.receivingFacility ||
      referral.rural_health_unit ||
      referral.ruralHealthUnit,
    "",
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

function getPatientName(referral = {}, patient = null) {
  return formatPatientName(
    referral.patientName || referral.patient || patient || referral,
    "Unknown Patient",
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
  return formatDisplayValue(
    referral.contactNumber ||
      referral.contact ||
      referral.patientContact ||
      patient?.contactNumber ||
      patient?.contact,
    "",
  );
}

function getReferralCategory(referral = {}) {
  return formatDisplayValue(
    referral.referralCategory || referral.category,
    "Unclassified",
  );
}

function getBirthDate(referral = {}, patient = null) {
  return (
    referral.birthDate ||
    referral.dateOfBirth ||
    patient?.birthDate ||
    patient?.dateOfBirth ||
    ""
  );
}

function getPatientAddress(referral = {}, patient = null) {
  const patientAddress = patient
    ? [
        patient.address || patient.streetAddress,
        patient.barangay,
        patient.municipality,
      ]
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

function getPhilHealthCategory(referral = {}, patient = null) {
  return formatDisplayValue(
    referral.philHealthCategory || patient?.philHealthCategory,
    "",
  );
}

function getReferringPractitioner(referral = {}) {
  return formatUserName(
    referral.practitioner ||
      referral.referringPractitioner ||
      referral.attendingStaff ||
      referral.createdBy ||
      referral.created_by,
    "BHC Staff",
  );
}
