import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Send,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import { SoftLoadingArea } from "../../components/common";

import { getReferrals, submitReturnSlip } from "../../services/referrals";
import {
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";
import { queryKeys } from "../../utils/queryKeys";

const OUTCOME_OPTIONS = [
  "Managed at RHU",
  "Follow-up Required",
  "Continue care at BHC",
  "Coordinated Follow-up",
  "Referred back to BHC for monitoring",
];

function StatusStepper({ currentStep }) {
  const steps = [
    { label: "BHC Referral", sub: "Referral sent to RHU" },
    { label: "RHU Received", sub: "Patient checked in" },
    { label: "RHU Review", sub: "Return slip documentation" },
    { label: "Return Slip Sent", sub: "Final RHU response to BHC" },
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
            Current stage in the BHC-RHU coordination loop
          </p>
        </div>
      </div>

      <div className="flex items-start">
        {steps.map((step, i) => {
          const completed = i < currentStep;
          const active = i === currentStep;
          const isLast = i === steps.length - 1;

          return (
            <Fragment key={step.label}>
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
                <div className="flex flex-1 items-start px-1 pt-[18px]">
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
          {referral.ageSex || "Age / Sex not recorded"}
        </span>
      </div>

      <div className="p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {getPatientName(referral)}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {getReferralCategory(referral)}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem
            icon={<Building2 size={13} />}
            label="Name of Referring HCI"
            value={getReferringHci(referral)}
          />
          <SummaryItem
            icon={<Stethoscope size={13} />}
            label="Chief Concern"
            value={referral.chiefComplaint || referral.concern}
          />
          <SummaryItem
            icon={<UserCheck size={13} />}
            label="Receiving Facility"
            value={getReceivingFacility(referral)}
          />
          <SummaryItem
            icon={<CalendarDays size={13} />}
            label="Date of Referral"
            value={formatDate(getReferralDate(referral))}
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
      <p className="mt-1 text-sm font-medium leading-snug text-slate-800">
        {value || "Not recorded"}
      </p>
    </div>
  );
}

function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  list,
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
        list={list}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
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
        className="h-10 w-full appearance-none rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
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
        className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    </div>
  );
}

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

export default function FeedbackReturnSlip() {
  const { trackingId: routeTrackingId } = useParams();
  const queryClient = useQueryClient();
  const [selectedReferralId, setSelectedReferralId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState([]);

  const isAutoLoaded = !!routeTrackingId;

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
  const selectedStatus = getOfficialStatus(selectedReferral?.status);
  const canCreateReturnSlip =
    selectedReferral &&
    (selectedStatus === "Received" || selectedStatus === "For Monitoring");
  const isCompletedReferral = selectedStatus === "Completed";

  function getCurrentStep() {
    if (!selectedReferral) return 0;
    if (selectedStatus === "Received") return 1;
    if (selectedStatus === "For Monitoring") return 2;
    if (selectedStatus === "Completed") return 3;
    return 0;
  }

  const [form, setForm] = useState({
    dateReceived: new Date().toISOString().split("T")[0],
    timeReceived: "",
    receivingPersonnel: "RHU Staff",
    rhuDiagnosis: "",
    actionsTaken: "",
    assessmentOutcome: "Managed at RHU",
    followUpDate: "",
    recommendation: "",
    remarks: "",
  });
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  const rhuDoctors = Array.isArray(doctorAvailability?.doctors)
    ? doctorAvailability.doctors
    : [];

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!selectedReferral || !canCreateReturnSlip || submitting) return;

    setSubmitting(true);

    const now = new Date().toISOString();
    const feedback = {
      dateOfReceipt: form.dateReceived,
      timeOfReceipt: form.timeReceived,
      receivingFacility: getReceivingFacility(selectedReferral),
      receivingPractitioner: form.receivingPersonnel,
      rhuDiagnosis: form.rhuDiagnosis,
      actionsTaken: form.actionsTaken,
      assessmentOutcome: form.assessmentOutcome,
      followUpDate: shouldShowFollowUpDate(form.assessmentOutcome)
        ? form.followUpDate
        : "",
      recommendation: form.recommendation,
      remarks: form.remarks,
      submittedAt: now,
    };

    try {
      const updated = await submitReturnSlip(selectedReferral.trackingId, {
        ...feedback,
        submittedBy: form.receivingPersonnel || "RHU Staff",
      });

      if (updated) {
        setReferrals((prev) =>
          prev.map((referral) =>
            referral.trackingId === updated.trackingId ? updated : referral,
          ),
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.referralDetails("bhc", updated.trackingId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.referralDetails("rhu", updated.trackingId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.referrals("bhc") });
        queryClient.invalidateQueries({
          queryKey: queryKeys.incomingReferrals("rhu"),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboardSummary("rhu"),
        });
      }

      setSubmitted(true);
    } catch {
      // The form remains available for a manual retry.
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Return Slip">
        <SoftLoadingArea
          isLoading
          message="Loading referral feedback..."
          minHeight="min-h-[420px]"
        >
          <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </SoftLoadingArea>
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
            The RHU return slip has been recorded and the referral is now
            completed.
          </p>

          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-5 text-left">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Tracking ID" value={selectedReferral?.trackingId} />
              <Info label="Patient" value={getPatientName(selectedReferral)} />
              <Info
                label="Name of Referring HCI"
                value={getReferringHci(selectedReferral)}
              />
              <Info
                label="RHU Return Slip Status"
                value={form.assessmentOutcome}
              />
              <Info
                label="Receiving Personnel"
                value={form.receivingPersonnel}
              />
              <Info label="Date Received" value={form.dateReceived} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to={`/rhu/referrals/${selectedReferral?.trackingId || ""}`}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              <ArrowLeft size={14} />
              Back to Referral Details
            </Link>
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

  if (selectedReferral && !canCreateReturnSlip) {
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
            Submit Return Slip is available only when a referral is Received or
            For Monitoring. Current status:{" "}
            <span className="font-medium text-slate-800">{selectedStatus}</span>
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
        <div className="mb-6">
          <Link
            to={
              selectedReferral
                ? `/rhu/referrals/${selectedReferral.trackingId}`
                : "/rhu/incoming-referrals"
            }
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft size={14} />
            {selectedReferral
              ? "Back to Referral Details"
              : "Back to Incoming Referrals"}
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
                        .filter((r) =>
                          ["Received", "For Monitoring"].includes(
                            getOfficialStatus(r.status),
                          ),
                        )
                        .map((referral) => (
                          <option
                            key={referral.trackingId}
                            value={referral.trackingId}
                          >
                            {referral.trackingId} - {getPatientName(referral)} (
                            {getOfficialStatus(referral.status)})
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
                      {getPatientName(selectedReferral)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedReferral.trackingId} -{" "}
                      {selectedReferral.ageSex || "Age / Sex not recorded"} -{" "}
                      {getReferringHci(selectedReferral)}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {selectedReferral && (
            <>
              <ReferralSummaryCard referral={selectedReferral} />
              <StatusStepper currentStep={getCurrentStep()} />

              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<Clock size={18} />}
                  title="Reception Details"
                  description="Record when and by whom the patient was received at the RHU."
                />
                <div className="grid gap-4 lg:grid-cols-3">
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
                  <FieldInput
                    label="Receiving Practitioner"
                    name="receivingPersonnel"
                    value={form.receivingPersonnel}
                    onChange={handleChange}
                    list="rhu-doctor-options"
                    required
                  />
                  <datalist id="rhu-doctor-options">
                    {rhuDoctors.map((doctor) => (
                      <option
                        key={doctor.doctorId || doctor.id}
                        value={doctor.doctorName || doctor.name}
                      />
                    ))}
                  </datalist>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<Stethoscope size={18} />}
                  title="Clinical Findings"
                  description="Record the RHU diagnosis and actions taken."
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
                    placeholder="Write actions taken by RHU personnel..."
                    required
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <SectionHeader
                  icon={<FileText size={18} />}
                  title="RHU Return Slip Status"
                  description="This status is part of the return slip and does not change the official referral status."
                />
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <FieldSelect
                      label="RHU Return Slip Status"
                      name="assessmentOutcome"
                      value={form.assessmentOutcome}
                      onChange={handleChange}
                      required
                    >
                      {OUTCOME_OPTIONS.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </FieldSelect>

                    {shouldShowFollowUpDate(form.assessmentOutcome) && (
                      <FieldInput
                        label="Follow-up Date"
                        name="followUpDate"
                        type="date"
                        value={form.followUpDate}
                        onChange={handleChange}
                      />
                    )}
                  </div>

                  <FieldTextarea
                    label="Remarks / Instructions to BHC"
                    name="recommendation"
                    value={form.recommendation}
                    onChange={handleChange}
                    placeholder="Write follow-up instructions or BHC monitoring notes..."
                    required
                  />
                  <FieldTextarea
                    label="Additional Notes"
                    name="remarks"
                    value={form.remarks}
                    onChange={handleChange}
                    placeholder="Optional remarks, notes, or observations..."
                    rows={2}
                  />
                </div>
              </section>
            </>
          )}

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

        {selectedReferral && (
          <div className="mt-6 ">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <Link
                  to={`/rhu/referrals/${selectedReferral.trackingId}`}
                  className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !canCreateReturnSlip}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? <ButtonSpinner /> : <Send size={14} />}
                  {submitting ? "Submitting..." : "Submit Return Slip"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

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
            <span className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#047857]">
              Completed
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Info label="Date of Receipt" value={feedback?.dateOfReceipt} />
            <Info label="Time of Receipt" value={feedback?.timeOfReceipt} />
            <Info label="Patient Name" value={getPatientName(referral)} />
            <Info label="Age / Sex" value={referral.ageSex} />
            <Info
              label="Name of Health Care Institution"
              value={feedback?.receivingFacility || getReceivingFacility(referral)}
            />
            <Info
              label="Name and Signature of Receiving Practitioner"
              value={feedback?.receivingPractitioner}
            />
            <Info
              label="RHU Return Slip Status"
              value={feedback?.assessmentOutcome || feedback?.monitoringStatus}
            />
            <Info label="Follow-up Date" value={feedback?.followUpDate} />
          </div>

          {feedback ? (
            <div className="mt-6 space-y-4">
              <ReturnSlipBlock
                label="Initial Diagnosis"
                value={feedback.rhuDiagnosis}
              />
              <ReturnSlipBlock
                label="Actions Taken"
                value={feedback.actionsTaken}
              />
              <ReturnSlipBlock
                label="Remarks / Instructions to BHC"
                value={feedback.recommendation}
              />
              <ReturnSlipBlock
                label="Additional Notes"
                value={feedback.remarks}
              />
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-400">
                No return slip details attached.
              </p>
              <p className="mt-1 text-xs text-slate-300">
                This referral is completed, but no return slip payload is
                stored.
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
      <p className="mt-1 text-sm font-medium text-slate-800">
        {value || "Not recorded"}
      </p>
    </div>
  );
}

function shouldShowFollowUpDate(outcome) {
  return (
    outcome === "Follow-up Required" || outcome === "Coordinated Follow-up"
  );
}

function getOfficialStatus(status) {
  const raw = String(status || "Pending").trim();
  if (
    ["Pending", "Received", "For Monitoring", "Completed", "No-Show"].includes(
      raw,
    )
  ) {
    return raw;
  }

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
  return String(value)
    .replace(/^barangay\s+/i, "")
    .trim();
}

function getReferringHci(referral = {}) {
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
    referral.referringBarangay || referral.patientBarangay || referral.barangay;

  return barangay
    ? `Barangay ${cleanBarangayName(barangay)} Health Center`
    : "Barangay Health Center";
}

function getReceivingFacility(referral = {}) {
  return (
    referral.receivingFacility ||
    referral.destinationFacility ||
    referral.rural_health_unit?.name ||
    referral.ruralHealthUnit?.name ||
    ""
  );
}

function getPatientName(referral = {}) {
  return referral.patientName || referral.patient || "Unknown Patient";
}

function getReferralCategory(referral = {}) {
  return referral.referralCategory || referral.category || "Unclassified";
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
