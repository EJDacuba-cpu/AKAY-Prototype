import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ClipboardList,
  QrCode,
  Send,
  User,
  FileText,
  Stethoscope,
  AlertTriangle,
  Printer,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";
import { createReferral } from "../../services/referrals";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes pulseSoft { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes checkDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
  .anim-fade-up  { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-scale-in { animation: scaleIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .pulse-soft    { animation: pulseSoft 2.5s ease-in-out infinite; }
  .check-draw    { stroke-dasharray: 24; animation: checkDraw 0.6s 0.3s ease both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

export default function CreateReferral() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetRecordId = searchParams.get("recordId");

  const today = new Date().toISOString().split("T")[0];
  const currentTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [patients, setPatients] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    setPatients(JSON.parse(localStorage.getItem("patients")) || []);
    setHealthRecords(
      JSON.parse(localStorage.getItem("bhc_health_records")) || [],
    );
  }, []);

  useEffect(() => {
    if (!targetRecordId) return;
    const foundRecord = healthRecords.find(
      (r) => r.id === targetRecordId || r._id === targetRecordId,
    );
    if (foundRecord) {
      setRecord(foundRecord);
      const foundPatient = patients.find((p) => p.id === foundRecord.patientId);
      if (foundPatient) setPatient(foundPatient);
    }
  }, [targetRecordId, patients, healthRecords]);

  const [form, setForm] = useState({
    dateOfReferral: today,
    timeOfReferral: currentTime,
    referredFacility: "Rural Health Unit of Bulakan",
    preferredVisitDate: "",
    preferredVisitTime: "",
    reasonForReferral: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [generatedTrackingId, setGeneratedTrackingId] = useState("");

  const recordIdDisplay = record?.id || record?._id || targetRecordId;

  const suggestedSpecialization = useMemo(() => {
    const cat = (
      patient?.category ||
      patient?.patientClassification ||
      ""
    ).toLowerCase();
    if (cat === "pregnant patient" || cat === "maternal")
      return "Maternal Care";
    if (cat === "children" || cat === "pediatric" || cat === "immunization")
      return "Pediatrics";
    return "General Consultation";
  }, [patient]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setShowConfirmModal(true);
  }

  async function confirmReferralSubmission() {
    const referral = await createReferral({
      patientId: patient?.id,
      patientName: patient?.name,
      ageSex:
        patient?.ageSex || `${patient?.age || ""} / ${patient?.sex || ""}`,
      classification:
        patient?.category ||
        patient?.patientClassification ||
        "General Consultation",
      healthRecordId: record?.id || record?._id,
      chiefComplaint: record?.chiefComplaint,
      diagnosis: record?.diagnosis || record?.assessment,
      reasonForReferral: form.reasonForReferral,
      referredFacility: form.referredFacility,
    });
    setGeneratedTrackingId(referral.trackingId);
    setShowConfirmModal(false);
    setSubmitted(true);
  }

  /* ─── Error: No Context ─── */
  if (!targetRecordId || !record) {
    return (
      <DashboardLayout role="bhc" title="Create Referral">
        <style>{keyframes}</style>
        <div className="anim-fade-up mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Missing Context</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500 mx-auto">
            Referrals must be initiated from an existing Health Record
            consultation. Please go to a patient&apos;s Health Record details
            and click &quot;Create Referral&quot;.
          </p>
          <Link
            to="/bhc/health-records"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
          >
            Go to Health Records
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Success Screen ─── */
  if (submitted) {
    return (
      <DashboardLayout role="bhc" title="Referral Transmitted">
        <style>{keyframes}</style>
        <div className="mx-auto max-w-2xl py-10">
          <div className="anim-fade-up mb-8 text-center" style={stagger(0)}>
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 anim-scale-in"
              style={stagger(1)}
            >
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path
                  className="check-draw"
                  d="M10 16.5L14 20.5L22 12.5"
                  stroke="#059669"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">
              Referral Successfully Escalated
            </h1>
            <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
              The consultation has been securely transmitted to the receiving
              facility for review and scheduling.
            </p>
          </div>

          <div
            className="anim-fade-up rounded-2xl border border-slate-200 bg-white overflow-hidden"
            style={stagger(2)}
          >
            <div className="bg-[#B91C1C] px-6 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-red-200" />
                <span className="text-[11px] font-semibold text-red-100 tracking-wide uppercase">
                  Referral Verification
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center p-8">
              <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-slate-200 bg-white">
                <QrCode size={72} className="text-[#B91C1C]" />
              </div>
              <p className="mt-4 font-mono text-sm font-bold text-slate-700 tracking-widest">
                {generatedTrackingId}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Scan QR for referral verification
              </p>
            </div>
          </div>

          <div
            className="anim-fade-up mt-4 rounded-2xl border border-slate-200 bg-white p-6"
            style={stagger(3)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="Tracking ID" value={generatedTrackingId} mono />
              <Info label="Patient" value={patient?.name || "—"} highlight />
              <Info
                label="Suggested Specialization"
                value={suggestedSpecialization}
              />
              <Info
                label="Destination Facility"
                value={form.referredFacility}
                highlight
              />
            </div>
          </div>

          <div
            className="anim-fade-up mt-6 flex justify-center gap-3"
            style={stagger(4)}
          >
            <button
              onClick={() => navigate("/bhc/referrals")}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Go to Referrals
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Printer size={14} /> Print Slip
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Main Form ─── */
  return (
    <DashboardLayout role="bhc" title="Escalate to RHU">
      <style>{keyframes}</style>

      {/* ─── Confirm Modal ─── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden anim-scale-in">
            <div className="h-1 bg-[#B91C1C]" />
            <div className="p-7">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#B91C1C]">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-center text-lg font-bold text-slate-800">
                Confirm Referral Submission
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
                You are about to officially refer this patient to the RHU. This
                action will generate a tracking reference and referral QR code.
              </p>
              <div className="mt-5 rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2.5">
                <Info label="Patient" value={patient?.name} highlight />
                <Info label="Destination" value={form.referredFacility} />
                <Info
                  label="Consultation Record"
                  value={recordIdDisplay}
                  mono
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReferralSubmission}
                  className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
                >
                  <Send size={14} />
                  Confirm & Refer Patient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Page Content ─── */}
      <div className="mx-auto max-w-4xl pb-12">
        {/* Header */}
        <div className="anim-fade-up mb-6" style={stagger(0)}>
          <Link
            to="/bhc/health-records"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#B91C1C]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-[#B91C1C]">
              Create Referral
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1">
              <ClipboardList size={11} className="text-[#B91C1C]/60" />
              <span className="font-mono text-[11px] font-semibold text-[#B91C1C]/80">
                {recordIdDisplay}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            Review the consultation context and configure escalation details for
            the receiving facility.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ═══════════════════════════════════
              SECTION 1: Referral Information
          ═══════════════════════════════════ */}
          <FormDocument
            title="Referral Information"
            subtitle="Configure destination facility and escalation details"
            icon={<Send size={14} />}
            delay={1}
          >
            <SectionDivider label="System-Generated Metadata" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3 md:grid-cols-4">
              <MetaField
                label="Name Of Referring HCI"
                value="Pitpitan Health Center"
              />
              <MetaField label="Referring Practitioner" value="Lorna Reyes" />
              <MetaField label="Date of Referral" value={form.dateOfReferral} />
              <MetaField label="Time of Referral" value={form.timeOfReferral} />
            </div>

            <SectionDivider label="Destination & Scheduling" />
            <div className="pt-3 pb-1">
              <FieldInput
                label="Referred Facility"
                name="referredFacility"
                value={form.referredFacility}
                onChange={handleChange}
                required
              />
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 2: Patient Information
          ═══════════════════════════════════ */}
          <FormDocument
            title="Patient Information"
            subtitle="Linked patient demographic overview"
            icon={<User size={14} />}
            headerRight={
              <Link
                to={`/bhc/patients/${patient?.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-red-200 hover:text-[#B91C1C]"
              >
                <ExternalLink size={11} /> Open Patient Details
              </Link>
            }
            delay={2}
          >
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3 pb-1">
              <MetaField
                label="Name Of Patient"
                value={patient?.name || "—"}
                bold
              />
              <MetaField label="Date of Birth" value={patient?.dob || "—"} />
              <MetaField
                label="Address"
                value={
                  [
                    patient?.address || patient?.streetAddress,
                    patient?.barangay,
                    patient?.municipality,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
                span
              />
              <MetaField
                label="Age / Sex"
                value={
                  patient?.ageSex ||
                  (patient?.age ? `${patient.age} yrs / ${patient.sex}` : "—")
                }
              />
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 3: Clinical Assessment
          ═══════════════════════════════════ */}
          <FormDocument
            title="Clinical Assessment"
            subtitle="Key findings from the linked consultation record"
            icon={<FileText size={14} />}
            headerRight={
              <Link
                to={`/bhc/health-records/${record.id || record._id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-red-200 hover:text-[#B91C1C]"
              >
                <ExternalLink size={11} /> Open Full Consultation
              </Link>
            }
            delay={3}
          >
            <SectionDivider label="Consultation Details" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
              <MetaField
                label="Date / Time"
                value={`${record.dateOfVisit} at ${record.timeOfVisit || "—"}`}
              />
              <MetaField
                label="Attending Staff"
                value={record.attendingStaff || "—"}
              />
            </div>

            <SectionDivider label="Chief Complaint" />
            <div className="pt-3">
              <NarrativeField
                value={record.chiefComplaint}
                emptyText="No chief complaint recorded."
              />
            </div>

            <SectionDivider label="Summary of Present Illness & Physical Examination" />
            <div className="pt-3">
              <NarrativeField
                value={record.summaryOfPresentIllness}
                emptyText="No summary of present illness or physical examination documented."
              />
            </div>

            <SectionDivider label="Initial Diagnosis" />
            <div className="pt-3">
              <NarrativeField
                value={record.diagnosis || record.assessment}
                emptyText="No initial diagnosis recorded."
              />
            </div>

            <SectionDivider label="Initial Actions Taken" />
            <div className="pt-3 pb-1">
              <NarrativeField
                value={record.actiontaken || record.medication}
                emptyText="No initial actions taken recorded."
              />
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 4: Clinical Escalation Notes
          ═══════════════════════════════════ */}
          <FormDocument
            title="Clinical Escalation Notes"
            subtitle="Document the clinical reasoning for this referral"
            icon={<Stethoscope size={14} />}
            delay={4}
          >
            <div className="pt-3 pb-1">
              <FieldTextarea
                label="Reason for Referral"
                name="reasonForReferral"
                value={form.reasonForReferral}
                onChange={handleChange}
                placeholder="State the specific clinical triggers or escalation reasons based on the consultation..."
                required
              />
            </div>
          </FormDocument>

          {/* ─── Actions ─── */}
          <div
            className="anim-fade-up flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4"
            style={stagger(5)}
          >
            <p className="text-xs text-slate-400">
              <span className="font-semibold text-slate-500">Note:</span>{" "}
              Referral will be logged and linked to the health record upon
              submission.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
              >
                <Send size={14} /> Submit Referral Slip
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   LAYOUT COMPONENTS
──────────────────────────────────────────── */

function FormDocument({ title, subtitle, icon, headerRight, children, delay }) {
  return (
    <div
      className="anim-fade-up rounded-2xl border border-slate-200 bg-white"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
            {icon}
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {headerRight}
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-3">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   FIELD COMPONENTS
──────────────────────────────────────────── */

function MetaField({ label, value, mono, bold, span }) {
  let display = (
    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-slate-700">
      {value || "—"}
    </p>
  );
  if (bold)
    display = (
      <p className="mt-0.5 text-[13px] font-bold leading-relaxed text-slate-800">
        {value || "—"}
      </p>
    );
  if (mono)
    display = (
      <p className="mt-0.5 font-mono text-[13px] font-bold text-[#B91C1C]">
        {value}
      </p>
    );

  return (
    <div className={`py-1 ${span ? "md:col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {display}
    </div>
  );
}

function Info({ label, value, mono, highlight }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
          mono ? "font-mono" : ""
        } ${
          highlight ? "font-bold text-slate-800" : "font-medium text-slate-700"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function FieldInput({ label, name, value, onChange, type = "text", required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition-all focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />
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
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={5}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none transition-all focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   CLINICAL DISPLAY
──────────────────────────────────────────── */

function NarrativeField({ value, emptyText }) {
  if (!value) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-6 text-center">
        <p className="text-xs text-slate-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {value}
      </p>
    </div>
  );
}
