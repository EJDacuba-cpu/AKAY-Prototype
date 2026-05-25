import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Search,
  Send,
  Stethoscope,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function FeedbackReturnSlip() {
  const [selectedReferralId, setSelectedReferralId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const referrals = [
    {
      trackingId: "AKY-2026-001",
      patient: "Juan Reyes",
      ageSex: "31/M",
      bhc: "Pitpitan Health Center",
      category: "B1",
      priority: "Medium",
      concern: "Hypertension",
      status: "Received",
    },
    {
      trackingId: "AKY-2026-002",
      patient: "Maria Rosa",
      ageSex: "31/F",
      bhc: "Pitpitan Health Center",
      category: "C2",
      priority: "High",
      concern: "Pregnancy-related abdominal pain",
      status: "For Monitoring",
    },
    {
      trackingId: "AKY-2026-005",
      patient: "Antonio Santos",
      ageSex: "29/M",
      bhc: "Taliptip Health Center",
      category: "B1",
      priority: "Medium",
      concern: "Needs RHU monitoring",
      status: "For Monitoring",
    },
  ];

  const selectedReferral = referrals.find(
    (referral) => referral.trackingId === selectedReferralId,
  );

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
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <DashboardLayout role="rhu" title="Feedback / Return Slip">
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

          <button
            onClick={() => setSubmitted(false)}
            className="mt-8 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
          >
            Create Another Feedback
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="rhu" title="Feedback / Return Slip">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          Feedback / Return Slip
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Submit RHU feedback after patient assessment and return the update to
          the referring BHC.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
              <ClipboardList size={20} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Select Referral Record
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Choose the referral that will receive RHU feedback.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Search / Select Tracking ID
              </label>

              <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
                <Search size={14} className="text-[#BCC3CD]" />
                <select
                  value={selectedReferralId}
                  onChange={(e) => setSelectedReferralId(e.target.value)}
                  required
                  className="h-10 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                >
                  <option value="">Select referral</option>
                  {referrals.map((referral) => (
                    <option
                      key={referral.trackingId}
                      value={referral.trackingId}
                    >
                      {referral.trackingId} - {referral.patient}
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
                  {selectedReferral.trackingId} · {selectedReferral.ageSex} ·{" "}
                  {selectedReferral.bhc}
                </p>
              </div>
            )}
          </div>

          {selectedReferral && (
            <div className="mt-5 grid gap-4 rounded-xl bg-[#F8FAFC] p-5 md:grid-cols-4">
              <Info label="Category" value={selectedReferral.category} />
              <Info label="Priority" value={selectedReferral.priority} />
              <Info label="Concern" value={selectedReferral.concern} />
              <Info label="Current Status" value={selectedReferral.status} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
              <Stethoscope size={20} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                RHU Assessment Details
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Record the RHU diagnosis, actions taken, and recommendation.
              </p>
            </div>
          </div>

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

          <div className="mt-4 space-y-4">
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

            <FieldTextarea
              label="Recommendation / Follow-up Instructions"
              name="recommendation"
              value={form.recommendation}
              onChange={handleChange}
              placeholder="Write recommendation, follow-up schedule, or monitoring instruction..."
              required
            />

            <FieldTextarea
              label="Additional Remarks"
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              placeholder="Optional remarks..."
            />
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex gap-3">
            <FileText size={18} className="text-[#0B2E59]" />
            <p className="text-xs leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#0B2E59]">Note:</span> This
              feedback serves as the RHU return slip. It updates the referral
              record and informs the BHC about RHU assessment, action taken, and
              monitoring status.
            </p>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F9FAFB]"
          >
            Save as Draft
          </button>

          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
          >
            <Send size={15} />
            Submit Feedback
          </button>
        </div>
      </form>
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
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
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
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
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
        className="min-h-24 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}
