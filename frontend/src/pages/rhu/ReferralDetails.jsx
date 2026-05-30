import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
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
  Eye,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  Stethoscope,
  User,
  UserCheck,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getReferrals,
  updateReferralByTrackingId,
} from "../../services/referrals";
import {
  createPatient,
  getPatientById,
  getPatients,
} from "../../services/patientService";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

const TABS = [
  { key: "referral", label: "Referral Information", icon: ClipboardList },
  { key: "clinical", label: "Clinical Data", icon: Stethoscope },
  { key: "returnSlip", label: "Return Slip", icon: MessageSquare },
];

const stagger = (index) => ({ animationDelay: `${index * 55}ms` });

export default function RHUReferralDetails() {
  const { trackingId } = useParams();
  const [referral, setReferral] = useState(null);
  const [allReferrals, setAllReferrals] = useState([]);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState("referral");
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
          setAllReferrals(referrals || []);
          setPatient(null);
          setNotFound(true);
          return;
        }

        const linkedPatient = found.patientId
          ? await getPatientById(found.patientId)
          : null;

        if (!active) return;
        setReferral(found);
        setAllReferrals(referrals || []);
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
        patientId = await ensureLinkedPatient(referral);
      }

      const updated = await updateReferralByTrackingId(referral.trackingId, {
        status: nextStatus,
        patientId,
        ...extra,
      });

      if (updated) {
        setReferral(updated);
        setAllReferrals((prev) =>
          prev.map((item) =>
            item.trackingId === updated.trackingId ? updated : item,
          ),
        );
        if (patientId) {
          const linkedPatient = await getPatientById(patientId);
          setPatient(linkedPatient);
        }
        setMessage(`Referral status updated to ${nextStatus}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const relatedReferrals = getPatientReferralHistory(referral, allReferrals);

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
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#0B2E59] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#092347]"
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

      <div className="anim-fade-up mb-4" style={stagger(0)}>
        <Link
          to="/rhu/incoming-referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0B2E59]"
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
          {activeTab === "referral" && (
            <ReferralInformation
              referral={referral}
              patient={patient}
              relatedReferrals={relatedReferrals}
            />
          )}
          {activeTab === "clinical" && <ClinicalDetails referral={referral} />}
          {activeTab === "returnSlip" && <ReturnSlip referral={referral} />}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              {message}
            </div>
          )}
          <SystemReference referral={referral} />
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
  return (
    <header
      className="anim-fade-up mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#0B2E59]">
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

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-mono font-semibold text-[#0B2E59]">
              {referral.trackingId}
            </span>
            <span className="text-slate-300">/</span>
            <span>
              {formatDate(getReferralDate(referral))} at{" "}
              {formatTime(getReferralDate(referral))}
            </span>
            <span className="text-slate-300">/</span>
            <span>
              {getReferringHci(referral, patient)} to Rural Health Unit Bulakan
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function ReferralInformation({ referral, patient, relatedReferrals }) {
  const referralDate = getReferralDate(referral);

  return (
    <div className="space-y-4">
      <RecordSection
        title="Official Referral Form Details"
        description="BHC-RHU referral transaction information."
        icon={<ClipboardList size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            icon={<Building2 size={12} />}
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

      <RecordSection title="Patient Information" icon={<User size={14} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Detail
            label="Name of Patient"
            value={getPatientName(referral, patient)}
            strong
          />
          <Detail
            label="Date of Birth"
            value={getBirthDate(referral, patient)}
          />
          <Detail
            label="Address"
            value={getPatientAddress(referral, patient)}
            icon={<MapPin size={12} />}
          />
          <Detail
            label="Age / Sex / Civil Status"
            value={getAgeSexCivil(referral, patient)}
          />
          <Detail
            label="PhilHealth Category"
            value={getPhilHealthCategory(referral, patient)}
          />
        </div>
      </RecordSection>

      <PreviousReferrals
        currentReferral={referral}
        referrals={relatedReferrals}
      />
    </div>
  );
}

function PreviousReferrals({ currentReferral, referrals }) {
  const previous = referrals
    .filter((item) => item.trackingId !== currentReferral.trackingId)
    .sort(sortReferralDesc);
  const completedCount = referrals.filter(
    (item) => item.status === "Completed",
  ).length;
  const noShowCount = referrals.filter(
    (item) => item.status === "No-Show",
  ).length;
  const latestReferral = [...referrals].sort(sortReferralDesc)[0];

  return (
    <RecordSection
      title="Previous BHC-RHU Referrals"
      description="Referral history context for this patient only."
      icon={<Clock size={14} />}
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total Referrals" value={referrals.length} />
        <MiniStat label="Completed Referrals" value={completedCount} />
        <MiniStat label="No-Show Referrals" value={noShowCount} />
        <MiniStat
          label="Latest Referral Date"
          value={formatDate(getReferralDate(latestReferral))}
        />
      </div>

      {previous.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-400">
          No previous BHC-RHU referrals found for this patient.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Tracking ID</th>
                <th className="px-4 py-3">Date of Referral</th>
                <th className="px-4 py-3">Name of Referring HCI</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previous.map((item) => (
                <tr
                  key={item.trackingId || item.id}
                  className="hover:bg-slate-50/70"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-mono text-xs font-bold text-[#0B2E59]">
                      {item.trackingId || item.id}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {formatDate(getReferralDate(item))}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getReferringHci(item)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      to={`/rhu/referrals/${item.trackingId || item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B2E59] hover:bg-slate-50"
                    >
                      <Eye size={12} />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RecordSection>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-[#0B2E59]">{value || 0}</p>
    </div>
  );
}

function ClinicalDetails({ referral }) {
  return (
    <div className="space-y-4">
      <RecordSection title="Chief Complaint" icon={<AlertCircle size={14} />}>
        <Narrative
          value={referral.chiefComplaint || referral.concern}
          empty="No chief complaint recorded."
        />
      </RecordSection>

      <RecordSection
        title="Summary of Present Illness and Physical Examination"
        icon={<Stethoscope size={14} />}
      >
        <Narrative
          value={
            referral.summaryOfPresentIllness ||
            referral.physicalExamination ||
            referral.clinicalSummary
          }
          empty="No clinical summary recorded."
        />
      </RecordSection>

      <RecordSection title="Initial Diagnosis" icon={<FileText size={14} />}>
        <Narrative
          value={referral.initialDiagnosis || referral.diagnosis}
          empty="No initial diagnosis recorded."
        />
      </RecordSection>

      <RecordSection
        title="Initial Actions Taken"
        icon={<CheckCircle2 size={14} />}
      >
        <Narrative
          value={referral.initialActionsTaken || referral.actionsTaken}
          empty="No initial actions recorded."
        />
      </RecordSection>

      <RecordSection
        title="Reason for Referral"
        icon={<ClipboardList size={14} />}
      >
        <Narrative
          value={referral.reasonForReferral || referral.referralReason}
          empty="No reason for referral recorded."
        />
      </RecordSection>
    </div>
  );
}

function ReturnSlip({ referral }) {
  const feedback = referral.feedback;

  if (!feedback) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <MessageSquare size={26} />
        </div>
        <h2 className="text-sm font-bold text-slate-700">
          No Return Slip yet.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
          Create Return Slip after RHU assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RecordSection
        title="Return Slip Details"
        icon={<MessageSquare size={14} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Date of Receipt" value={feedback.dateOfReceipt} />
          <Detail label="Time of Receipt" value={feedback.timeOfReceipt} />
          <Detail
            label="Patient Name"
            value={getPatientName(referral)}
            strong
          />
          <Detail label="Age / Sex" value={getAgeSex(referral)} />
          <Detail
            label="Name of Health Care Institution"
            value={feedback.receivingFacility || "Rural Health Unit Bulakan"}
          />
          <Detail
            label="Name and Signature of Receiving Practitioner"
            value={feedback.receivingPractitioner || "RHU Staff"}
          />
        </div>
      </RecordSection>

      <RecordSection title="Initial Diagnosis" icon={<FileText size={14} />}>
        <Narrative
          value={feedback.rhuDiagnosis}
          empty="No RHU diagnosis recorded."
        />
      </RecordSection>

      <RecordSection title="Actions Taken" icon={<CheckCircle2 size={14} />}>
        <Narrative
          value={[
            feedback.actionsTaken,
            feedback.recommendation,
            feedback.remarks,
          ]
            .filter(Boolean)
            .join("\n\n")}
          empty="No actions recorded."
        />
      </RecordSection>
    </div>
  );
}

function SystemReference({ referral }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">
            System Reference
          </h2>
          <p className="text-[10.5px] text-slate-400">
            Referral tracking details
          </p>
        </div>
        <StatusBadge status={referral.status} />
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

function ReferralActions({ referral, busy, onStatusChange }) {
  const status = referral.status || "Pending";
  const button =
    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold text-slate-800">
        Referral Actions
      </h2>

      <div className="space-y-2">
        {(status === "Pending" || status === "Pending RHU Review") && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onStatusChange("Received", {
                receivedAt: new Date().toISOString(),
              })
            }
            className={`${button} bg-[#0B2E59] text-white hover:bg-[#092347]`}
          >
            <UserCheck size={14} />
            Mark as Received
          </button>
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
            className={`${button} bg-[#0B2E59] text-white hover:bg-[#092347]`}
          >
            <UserCheck size={14} />
            Mark as Received
          </button>
        )}

        {(status === "Received" || status === "Received by RHU") && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onStatusChange("For Monitoring", {
                  monitoringStartedAt: new Date().toISOString(),
                })
              }
              className={`${button} bg-[#0B2E59] text-white hover:bg-[#092347]`}
            >
              <Activity size={14} />
              Start Monitoring
            </button>
            <Link
              to={`/rhu/feedback/${referral.trackingId}`}
              className={`${button} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
            >
              <FileText size={14} />
              Create Return Slip
            </Link>
          </>
        )}

        {(status === "For Monitoring" || status === "Under Assessment") && (
          <>
            <Link
              to={`/rhu/feedback/${referral.trackingId}`}
              className={`${button} bg-[#0B2E59] text-white hover:bg-[#092347]`}
            >
              <FileText size={14} />
              Create Return Slip
            </Link>
          </>
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
      "Submitted",
      referral.createdAt || referral.dateOfReferral || referral.referralDate,
    ],
    ["Received", referral.receivedAt],
    ["Monitoring Started", referral.monitoringStartedAt],
    ["Return Slip Submitted", referral.feedback?.submittedAt],
    ["Completed", referral.completedAt],
  ];

  if (referral.noShowAt) {
    items.splice(1, 0, ["No-Show", referral.noShowAt]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold text-slate-800">
        Status History
      </h2>
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

function Detail({ label, value, icon, strong, badge }) {
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
            strong
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

function Narrative({ value, empty }) {
  return (
    <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
      {value || empty}
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
    A1: "bg-blue-100 text-blue-700",
    A2: "bg-blue-100 text-blue-700",
    B1: "bg-amber-100 text-amber-700",
    B2: "bg-amber-100 text-amber-700",
    C1: "bg-red-100 text-red-700",
    C2: "bg-red-100 text-red-700",
    Unclassified: "bg-slate-100 text-slate-600",
    Maternal: "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
    "Senior Citizen": "bg-violet-100 text-violet-700",
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

function getPatientReferralHistory(currentReferral, referrals) {
  return (referrals || []).filter((item) =>
    isSameReferralPatient(currentReferral, item),
  );
}

function isSameReferralPatient(a = {}, b = {}) {
  if (!a || !b) return false;

  const aPatientId = a.patientId || a.patient?.id;
  const bPatientId = b.patientId || b.patient?.id;
  if (aPatientId && bPatientId && aPatientId === bPatientId) return true;

  const aName = normalize(getPatientName(a));
  const bName = normalize(getPatientName(b));
  if (!aName || !bName || aName !== bName) return false;

  const aContact = normalize(getContact(a));
  const bContact = normalize(getContact(b));
  if (aContact && bContact) return aContact === bContact;

  return true;
}

function sortReferralDesc(a, b) {
  return getReferralTimeValue(b) - getReferralTimeValue(a);
}

function getReferralTimeValue(referral) {
  const date = getReferralDate(referral);
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function ensureLinkedPatient(referral) {
  if (referral.patientId) return referral.patientId;

  const patients = await getPatients();
  const referralName = normalize(getPatientName(referral));
  const referralContact = normalize(getContact(referral));

  const existing = patients.find((patient) => {
    const sameName = normalize(patient.name) === referralName;
    const sameContact =
      referralContact &&
      normalize(patient.contact || patient.contactNumber) === referralContact;
    return sameName && (sameContact || !referralContact);
  });

  if (existing?.id) return existing.id;

  const nameParts = splitPatientName(getPatientName(referral));
  const created = await createPatient({
    ...nameParts,
    birthDate: referral.birthDate || referral.dateOfBirth || "",
    age: referral.age || parseAge(referral.ageSex),
    sex: referral.sex || parseSex(referral.ageSex),
    civilStatus: referral.civilStatus || "",
    contactNumber: getContact(referral),
    streetAddress:
      referral.street || referral.address || referral.patientAddress || "",
    barangay: referral.barangay || referral.patientBarangay || "",
    municipality: referral.municipality || "Bulakan",
    patientClassification: getPatientClassification(referral),
    philhealthNumber:
      referral.philHealthNumber ||
      referral.philhealthNumber ||
      referral.philHealth ||
      "",
    registrationSource: "BHC_RHU_REFERRAL",
    linkedTrackingId: referral.trackingId,
  });

  return created?.patient?.id || created?.details?.id || null;
}

function splitPatientName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Unknown", middleName: "", lastName: "Patient" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: "", lastName: "" };
  }
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts[parts.length - 1],
  };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

function getPhilHealthCategory(referral = {}, patient = null) {
  return referral.philHealthCategory || patient?.philHealthCategory || "";
}

function getReferringPractitioner(referral = {}) {
  return (
    referral.practitioner ||
    referral.referringPractitioner ||
    referral.attendingStaff ||
    "BHC Staff"
  );
}

function parseAge(ageSex = "") {
  const match = String(ageSex).match(/\d+/);
  return match ? match[0] : "";
}

function parseSex(ageSex = "") {
  const upper = String(ageSex).toUpperCase();
  if (upper.includes("/F") || upper === "F") return "Female";
  if (upper.includes("/M") || upper === "M") return "Male";
  return "";
}
