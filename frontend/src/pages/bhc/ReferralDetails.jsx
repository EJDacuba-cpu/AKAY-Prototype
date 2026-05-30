import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
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
  UserCheck,
} from "lucide-react";
import { Link, useParams } from "react-router";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getReferrals,
  updateReferralByTrackingId,
} from "../../services/referrals";
import { getPatientById } from "../../services/patientService";
import {
  formatDoctorAvailabilityDate,
  normalizeDoctorAvailability,
} from "../../services/doctorAvailability";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

const stagger = (i) => ({ animationDelay: `${i * 55}ms` });

const RHU_TABS = [
  { key: "referral", label: "Referral Information", icon: ClipboardList },
  { key: "clinical", label: "Clinical Summary", icon: Stethoscope },
  { key: "feedback", label: "RHU Feedback", icon: MessageSquare },
];

const BHC_TABS = [
  ...RHU_TABS,
  { key: "timeline", label: "Referral Timeline", icon: Clock },
];

export default function ReferralDetails({ role = "bhc" }) {
  const { trackingId } = useParams();
  const [referral, setReferral] = useState(null);
  const [patientExtra, setPatientExtra] = useState(null);
  const [activeTab, setActiveTab] = useState("referral");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const isRhu = role === "rhu";
  const backHref = isRhu ? "/rhu/incoming-referrals" : "/bhc/referrals";
  const backLabel = isRhu ? "Back to Incoming Referrals" : "Back to Referrals";
  const tabs = isRhu ? RHU_TABS : BHC_TABS;

  useEffect(() => {
    let active = true;

    async function loadReferral() {
      setLoading(true);
      setNotFound(false);

      try {
        const all = await getReferrals();
        const found = (all || []).find(
          (item) => item.trackingId === trackingId || item.id === trackingId,
        );

        if (!found) {
          if (!active) return;
          setReferral(null);
          setPatientExtra(null);
          setNotFound(true);
          return;
        }

        const patient = found.patientId
          ? await getPatientById(found.patientId)
          : null;

        if (!active) return;
        setReferral(found);
        setPatientExtra(patient);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setReferral(null);
        setPatientExtra(null);
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

  async function updateReferralStatus(nextStatus, extraChanges = {}) {
    if (!referral || statusBusy) return;

    setStatusBusy(true);
    setStatusMessage("");

    try {
      const updated = await updateReferralByTrackingId(referral.trackingId, {
        status: nextStatus,
        ...extraChanges,
      });

      if (updated) {
        setReferral(updated);
        setStatusMessage(`Referral status updated to ${nextStatus}.`);
      }
    } finally {
      setStatusBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role={role} title="Referral Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading referral details...
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !referral) {
    return (
      <DashboardLayout role={role} title="Referral Not Found">
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
            to={backHref}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#0B2E59] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#092347]"
          >
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role} title="Referral Details">
      <style>{keyframes}</style>

      <div className="anim-fade-up mb-4" style={stagger(0)}>
        <Link
          to={backHref}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0B2E59]"
        >
          <ArrowLeft size={15} />
          {backLabel}
        </Link>
      </div>

      <ReferralHeader referral={referral} patientExtra={patientExtra} />

      <div
        className="anim-fade-up mb-5 border-b border-slate-200"
        style={stagger(2)}
      >
        <nav className="-mb-px flex overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  isActive
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
          {activeTab === "referral" && (
            <ReferralInformationTab
              referral={referral}
              patientExtra={patientExtra}
            />
          )}

          {activeTab === "clinical" && (
            <ClinicalSummaryTab referral={referral} />
          )}

          {activeTab === "feedback" && <RhuFeedbackTab referral={referral} />}

          {!isRhu && activeTab === "timeline" && (
            <TimelineTab referral={referral} />
          )}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          {isRhu && statusMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              {statusMessage}
            </div>
          )}

          {isRhu ? (
            <>
              <WorkflowPanel
                referral={referral}
                busy={statusBusy}
                onStatusChange={updateReferralStatus}
              />
              <ReferralProgressPanel referral={referral} />
              <QRCodePanel referral={referral} />
            </>
          ) : (
            <>
              <QRCodePanel referral={referral} />
              <BhcActionsPanel referral={referral} />
            </>
          )}
        </aside>
      </div>
    </DashboardLayout>
  );
}

function ReferralHeader({ referral, patientExtra }) {
  const patientName = getPatientName(referral, patientExtra);
  const contactNumber = getContactNumber(referral, patientExtra);
  const classification = getClassification(referral, patientExtra);
  const referralDate = getReferralDate(referral);
  const referringFacility = getReferringFacility(referral, patientExtra);
  const destinationFacility = getDestinationFacility(referral);

  return (
    <header
      className="anim-fade-up mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#0B2E59]">
              {patientName}
            </h1>
            <StatusBadge status={referral.status} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <HeaderChip icon={<User size={12} />} value={getAgeSex(referral, patientExtra)} />
            <HeaderChip icon={<Phone size={12} />} value={contactNumber} />
            <HeaderChip value={classification} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-mono font-semibold text-[#0B2E59]">
              {referral.trackingId}
            </span>
            <span className="text-slate-300">/</span>
            <span>
              {formatDate(referralDate)} at {formatTime(referralDate)}
            </span>
            <span className="text-slate-300">/</span>
            <span>
              {referringFacility} to {destinationFacility}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderChip({ icon, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      {value || "Not recorded"}
    </span>
  );
}

function ReferralInformationTab({ referral, patientExtra }) {
  const referralDate = getReferralDate(referral);

  return (
    <div className="space-y-4">
      <RecordSection
        title="Referral Concern"
        description="Primary reason the patient was endorsed to RHU."
        icon={<AlertCircle size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <DetailBlock
            label="Chief Complaint / Concern"
            value={getConcern(referral)}
            wide
          />
          <DetailBlock
            label="Reason for Referral"
            value={referral.reasonForReferral || referral.referralReason}
            wide
          />
          <DetailBlock
            label="Priority / Urgency"
            value={getUrgency(referral)}
            badge
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Patient Information"
        description="Patient identity and contact details."
        icon={<User size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <DetailBlock
            label="Patient Name"
            value={getPatientName(referral, patientExtra)}
            strong
          />
          <DetailBlock
            label="Age / Sex / Civil Status"
            value={getAgeSexCivil(referral, patientExtra)}
          />
          <DetailBlock
            label="Address"
            value={getPatientAddress(referral, patientExtra)}
            icon={<MapPin size={12} />}
          />
          <DetailBlock
            label="Contact Number"
            value={getContactNumber(referral, patientExtra)}
          />
          <DetailBlock
            label="Patient Classification"
            value={getClassification(referral, patientExtra)}
            badge
          />
          <DetailBlock
            label="PhilHealth"
            value={getPhilHealth(referral, patientExtra)}
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Referral Summary / Form Details"
        description="Operational details from the BHC referral form."
        icon={<ClipboardList size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailBlock label="Tracking ID" value={referral.trackingId} mono />
          <DetailBlock label="Date of Referral" value={formatDate(referralDate)} />
          <DetailBlock label="Time of Referral" value={formatTime(referralDate)} />
          <DetailBlock
            label="Referring Health Center"
            value={getReferringFacility(referral, patientExtra)}
            icon={<Building2 size={12} />}
          />
          <DetailBlock
            label="Destination Facility"
            value={getDestinationFacility(referral)}
            icon={<Building2 size={12} />}
          />
          <DetailBlock
            label="Referring Practitioner"
            value={
              referral.practitioner ||
              referral.referringPractitioner ||
              referral.attendingStaff ||
              "BHC Staff"
            }
          />
        </div>
      </RecordSection>

      <DoctorAvailabilitySnapshot referral={referral} />
    </div>
  );
}

function DoctorAvailabilitySnapshot({ referral }) {
  const snapshot = getReferralDoctorAvailabilitySnapshot(referral);

  return (
    <RecordSection
      title="RHU Availability at Submission"
      description="Doctor availability snapshot saved when this referral was submitted."
      icon={<Stethoscope size={14} />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DetailBlock label="Status" value={snapshot.status} badge />
        <DetailBlock
          label="Available Doctor Count"
          value={`${snapshot.availableDoctorCount} of ${snapshot.totalDoctorCount}`}
        />
        <DetailBlock label="Doctor Type" value={snapshot.doctorType} />
        <DetailBlock label="Note" value={snapshot.note} wide />
        <DetailBlock
          label="Updated By"
          value={snapshot.updatedBy || "RHU Staff"}
        />
        <DetailBlock
          label="Last Updated"
          value={formatDoctorAvailabilityDate(snapshot.updatedAt)}
        />
      </div>
    </RecordSection>
  );
}

function ClinicalSummaryTab({ referral }) {
  return (
    <div className="space-y-4">
      <RecordSection
        title="Clinical Information"
        description="Clinical endorsement and assessment from the referring BHC."
        icon={<Stethoscope size={14} />}
      >
        <NarrativeBox
          value={
            referral.clinicalSummary ||
            referral.summaryOfPresentIllness ||
            referral.physicalExamination ||
            getConcern(referral)
          }
          empty="No clinical summary provided in the referral record."
        />
      </RecordSection>

      <RecordSection
        title="Initial Assessment / Diagnosis"
        icon={<FileText size={14} />}
      >
        <NarrativeBox
          value={referral.initialDiagnosis || referral.diagnosis}
          empty="No initial diagnosis recorded."
        />
      </RecordSection>

      <RecordSection
        title="Initial Actions Taken"
        icon={<CheckCircle2 size={14} />}
      >
        <NarrativeBox
          value={referral.initialActionsTaken || referral.actionsTaken}
          empty="Initial actions were not documented."
        />
      </RecordSection>

      <RecordSection
        title="Reason for Referral"
        icon={<AlertCircle size={14} />}
      >
        <NarrativeBox
          value={referral.reasonForReferral || referral.referralReason}
          empty="No referral reason recorded."
        />
      </RecordSection>
    </div>
  );
}

function RhuFeedbackTab({ referral }) {
  const feedback = referral.feedback;

  if (!feedback) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <MessageSquare size={26} />
        </div>
        <h2 className="text-sm font-bold text-slate-700">No feedback yet</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
          No RHU return slip or feedback has been submitted for this referral
          yet.
        </p>
        <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-slate-400">
          Feedback will appear here once RHU staff completes and submits the
          return slip.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RecordSection title="Receiving Details" icon={<UserCheck size={14} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <DetailBlock label="Date Received" value={feedback.dateOfReceipt} />
          <DetailBlock label="Time Received" value={feedback.timeOfReceipt} />
          <DetailBlock
            label="Receiving Facility"
            value={
              feedback.receivingFacility ||
              getDestinationFacility(referral)
            }
          />
          <DetailBlock
            label="Receiving Practitioner"
            value={feedback.receivingPractitioner || "RHU Staff"}
          />
        </div>
      </RecordSection>

      <RecordSection
        title="RHU Diagnosis / Findings"
        icon={<Activity size={14} />}
      >
        <NarrativeBox
          value={feedback.rhuDiagnosis}
          empty="No RHU diagnosis recorded."
        />
      </RecordSection>

      <RecordSection title="Actions Taken" icon={<CheckCircle2 size={14} />}>
        <NarrativeBox
          value={feedback.actionsTaken}
          empty="No RHU actions recorded."
        />
      </RecordSection>

      <RecordSection
        title="Recommendation / Return Slip Notes"
        icon={<FileText size={14} />}
      >
        <NarrativeBox
          value={[feedback.recommendation, feedback.remarks]
            .filter(Boolean)
            .join("\n\n")}
          empty="No recommendation or return slip notes recorded."
        />
      </RecordSection>
    </div>
  );
}

function TimelineTab({ referral }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Clock size={14} />
        </div>
        <h2 className="text-sm font-bold text-slate-800">Referral Progress</h2>
      </div>
      <ReferralProgress referral={referral} />
    </div>
  );
}

function WorkflowPanel({ referral, busy, onStatusChange }) {
  const status = referral.status || "Pending";
  const actionClass =
    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Current Status
        </p>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Workflow Actions
      </p>

      <div className="space-y-2">
        {isPending(status) && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("Received", {
                  receivedAt: new Date().toISOString(),
                })
              }
              className={`${actionClass} bg-[#0B2E59] text-white hover:bg-[#092347]`}
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
                })
              }
              className={`${actionClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
            >
              <AlertTriangle size={14} />
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
            className={`${actionClass} bg-[#0B2E59] text-white hover:bg-[#092347]`}
          >
            <UserCheck size={14} />
            Receive Late Arrival
          </button>
        )}

        {isReceived(status) && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("For Monitoring", {
                  monitoringStartedAt: new Date().toISOString(),
                })
              }
              className={`${actionClass} bg-[#0B2E59] text-white hover:bg-[#092347]`}
            >
              <Activity size={14} />
              Start Monitoring
            </button>
            <Link
              to={`/rhu/feedback/${referral.trackingId}`}
              className={`${actionClass} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
            >
              <FileText size={14} />
              Create Feedback
            </Link>
          </>
        )}

        {isMonitoring(status) && (
          <Link
            to={`/rhu/feedback/${referral.trackingId}`}
            className={`${actionClass} bg-[#0B2E59] text-white hover:bg-[#092347]`}
          >
            <FileText size={14} />
            Create Feedback
          </Link>
        )}

        {status === "Completed" && (
          <Link
            to={`/rhu/feedback/${referral.trackingId}`}
            className={`${actionClass} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <FileText size={14} />
            View Return Slip
          </Link>
        )}
      </div>

      {referral.lateArrival && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700">
          Late arrival recorded from previous No-Show status.
        </p>
      )}
    </section>
  );
}

function ReferralProgressPanel({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Clock size={14} />
        </div>
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">
            Referral Progress
          </h2>
          <p className="text-[10.5px] text-slate-400">
            Case movement through RHU
          </p>
        </div>
      </div>
      <ReferralProgress referral={referral} />
    </section>
  );
}

function ReferralProgress({ referral }) {
  const status = referral.status || "Pending";
  const hadNoShow =
    status === "No-Show" ||
    referral.noShowAt ||
    referral.previousStatus === "No-Show" ||
    referral.lateArrival;

  const steps = [
    {
      label: "Pending",
      desc: "Referral received in queue",
      active: isPending(status),
      done: !isPending(status),
      tone: "slate",
    },
  ];

  if (hadNoShow) {
    steps.push({
      label: "No-Show",
      desc:
        status === "No-Show"
          ? "Patient did not arrive"
          : "Patient later arrived",
      active: status === "No-Show",
      done: status !== "No-Show",
      tone: status === "No-Show" ? "red" : "amber",
    });
  }

  steps.push(
    {
      label: "Received",
      desc: referral.lateArrival ? "Late arrival checked in" : "Patient checked in",
      active: isReceived(status),
      done: isMonitoring(status) || status === "Completed",
      tone: "blue",
    },
    {
      label: "For Monitoring",
      desc: "Under RHU monitoring",
      active: isMonitoring(status),
      done: status === "Completed",
      tone: "amber",
    },
    {
      label: "Completed",
      desc: "Return slip submitted",
      active: status === "Completed",
      done: status === "Completed",
      tone: "emerald",
    },
  );

  return (
    <div>
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={getProgressDotClass(step)} />
            {index < steps.length - 1 && (
              <span className="h-10 w-px bg-slate-200" />
            )}
          </div>
          <div className={index < steps.length - 1 ? "pb-4" : ""}>
            <p
              className={`text-xs font-bold ${
                step.done || step.active ? "text-slate-800" : "text-slate-300"
              }`}
            >
              {step.label}
            </p>
            <p
              className={`mt-0.5 text-[10.5px] leading-relaxed ${
                step.done || step.active ? "text-slate-500" : "text-slate-300"
              }`}
            >
              {step.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function QRCodePanel({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50">
        <QrCode size={56} className="text-[#0B2E59]/60" />
      </div>
      <p className="font-mono text-xs font-bold text-slate-700">
        {referral.trackingId}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Scan to verify referral
      </p>
    </section>
  );
}

function BhcActionsPanel({ referral }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <Link
        to={`/bhc/referrals/${referral.trackingId}/print`}
        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        <Printer size={14} />
        Print Referral Slip
      </Link>
      <Link
        to={`/bhc/referrals/${referral.trackingId}/qr`}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#092347]"
      >
        <QrCode size={14} />
        Open Full QR Code
      </Link>
    </section>
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

function DetailBlock({ label, value, icon, strong, mono, badge, wide }) {
  const className = wide ? "md:col-span-2" : "";

  return (
    <div className={`min-w-0 ${className}`}>
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
          {value || "-"}
        </p>
      )}
    </div>
  );
}

function NarrativeBox({ value, empty }) {
  return (
    <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
      {value || empty}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending: "bg-slate-100 text-slate-700",
    "Pending RHU Review": "bg-slate-100 text-slate-700",
    Received: "bg-blue-100 text-blue-700",
    "Received by RHU": "bg-blue-100 text-blue-700",
    "For Monitoring": "bg-amber-100 text-amber-700",
    "Under Assessment": "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    "No-Show": "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
        map[status] || map.Pending
      }`}
    >
      {status || "Pending"}
    </span>
  );
}

function ClassBadge({ value }) {
  const map = {
    "General Consultation": "bg-slate-100 text-slate-600",
    "Maternal Care": "bg-pink-100 text-pink-700",
    Maternal: "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
    Emergency: "bg-red-100 text-red-700",
    Urgent: "bg-amber-100 text-amber-700",
    "Non-Urgent": "bg-slate-100 text-slate-600",
    Available: "bg-emerald-100 text-emerald-700",
    "Not Available": "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`mt-1 inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {value || "-"}
    </span>
  );
}

function getProgressDotClass(step) {
  if (!step.done && !step.active) {
    return "mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-200 bg-white";
  }

  const colors = {
    slate: "bg-slate-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    red: "bg-red-500",
  };

  return `mt-0.5 h-3.5 w-3.5 rounded-full ${colors[step.tone] || colors.slate}`;
}

function isRhuFacility(value = "") {
  return /rhu|rural health unit/i.test(String(value));
}

function cleanBarangayName(value = "") {
  return String(value).replace(/^barangay\s+/i, "").trim();
}

function getReferralDoctorAvailabilitySnapshot(referral = {}) {
  return normalizeDoctorAvailability(
    referral.doctorAvailabilitySnapshot || {
      status: referral.doctorAvailabilityStatus || referral.doctorAvailability,
      doctorType: referral.doctorType,
      totalDoctorCount: referral.totalDoctorCount,
      availableDoctorCount: referral.availableDoctorCount,
      note: referral.doctorAvailabilityNote,
      updatedAt: referral.doctorAvailabilityUpdatedAt,
      updatedBy: referral.doctorAvailabilityUpdatedBy,
    },
  );
}

function getDestinationFacility(referral = {}) {
  return (
    referral.referredFacility ||
    referral.destinationFacility ||
    referral.destinationHci ||
    referral.receivingFacility ||
    referral.rhu ||
    "Rural Health Unit Bulakan"
  );
}

function getReferringFacility(referral = {}, patientExtra = null) {
  const destination = getDestinationFacility(referral);
  const candidates = [
    referral.referringHealthCenter,
    referral.referringBHC,
    referral.bhcName,
    referral.sourceFacility,
    referral.referringFacility,
    referral.bhc,
    referral.referringHci,
  ].filter(Boolean);

  const validCandidate = candidates.find(
    (value) => value !== destination && !isRhuFacility(value),
  );

  if (validCandidate) return validCandidate;

  const barangay =
    referral.referringBarangay ||
    referral.patientBarangay ||
    referral.barangay ||
    patientExtra?.barangay;

  if (barangay) {
    return `Barangay ${cleanBarangayName(barangay)} Health Center`;
  }

  return "Barangay Health Center";
}

function getReferralDate(referral = {}) {
  const raw =
    referral.createdAt ||
    referral.dateOfReferral ||
    referral.referralDate ||
    referral.dateSubmitted ||
    referral.date;

  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date;
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

function getPatientName(referral = {}, patientExtra = null) {
  return (
    referral.patientName ||
    referral.patient ||
    patientExtra?.name ||
    [patientExtra?.firstName, patientExtra?.lastName].filter(Boolean).join(" ") ||
    "Unknown Patient"
  );
}

function getAgeSex(referral = {}, patientExtra = null) {
  if (referral.ageSex) return referral.ageSex;
  const age = referral.age || patientExtra?.age;
  const sex = referral.sex || patientExtra?.sex;
  return [age, sex].filter(Boolean).join(" / ") || "Age / sex not recorded";
}

function getAgeSexCivil(referral = {}, patientExtra = null) {
  const civilStatus =
    referral.civilStatus || referral.civil_status || patientExtra?.civilStatus;
  return [getAgeSex(referral, patientExtra), civilStatus]
    .filter(Boolean)
    .join(" / ");
}

function getContactNumber(referral = {}, patientExtra = null) {
  return (
    referral.contactNumber ||
    referral.contact ||
    referral.patientContact ||
    patientExtra?.contactNumber ||
    patientExtra?.contact ||
    "No contact recorded"
  );
}

function getClassification(referral = {}, patientExtra = null) {
  return (
    referral.patientClassification ||
    referral.classification ||
    referral.referralCategory ||
    referral.category ||
    patientExtra?.patientClassification ||
    patientExtra?.category ||
    "General Consultation"
  );
}

function getPatientAddress(referral = {}, patientExtra = null) {
  const patientAddress = patientExtra
    ? [patientExtra.address, patientExtra.barangay, patientExtra.municipality]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    referral.address ||
    referral.patientAddress ||
    patientAddress ||
    [referral.street, referral.barangay, referral.municipality]
      .filter(Boolean)
      .join(", ") ||
    "No address recorded"
  );
}

function getPhilHealth(referral = {}, patientExtra = null) {
  return (
    referral.philHealth ||
    referral.philHealthNumber ||
    referral.philhealthNumber ||
    patientExtra?.philHealth ||
    patientExtra?.philHealthNumber ||
    "Not recorded"
  );
}

function getConcern(referral = {}) {
  return (
    referral.chiefComplaint ||
    referral.concern ||
    referral.reasonForReferral ||
    "No concern recorded."
  );
}

function getUrgency(referral = {}) {
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

function isPending(status) {
  return status === "Pending" || status === "Pending RHU Review";
}

function isReceived(status) {
  return status === "Received" || status === "Received by RHU";
}

function isMonitoring(status) {
  return status === "For Monitoring" || status === "Under Assessment";
}
