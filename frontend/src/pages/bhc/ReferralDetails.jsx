import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText, Printer, RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { RefreshingIndicator, SoftLoadingArea } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../../components/ui/accordion";
import { getReferralByTrackingId, regenerateReferralQrPayload } from "../../services/referrals";
import { getPatientById } from "../../services/patientService";
import { formatDisplayValue, formatFacilityName, formatPatientName, formatReferralStatus } from "../../utils/formatters";
import ReferralReturnSlipSection from "../../components/features/patients/profile/ReferralReturnSlipSection";
import ReferralPrintSlip from "../../components/features/referrals/ReferralPrintSlip";
import ReferralQrCode from "../../components/features/referrals/ReferralQrCode";
import { getReferralAttention, getAttentionBadgeClass } from "../../utils/referralAttention";
import { getPatientRecordReturn } from "../../utils/profileNavigation";
import { queryKeys } from "../../utils/queryKeys";

const OFFICIAL_REFERRAL_STATUSES = ["Pending", "Received", "Completed", "No-Show"];

export default function ReferralDetails() {
  const { trackingId } = useParams();
  const location = useLocation();
  const [qrRefreshKey, setQrRefreshKey] = useState(0);
  const [qrRegenerating, setQrRegenerating] = useState(false);
  const [qrMessage, setQrMessage] = useState("");
  const { data: details, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.referralDetails("bhc", trackingId),
    queryFn: async () => {
      const found = await getReferralByTrackingId(trackingId);
      const linkedPatient = found?.patientId ? await getPatientById(found.patientId) : null;
      return { referral: found, patient: linkedPatient };
    },
    enabled: Boolean(trackingId),
  });

  const referral = details?.referral || null;
  const patient = details?.patient || null;
  const loading = isLoading && !details;
  const detailsUpdating = isFetching && !loading && Boolean(referral);
  const origin = location.state?.patientProfile;
  const patientReturn = getPatientRecordReturn(location, referral?.patientId);
  const fromPatient = Boolean(origin?.path?.startsWith("/bhc/patients/") && patientReturn.path === origin.path);
  const back = fromPatient ? patientReturn : { path: "/bhc/referrals", state: null };
  const backLabel = fromPatient ? "Back to Patient" : "Back to Referrals";

  async function handleRegenerateQr() {
    if (!referral?.id || qrRegenerating) return;
    const confirmed = window.confirm(
      "Regenerate QR Code?\n\nThe previous QR code will stop working.",
    );
    if (!confirmed) return;

    setQrRegenerating(true);
    setQrMessage("");
    try {
      await regenerateReferralQrPayload(referral.id);
      setQrRefreshKey((current) => current + 1);
      setQrMessage("A new secure QR code is ready. The previous code no longer works.");
    } catch (error) {
      setQrMessage(
        error?.status === 429
          ? "Too many regeneration attempts. Please wait briefly and try again."
          : "Unable to regenerate the QR code. Please try again.",
      );
    } finally {
      setQrRegenerating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Referral Details">
        <SoftLoadingArea skeleton="details" isLoading message="Loading referral details..." minHeight="min-h-[520px]">
          <div className="min-h-[520px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (!referral) {
    return (
      <DashboardLayout role="bhc" title="Referral Not Found">
        <div className="mx-auto max-w-lg py-20 text-center">
          <AlertTriangle className="mx-auto mb-4 text-neutral-500" size={28} />
          <h1 className="text-xl font-bold text-ink-900">Referral Not Found</h1>
          <p className="mt-2 text-sm text-neutral-600">The referral record you are looking for does not exist or the link is broken.</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to={back.path} state={back.state}><ArrowLeft size={15} />{backLabel}</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Referral Details">
      <div className="min-w-0 space-y-3 print:hidden">
        <Button asChild variant="link" size="compact" className="px-0">
          <Link to={back.path} state={back.state}><ArrowLeft size={15} />{backLabel}</Link>
        </Button>
        <article className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <ReferralHeader referral={referral} patient={patient} isUpdating={detailsUpdating} />
          <section aria-labelledby="verification-title" className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:p-5">
            <ReferralQrCode referralId={referral.id} refreshKey={qrRefreshKey} size={128}
              className="h-36 w-36 shrink-0 self-start rounded-lg border border-neutral-200 p-2"
              imageClassName="h-32 w-32" />
            <div className="min-w-0 flex-1">
              <h2 id="verification-title" className="text-sm font-semibold text-ink-900">Referral Verification Slip</h2>
              <p className="mt-1 max-w-prose text-sm text-neutral-600">Present the secure QR code to the receiving RHU for verification.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="brand" size="sm" onClick={() => window.print()} disabled={qrRegenerating}>
                  <Printer size={15} />Print Referral Slip
                </Button>
                <Button variant="secondary" size="sm" onClick={handleRegenerateQr} disabled={qrRegenerating}>
                  <RefreshCw size={14} className={qrRegenerating ? "animate-spin" : ""} />
                  {qrRegenerating ? "Regenerating..." : "Regenerate QR"}
                </Button>
              </div>
              {qrMessage && <p role="status" className="mt-2 text-sm text-neutral-600">{qrMessage}</p>}
            </div>
          </section>
          <ClinicalInformationSent referral={referral} />
          <ReferralReturnSlipSection referral={referral} />
        </article>
      </div>
      <ReferralPrintSlip referral={referral} patient={patient} printOnly qrRefreshKey={qrRefreshKey} />
    </DashboardLayout>
  );
}

function ReferralHeader({ referral, patient, isUpdating }) {
  const urgency = getReferralAttention(referral);
  return (
    <header className="border-b border-neutral-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-ink-900">{getPatientName(referral, patient)}</h1>
          <p className="mt-1 break-all font-mono text-xs text-neutral-600">{referral.trackingId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={referral.status} />
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAttentionBadgeClass(urgency)}`}>{urgency}</span>
          {isUpdating && <RefreshingIndicator label="Updating referral details..." />}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Detail label="Referral Date" value={formatDateTime(getReferralDate(referral))} />
        <Detail label="Referring BHC" value={getReferringHci(referral, patient)} />
        <Detail label="Receiving RHU" value={getDestinationFacility(referral)} />
      </dl>
    </header>
  );
}

// Only persisted referral fields belong here. The linked Health Record is a
// separate source, never a fallback for missing historical referral values.
function ClinicalInformationSent({ referral }) {
  const sourceRecordId = referral.healthRecordId || referral.health_record_id;
  return (
    <Accordion type="single" collapsible defaultValue="clinical" className="border-b border-neutral-200">
      <AccordionItem value="clinical">
        <AccordionTrigger className="rounded-none px-4 text-ink-900 sm:px-5">Clinical Information Sent</AccordionTrigger>
        <AccordionContent className="px-4 sm:px-5">
          <p className="mb-4 text-xs text-neutral-600">Information saved with this referral.</p>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="Reason for Referral" value={referral.reasonForReferral || referral.reason_for_referral || referral.referralReason} empty="Not recorded with this referral." />
            <Detail label="Chief Complaint" value={referral.chiefComplaint || referral.chief_complaint} empty="Not recorded with this referral." />
            <Detail label="Initial Assessment" value={referral.initialDiagnosis || referral.initial_diagnosis} empty="Not recorded with this referral.">
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">Assessment as recorded. Suspected concerns are not confirmed diagnoses. Confirmation status was not saved separately with this referral.</p>
            </Detail>
            <Detail label="Initial Action Taken" value={referral.initialActionsTaken || referral.initial_action_taken} empty="Not recorded with this referral." />
          </dl>
          {sourceRecordId ? (
            <Button asChild variant="link" size="compact" className="mt-3 px-0">
              <Link to={`/bhc/health-records/${encodeURIComponent(sourceRecordId)}`}><FileText size={14} />View Source Health Record</Link>
            </Button>
          ) : <p className="mt-4 text-xs text-neutral-600">No source Health Record linked.</p>}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Detail({ label, value, empty = "Not recorded", children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-neutral-600">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">{formatDisplayValue(value, empty)}{children}</dd>
    </div>
  );
}

function StatusBadge({ status }) {
  const officialStatus = getOfficialStatus(status);
  const displayStatus = formatReferralStatus(officialStatus);
  const map = {
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        map[displayStatus] || map.Pending
      }`}
    >
      {displayStatus}
    </span>
  );
}

function getOfficialStatus(status) {
  const raw = String(status || "Pending").trim();
  if (OFFICIAL_REFERRAL_STATUSES.includes(raw)) return raw;

  const lower = raw.toLowerCase();
  if (lower.includes("assessment") || lower.includes("monitoring")) return "Received";
  if (lower.includes("received")) return "Received";
  if (lower.includes("completed")) return "Completed";
  if (lower.includes("show")) return "No-Show";
  return raw;
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
    referral.referralDateTime ||
    referral.referral_datetime ||
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
