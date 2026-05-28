import { useState, useEffect, Fragment } from "react";
import { useParams, Link } from "react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Send,
  Stethoscope,
  AlertCircle,
  Clock,
  UserCheck,
  Activity,
  Building2,
  CalendarDays,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

import { getReferrals } from "../../services/referrals";

/* ─── Note ───
   Removed local hardcoded referral demo data.
   This component now loads referrals from centralized shared storage via getReferrals().
*/

/* ─── Status Progression Stepper ─── */
function StatusStepper({ currentStep }) {
  const steps = [
    { label: "BHC Referred", sub: "Referral sent to RHU" },
    { label: "RHU Received", sub: "Patient checked in" },
    { label: "RHU Assessment", sub: "Diagnosis & findings" },
    { label: "Feedback Sent", sub: "Return slip to BHC" },
  ];

  return (
    <div className="rounded-xl border border-[#E8ECF0] bg-white p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <Activity size={16} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#0B2E59]">
            Referral Progression
          </h3>
          <p className="text-[11px] text-[#9CA3AF]">
            Current stage in the BHC → RHU coordination loop
          </p>
        </div>
      </div>
      <div className="flex items-start">
        {steps.map((step, i) => {
          const completed = i < currentStep;
          const active = i === currentStep;
          const isLast = i === steps.length - 1;

          return (
            <Fragment key={i}>
              <div
                className="flex flex-col items-center"
                style={{ minWidth: 0, flex: 1 }}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : active
                        ? "border-[#0B2E59] bg-[#0B2E59] text-white shadow-md shadow-[#0B2E59]/20"
                        : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  {completed ? (
                    <Check size={15} strokeWidth={3} />
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <p
                  className={`mt-2.5 text-center text-[10px] font-bold leading-tight ${
                    completed
                      ? "text-emerald-700"
                      : active
                        ? "text-[#0B2E59]"
                        : "text-gray-400"
                  }`}
                >
                  {step.label}
                </p>
                <p
                  className={`mt-0.5 text-center text-[9px] leading-tight ${
                    active ? "text-[#6B7280]" : "text-gray-300"
                  }`}
                >
                  {step.sub}
                </p>
              </div>
              {!isLast && (
                <div className="flex flex-1 items-start pt-[18px] px-1">
                  <div
                    className={`h-0.5 w-full rounded-full transition-all duration-500 ${
                      i < currentStep ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Referral Summary Card ─── */
function ReferralSummaryCard({ referral }) {
  if (!referral) return null;

  const priorityColors = {
    High: { bg: "#FEF2F2", text: "#B91C1C" },
    Medium: { bg: "#FFFBEB", text: "#B45309" },
    Normal: { bg: "#F8FAFC", text: "#475569" },
  };
  const pc = priorityColors[referral.priority] || priorityColors.Normal;

  return (
    <div className="rounded-xl border border-[#E8ECF0] bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#FAFBFC] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
            <ClipboardList size={14} />
          </div>
          <span className="font-mono text-sm font-bold text-[#0B2E59]">
            {referral.trackingId}
          </span>
        </div>
        <span
          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: pc.bg, color: pc.text }}
        >
          {referral.priority} Priority
        </span>
      </div>
      <div className="p-5">
        <h2 className="text-lg font-bold text-[#0B2E59]">{referral.patient}</h2>
        <p className="mt-0.5 text-sm text-[#6B7280]">
          {referral.ageSex} · {referral.category}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem
            icon={<Building2 size={13} />}
            label="Referring BHC"
            value={referral.bhc}
          />
          <SummaryItem
            icon={<Stethoscope size={13} />}
            label="Chief Concern"
            value={referral.concern}
          />
          <SummaryItem
            icon={<UserCheck size={13} />}
            label="Specialization"
            value={referral.suggestedSpecialization}
          />
          <SummaryItem
            icon={<CalendarDays size={13} />}
            label="Date Submitted"
            value={referral.dateSubmitted}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-[#0B2E59] leading-snug">
        {value || "—"}
      </p>
    </div>
  );
}

/* ─── Form Fields ─── */
function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none transition-all duration-200 focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full appearance-none rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none transition-all duration-200 focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      >
        {children}
      </select>
    </div>
  );
}

function FieldTextarea({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
  rows = 3,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm outline-none transition-all duration-200 focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({ icon, title, description }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-[#0B2E59]">{title}</h2>
        {description && (
          <p className="text-[11px] text-[#9CA3AF]">{description}</p>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function FeedbackReturnSlip() {
  const { trackingId: routeTrackingId } = useParams();
  const [selectedReferralId, setSelectedReferralId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isAutoLoaded = !!routeTrackingId;

  const [referrals, setReferrals] = useState([]);

  /* Load referrals from centralized shared storage */
  useEffect(() => {
    let alive = true;
    async function load() {
      const all = await getReferrals();
      if (!alive) return;
      setReferrals(all);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  /* Auto-load referral from URL param */
  useEffect(() => {
    if (!routeTrackingId) return;

    const exists = referrals.find((r) => r.trackingId === routeTrackingId);
    if (exists) {
      setSelectedReferralId(routeTrackingId);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [routeTrackingId, referrals]);

  const selectedReferral = referrals.find(
    (r) => r.trackingId === selectedReferralId,
  );

  function getCurrentStep() {
    if (!selectedReferral) return 0;
    switch (selectedReferral.status) {
      case "Pending":
        return 0;
      case "Received":
        return 1;
      case "For Monitoring":
        return 1;
      case "Completed":
        return 4;
      case "No-Show":
        return 0;
      default:
        return 0;
    }
  }

  const [form, setForm] = useState({
    dateReceived: new Date().toISOString().split("T")[0],
    timeReceived: "",
    rhuDiagnosis: "",
    actionsTaken: "",
    recommendation: "",
    monitoringStatus: "For Monitoring",
    receivingPersonnel: "RHU Staff",
    remarks: "",
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
  }

  /* ─── Not Found State ─── */
  if (notFound) {
    return (
      <DashboardLayout role="rhu" title="Feedback / Return Slip">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertCircle size={28} />
          </div>
          <h1 className="mt-5 text-lg font-bold text-[#0B2E59]">
            Referral Not Found
          </h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            No referral exists with tracking ID{" "}
            <span className="font-mono font-semibold text-[#0B2E59]">
              {routeTrackingId}
            </span>
            . Please verify the ID or go back.
          </p>
          <Link
            to="/rhu/incoming-referrals"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[#092347]"
          >
            <ArrowLeft size={14} />
            Back to Incoming Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Submitted State ─── */
  if (submitted) {
    return (
      <DashboardLayout role="rhu" title="Feedback Submitted">
        <div className="mx-auto max-w-3xl rounded-xl border border-[#E8ECF0] bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={30} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-[#0B2E59]">
            Feedback Submitted
          </h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            RHU feedback / return slip has been recorded for the selected
            referral.
          </p>
          <div className="mt-6 rounded-xl bg-[#F8FAFC] p-5 text-left">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Tracking ID" value={selectedReferral?.trackingId} />
              <Info label="Patient" value={selectedReferral?.patient} />
              <Info label="Referring BHC" value={selectedReferral?.bhc} />
              <Info label="Monitoring Status" value={form.monitoringStatus} />
              <Info
                label="Receiving Personnel"
                value={form.receivingPersonnel}
              />
              <Info label="Date Received" value={form.dateReceived} />
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to="/rhu/incoming-referrals"
              className="inline-flex items-center gap-2 rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
            >
              <ArrowLeft size={14} />
              Back to Referrals
            </Link>
            <button
              onClick={() => {
                setSubmitted(false);
                if (!isAutoLoaded) setSelectedReferralId("");
              }}
              className="rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
            >
              Create Another Feedback
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Form State ─── */
  return (
    <DashboardLayout role="rhu" title="Feedback / Return Slip">
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb — always show back link */}
        <div className="mb-6">
          <Link
            to="/rhu/incoming-referrals"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] transition-colors hover:text-[#0B2E59]"
          >
            <ArrowLeft size={13} />
            Back to Incoming Referrals
          </Link>
          {!isAutoLoaded && (
            <>
              <h1 className="mt-3 text-xl font-bold tracking-tight text-[#0B2E59]">
                Feedback / Return Slip
              </h1>
              <p className="mt-1 text-sm text-[#6B7280]">
                Submit RHU feedback after patient assessment and return the
                update to the referring BHC.
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 pb-24">
          {/* Referral Selection (hidden when auto-loaded) */}
          {!isAutoLoaded && (
            <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
              <SectionHeader
                icon={<ClipboardList size={20} />}
                title="Select Referral Record"
                description="Choose the referral that will receive RHU feedback."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    Search / Select Tracking ID
                  </label>
                  <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
                    <Clock size={14} className="text-[#BCC3CD]" />
                    <select
                      value={selectedReferralId}
                      onChange={(e) => setSelectedReferralId(e.target.value)}
                      required
                      className="h-10 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                    >
                      <option value="">Select referral</option>
                      {REFERRALS.filter(
                        (r) =>
                          r.status === "Received" ||
                          r.status === "For Monitoring",
                      ).map((referral) => (
                        <option
                          key={referral.trackingId}
                          value={referral.trackingId}
                        >
                          {referral.trackingId} — {referral.patient} (
                          {referral.status})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedReferral && (
                  <div className="rounded-lg bg-[#F8FAFC] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                      Selected Referral
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#0B2E59]">
                      {selectedReferral.patient}
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {selectedReferral.trackingId} · {selectedReferral.ageSex}{" "}
                      · {selectedReferral.bhc}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Referral Summary */}
          {selectedReferral && (
            <ReferralSummaryCard referral={selectedReferral} />
          )}

          {/* Status Progression */}
          {selectedReferral && <StatusStepper currentStep={getCurrentStep()} />}

          {/* Clinical Assessment Form */}
          {selectedReferral && (
            <>
              {/* Reception Details */}
              <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
                <SectionHeader
                  icon={<Clock size={20} />}
                  title="Reception Details"
                  description="Record when and by whom the patient was received at the RHU."
                />
                <div className="grid gap-4 lg:grid-cols-4">
                  <FieldInput
                    label="Date Received"
                    name="dateReceived"
                    type="date"
                    value={form.dateReceived}
                    onChange={handleChange}
                    required
                  />
                  <FieldInput
                    label="Time Received"
                    name="timeReceived"
                    type="time"
                    value={form.timeReceived}
                    onChange={handleChange}
                    required
                  />
                  <FieldSelect
                    label="Monitoring Status"
                    name="monitoringStatus"
                    value={form.monitoringStatus}
                    onChange={handleChange}
                    required
                  >
                    <option>For Monitoring</option>
                    <option>Follow-up Required</option>
                    <option>Under Observation</option>
                    <option>Completed</option>
                    <option>Referred to Hospital</option>
                  </FieldSelect>
                  <FieldInput
                    label="Receiving Personnel"
                    name="receivingPersonnel"
                    value={form.receivingPersonnel}
                    onChange={handleChange}
                    required
                  />
                </div>
              </section>

              {/* Clinical Findings */}
              <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
                <SectionHeader
                  icon={<Stethoscope size={20} />}
                  title="Clinical Findings"
                  description="Record the RHU diagnosis, actions taken, and recommendation."
                />
                <div className="space-y-4">
                  <FieldTextarea
                    label="RHU Diagnosis / Findings"
                    name="rhuDiagnosis"
                    value={form.rhuDiagnosis}
                    onChange={handleChange}
                    placeholder="Write RHU findings or diagnosis..."
                    required
                  />
                  <FieldTextarea
                    label="Actions Taken"
                    name="actionsTaken"
                    value={form.actionsTaken}
                    onChange={handleChange}
                    placeholder="Write actions taken by RHU personnel (e.g., vital signs taken, medication prescribed, lab orders)..."
                    required
                  />
                </div>
              </section>

              {/* Recommendation */}
              <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
                <SectionHeader
                  icon={<FileText size={20} />}
                  title="Recommendation & Follow-up"
                  description="Provide follow-up instructions for the BHC and patient."
                />
                <div className="space-y-4">
                  <FieldTextarea
                    label="Recommendation / Follow-up Instructions"
                    name="recommendation"
                    value={form.recommendation}
                    onChange={handleChange}
                    placeholder="Write recommendation, follow-up schedule, or monitoring instructions for the BHC..."
                    required
                  />
                  <FieldTextarea
                    label="Additional Remarks"
                    name="remarks"
                    value={form.remarks}
                    onChange={handleChange}
                    placeholder="Optional remarks, notes, or observations..."
                    rows={2}
                  />
                </div>
              </section>

              {/* Clinical Note */}
              <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex gap-3">
                  <FileText
                    size={18}
                    className="text-[#0B2E59] flex-shrink-0 mt-0.5"
                  />
                  <p className="text-xs leading-relaxed text-[#4B5563]">
                    <span className="font-semibold text-[#0B2E59]">
                      Clinical Note:
                    </span>{" "}
                    This feedback serves as the RHU return slip. It updates the
                    referral record and informs the BHC about RHU assessment,
                    action taken, and monitoring status. Ensure all clinical
                    findings are accurate before submission.
                  </p>
                </div>
              </section>
            </>
          )}

          {/* Empty state when no referral selected (manual mode only) */}
          {!isAutoLoaded && !selectedReferral && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E8ECF0] bg-[#FAFBFC] py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#BCC3CD]">
                <ClipboardList size={22} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[#9CA3AF]">
                Select a referral to begin
              </p>
              <p className="mt-1 text-xs text-[#BCC3CD]">
                Choose a Received or For Monitoring referral from the dropdown
                above.
              </p>
            </div>
          )}
        </form>

        {/* Sticky Action Footer */}
        {selectedReferral && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8ECF0] bg-white/95 px-4 py-3.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-lg">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="font-mono text-xs font-semibold text-[#0B2E59]">
                  {selectedReferral.trackingId}
                </span>
                <span className="text-[#E8ECF0]">·</span>
                <span className="text-xs text-[#6B7280]">
                  {selectedReferral.patient}
                </span>
              </div>
              <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
                <button
                  type="button"
                  className="rounded-lg border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F9FAFB] active:scale-[0.97]"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all hover:bg-[#092347] active:scale-[0.97]"
                >
                  <Send size={14} />
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#0B2E59]">
        {value || "—"}
      </p>
    </div>
  );
}
