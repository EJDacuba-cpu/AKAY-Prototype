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

import {
  getReferrals,
  updateReferralByTrackingId,
} from "../../services/referrals";

/* ─── Status Progression Stepper ─── */
function StatusStepper({ currentStep }) {
  const steps = [
    { label: "BHC Referral", sub: "Referral sent to RHU" },
    { label: "RHU Received", sub: "Patient checked in" },
    { label: "RHU Assessment", sub: "Diagnosis & findings" },
    { label: "Return Slip Sent", sub: "Return slip to BHC" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Activity size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Referral Progression
          </h3>
          <p className="text-[11px] text-slate-400">
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
                      ? "border-slate-900 bg-slate-900 text-white"
                      : active
                        ? "border-slate-900 bg-slate-900 text-white ring-4 ring-slate-100"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {completed ? (
                    <Check size={15} strokeWidth={2.5} />
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </div>

                <p
                  className={`mt-2.5 text-center text-[11px] font-semibold leading-tight ${
                    completed || active ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>

                <p
                  className={`mt-0.5 text-center text-[10px] leading-tight ${
                    active ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {step.sub}
                </p>
              </div>

              {!isLast && (
                <div className="flex flex-1 items-start pt-[18px] px-1">
                  <div
                    className={`h-0.5 w-full rounded-full transition-all duration-500 ${
                      i < currentStep ? "bg-slate-900" : "bg-slate-200"
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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <ClipboardList size={14} />
          </div>
          <span className="font-mono text-sm font-semibold text-slate-900">
            {referral.trackingId}
          </span>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {referral.ageSex}
        </span>
      </div>

      <div className="p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {referral.patientName || referral.patient}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {referral.category || "General Consultation"}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem
            icon={<Building2 size={13} />}
            label="Referring BHC"
            value={referral.bhc || referral.referringFacility}
          />
          <SummaryItem
            icon={<Stethoscope size={13} />}
            label="Chief Concern"
            value={referral.chiefComplaint || referral.concern}
          />
          <SummaryItem
            icon={<UserCheck size={13} />}
            label="Specialization"
            value={referral.suggestedSpecialization}
          />
          <SummaryItem
            icon={<CalendarDays size={13} />}
            label="Date Submitted"
            value={
              referral.createdAt
                ? new Date(referral.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : referral.dateSubmitted
            }
          />
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-medium text-slate-800 leading-snug">
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
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-300 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all duration-200 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
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
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-300 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
      />
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({ icon, title, description }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {description && (
          <p className="text-[11px] text-slate-400">{description}</p>
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
  const [loading, setLoading] = useState(true);

  const isAutoLoaded = !!routeTrackingId;
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const all = await getReferrals();
        if (!alive) return;
        setReferrals(all);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!routeTrackingId || loading) return;

    const exists = referrals.find((r) => r.trackingId === routeTrackingId);
    if (exists) {
      setSelectedReferralId(routeTrackingId);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [routeTrackingId, referrals, loading]);

  const selectedReferral = referrals.find(
    (r) => r.trackingId === selectedReferralId,
  );
  const canCreateFeedback =
    selectedReferral &&
    ["Received", "For Monitoring", "Under Assessment"].includes(
      selectedReferral.status,
    );
  const isCompletedReferral = selectedReferral?.status === "Completed";

  function getCurrentStep() {
    if (!selectedReferral) return 0;
    switch (selectedReferral.status) {
      case "Pending":
        return 0;
      case "Received":
        return 1;
      case "For Monitoring":
      case "Under Assessment":
        return 2;
      case "Completed":
        return 3;
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

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!selectedReferral || !canCreateFeedback) return;

    const feedback = {
      dateOfReceipt: form.dateReceived,
      timeOfReceipt: form.timeReceived,
      receivingFacility: "Rural Health Unit Bulakan",
      receivingPractitioner: form.receivingPersonnel,
      rhuDiagnosis: form.rhuDiagnosis,
      actionsTaken: form.actionsTaken,
      recommendation: form.recommendation,
      monitoringStatus: form.monitoringStatus,
      remarks: form.remarks,
      submittedAt: new Date().toISOString(),
    };

    const updated = await updateReferralByTrackingId(
      selectedReferral.trackingId,
      {
        status: "Completed",
        feedback,
        completedAt: new Date().toISOString(),
      },
    );

    if (updated) {
      setReferrals((prev) =>
        prev.map((referral) =>
          referral.trackingId === updated.trackingId ? updated : referral,
        ),
      );
    }

    setSubmitted(true);
  }

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Return Slip">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading referral...
        </div>
      </DashboardLayout>
    );
  }

  if (notFound) {
    return (
      <DashboardLayout role="rhu" title="Return Slip">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <AlertCircle size={28} />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-slate-800">
            Referral Not Found
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            No referral exists with tracking ID{" "}
            <span className="font-mono font-medium text-slate-800">
              {routeTrackingId}
            </span>
            .
          </p>
          <Link
            to="/rhu/incoming-referrals"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <ArrowLeft size={14} />
            Back to Incoming Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (submitted) {
    return (
      <DashboardLayout role="rhu" title="Return Slip Submitted">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">
            Return Slip Submitted
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            The RHU return slip has been recorded for the selected referral.
          </p>

          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-5 text-left">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Tracking ID" value={selectedReferral?.trackingId} />
              <Info
                label="Patient"
                value={
                  selectedReferral?.patientName || selectedReferral?.patient
                }
              />
              <Info
                label="Referring BHC"
                value={
                  selectedReferral?.bhc || selectedReferral?.referringFacility
                }
              />
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
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              Back to Referrals
            </Link>
            <button
              onClick={() => {
                setSubmitted(false);
                if (!isAutoLoaded) setSelectedReferralId("");
              }}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Create Another Return Slip
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isCompletedReferral) {
    return (
      <CompletedReturnSlip
        referral={selectedReferral}
        feedback={selectedReferral.feedback}
      />
    );
  }

  if (selectedReferral && !canCreateFeedback) {
    return (
      <DashboardLayout role="rhu" title="Return Slip">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <AlertCircle size={28} />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-slate-800">
            Return Slip Not Available
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create Return Slip is only available when a referral is Received or
            For Monitoring. Current status:{" "}
            <span className="font-medium text-slate-800">
              {selectedReferral.status}
            </span>
          </p>
          <Link
            to={`/rhu/referrals/${selectedReferral.trackingId}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <ArrowLeft size={14} />
            Back to Referral Details
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="rhu" title="Return Slip">
      <div className="mx-auto max-w-4xl">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            to="/rhu/incoming-referrals"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft size={14} />
            Back to Incoming Referrals
          </Link>

          {!isAutoLoaded && (
            <>
              <h1 className="mt-3 text-xl font-semibold text-slate-900">
                Return Slip
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Submit the RHU return slip after patient assessment and return
                the update to the referring BHC.
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 pb-4">
          {/* Referral Selection (hidden when auto-loaded) */}
          {!isAutoLoaded && (
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <SectionHeader
                icon={<ClipboardList size={18} />}
                title="Select Referral Record"
                description="Choose the referral that will receive an RHU return slip."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Search / Select Tracking ID
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                    <Clock size={14} className="text-slate-300" />
                    <select
                      value={selectedReferralId}
                      onChange={(e) => setSelectedReferralId(e.target.value)}
                      required
                      className="h-10 flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none"
                    >
                      <option value="">Select referral</option>
                      {referrals
                        .filter(
                          (r) =>
                            r.status === "Received" ||
                            r.status === "For Monitoring" ||
                            r.status === "Under Assessment",
                        )
                        .map((referral) => (
                          <option
                            key={referral.trackingId}
                            value={referral.trackingId}
                          >
                            {referral.trackingId} —{" "}
                            {referral.patientName || referral.patient} (
                            {referral.status})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {selectedReferral && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Selected Referral
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedReferral.patientName || selectedReferral.patient}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedReferral.trackingId} · {selectedReferral.ageSex}{" "}
                      ·{" "}
                      {selectedReferral.bhc ||
                        selectedReferral.referringFacility}
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
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<Clock size={18} />}
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
                    <option>Coordinated Follow-up</option>
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
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<Stethoscope size={18} />}
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
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<FileText size={18} />}
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
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex gap-3">
                  <FileText
                    size={16}
                    className="mt-0.5 flex-shrink-0 text-slate-400"
                  />
                  <p className="text-xs leading-relaxed text-slate-500">
                    <span className="font-medium text-slate-700">
                      Clinical Note:
                    </span>{" "}
                    This form serves as the RHU return slip. It updates the
                    referral record and informs the BHC about RHU assessment,
                    action taken, and monitoring status. Ensure all clinical
                    findings are accurate before submission.
                  </p>
                </div>
              </section>
            </>
          )}

          {/* Empty state */}
          {!isAutoLoaded && !selectedReferral && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-300">
                <ClipboardList size={22} />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-400">
                Select a referral to begin
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Choose a Received or For Monitoring referral from the dropdown
                above.
              </p>
            </div>
          )}
        </form>

        {/* Action Footer - placed at the end of the scroll, not fixed */}
        {selectedReferral && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-slate-800">
                  {selectedReferral.trackingId}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {selectedReferral.patientName || selectedReferral.patient}
                </p>
              </div>

              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <Send size={14} />
                  Submit Return Slip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/* ─── Completed Return Slip View ─── */
function CompletedReturnSlip({ referral, feedback }) {
  return (
    <DashboardLayout role="rhu" title="Return Slip">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            to={`/rhu/referrals/${referral.trackingId}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft size={14} />
            Back to Referral Details
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="font-mono text-sm font-semibold text-slate-800">
                {referral.trackingId}
              </p>
              <h1 className="mt-2 text-xl font-semibold text-slate-900">
                View Return Slip
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Completed RHU return slip for this referral.
              </p>
            </div>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              Completed
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Info
              label="Patient"
              value={referral.patientName || referral.patient}
            />
            <Info
              label="Referring BHC"
              value={referral.referringFacility || referral.bhc}
            />
            <Info label="Date Received" value={feedback?.dateOfReceipt} />
            <Info label="Time Received" value={feedback?.timeOfReceipt} />
            <Info
              label="Receiving Personnel"
              value={feedback?.receivingPractitioner}
            />
            <Info
              label="Monitoring Status"
              value={feedback?.monitoringStatus}
            />
          </div>

          {feedback ? (
            <div className="mt-6 space-y-4">
              <ReturnSlipBlock
                label="RHU Diagnosis / Findings"
                value={feedback.rhuDiagnosis}
              />
              <ReturnSlipBlock
                label="Actions Taken"
                value={feedback.actionsTaken}
              />
              <ReturnSlipBlock
                label="Recommendation / Follow-up Instructions"
                value={feedback.recommendation}
              />
              <ReturnSlipBlock
                label="Additional Remarks"
                value={feedback.remarks}
              />
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-400">
                No return slip details attached.
              </p>
              <p className="mt-1 text-xs text-slate-300">
                This referral is completed, but no feedback payload is stored.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReturnSlipBlock({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        {value}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}
