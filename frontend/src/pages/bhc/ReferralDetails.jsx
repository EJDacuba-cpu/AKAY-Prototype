import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  MessageSquare,
  Phone,
  Printer,
  Stethoscope,
  User,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { SoftLoadingArea } from "../../components/common";
import { getReferralByTrackingId } from "../../services/referrals";
import { getPatientById } from "../../services/patientService";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatReferralStatus,
  formatUserName,
} from "../../utils/formatters";
import ReferralPrintSlip from "../../components/features/referrals/ReferralPrintSlip";
import { queryKeys } from "../../utils/queryKeys";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

const TABS = [
  { key: "clinical", label: "Clinical Summary", icon: Stethoscope },
  { key: "returnSlip", label: "RHU Return Slip", icon: MessageSquare },
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
  const [activeTab, setActiveTab] = useState("clinical");

  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.referralDetails("bhc", trackingId),
    queryFn: async () => {
      const found = await getReferralByTrackingId(trackingId);
      const linkedPatient = found?.patientId
        ? await getPatientById(found.patientId)
        : null;

      return { referral: found, patient: linkedPatient };
    },
    enabled: Boolean(trackingId),
  });

  const referral = details?.referral || null;
  const patient = details?.patient || null;
  const loading = isLoading && !details;
  const notFound = !loading && !referral;

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Referral Details">
        <SoftLoadingArea
          isLoading
          message="Loading details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </SoftLoadingArea>
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
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
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
      <SoftLoadingArea
        isLoading={isFetching && !loading}
        message="Refreshing details..."
        minHeight="min-h-[520px]"
      >

      <div className="anim-fade-up mb-3" style={stagger(0)}>
        <Link
          to="/bhc/referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0F172A]"
        >
          <ArrowLeft size={15} />
          Back to Referrals
        </Link>
      </div>

      <ReferralHeader referral={referral} patient={patient} />



      <div
        className="anim-fade-up mb-5 border-b border-slate-200"
        style={stagger(3)}
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
                    ? "border-[#B91C1C] text-[#B91C1C]"
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

      <main className="anim-fade-up min-w-0" style={stagger(4)}>
        {activeTab === "clinical" && <ClinicalSummaryTab referral={referral} />}
        {activeTab === "returnSlip" && <ReturnSlipTab referral={referral} />}
      </main>

      <ReferralPrintSlip referral={referral} patient={patient} printOnly />
      </SoftLoadingArea>
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
            <InfoChip value={getPatientClassification(referral, patient)} />
          </div>
        </div>
        
        <div className="anim-fade-up mb-5 flex justify-end" style={stagger(2)}>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <Printer size={14} />
            Print Referral Slip
          </button>
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

function ClinicalSummaryTab({ referral }) {
  return (
    <div className="space-y-4">
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
          <NarrativeBlock
            label="Notes / Remarks"
            value={referral.remarks || referral.notes}
            empty="No notes or remarks recorded."
          />
          <NarrativeBlock
            label="Referring Practitioner"
            value={getReferringPractitioner(referral)}
            empty="No referring practitioner recorded."
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
        title="RHU Return Slip Status / Instructions"
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
          empty="No RHU return slip status recorded."
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

function InfoChip({ icon, value }) {
  const displayValue = formatDisplayValue(value, "Not recorded");

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      {displayValue}
    </span>
  );
}

function RecordSection({ title, description, icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
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
            mono
              ? "font-mono text-sm font-bold text-[#0F172A]"
              : strong
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

function StatusBadge({ status }) {
  const officialStatus = getOfficialStatus(status);
  const displayStatus = formatReferralStatus(officialStatus);
  const map = {
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Done: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
        map[displayStatus] || map.Pending
      }`}
    >
      {displayStatus}
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
    "Maternal Care": "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
    "General Consultation": "bg-slate-100 text-slate-700",
    Emergency: "bg-red-100 text-red-700",
    Urgent: "bg-amber-100 text-amber-700",
    "Non-Urgent": "bg-slate-100 text-slate-600",
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
  if (lower.includes("completed")) return "Completed";
  if (lower.includes("show")) return "No-Show";
  return "Pending";
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

function formatDateTime(value) {
  if (!value) return "Not recorded";
  return `${formatDate(value)} ${formatTime(value)}`;
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

function getPatientClassification(referral = {}, patient = null) {
  return formatDisplayValue(
    referral.patientClassification ||
      referral.classification ||
      patient?.patientClassification ||
      patient?.category ||
      referral.category,
    "General Consultation",
  );
}

function getReferralCategory(referral = {}) {
  return formatDisplayValue(
    referral.referralCategory || referral.category,
    "Unclassified",
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
  return formatUserName(
    referral.practitioner ||
      referral.referringPractitioner ||
      referral.attendingStaff ||
      referral.createdBy ||
      referral.created_by,
    "BHC Staff",
  );
}
