import { Link, useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Pencil,
  User,
  X,
  Check,
  HeartPulse,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";

import { getPatientById } from "../../services/patientService";
import {
  getHealthRecordById,
  updateHealthRecord,
} from "../../services/healthRecordService";

import SideCard from "../../components/common/cards/SideCard";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import StatusBadge from "../../components/common/badges/StatusBadge";

import FormInput from "../../components/common/forms/FormInput";
import FormSelect from "../../components/common/forms/FormSelect";
import FormTextarea from "../../components/common/forms/FormTextarea";

import ConfirmationModal from "../../components/common/modals/ConfirmationModal";
import SuccessModal from "../../components/common/modals/SuccessModal";

export default function HealthRecordDetails() {
  const { recordId } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({});

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const recordData = await getHealthRecordById(recordId);
        setRecord(recordData);

        if (recordData) {
          initializeForm(recordData);

          if (recordData.patientId) {
            const patientData = await getPatientById(recordData.patientId);
            setPatient(patientData);
          }
        }
      } catch (error) {
        console.error("Error fetching health record details:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [recordId]);

  const initializeForm = (data) => {
    setForm({
      diagnosis: data.diagnosis || "",
      chiefComplaint: data.chiefComplaint || "",
      summaryOfPresentIllness: data.summaryOfPresentIllness || "",
      consultationNotes: data.consultationNotes || "",
      medication: data.medication || "",
      vitalSigns: data.vitalSigns || "",
      followUpStatus: data.followUpStatus || "Consultation",
      attendingStaff: data.attendingStaff || "",
      aog: data.aog || "",
      expectedDeliveryDate: data.expectedDeliveryDate || "",
    });
  };

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleInlineSubmit() {
    try {
      setSaving(true);
      await updateHealthRecord(recordId, form);

      setRecord((prev) => ({
        ...prev,
        ...form,
      }));

      setOpenConfirm(false);
      setOpenSuccess(true);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update health record info:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm font-medium text-slate-400">
          Loading health record details...
        </div>
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0B2E59]">
            Health record not found
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-block rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#071f3d]"
          >
            Go Back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const isFollowUp =
    record.followUpStatus === "Follow-up After 2 Days" ||
    record.followUpStatus === "Under Observation";

  return (
    <>
      <DashboardLayout role="bhc" title="Health Record Details">
        {/* ─── Header ─── */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0B2E59]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </button>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#0B2E59]">
                  {record.diagnosis || "Medical Consultation"}
                </h1>
                <StatusBadge status={record.followUpStatus || "Consultation"} />
                {isFollowUp && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
                    <CalendarDays size={12} />
                    Requires Follow-up
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  {recordId}
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  {record.dateOfVisit} at {record.timeOfVisit}
                </span>
                {patient && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>
                      Patient:{" "}
                      <Link
                        to={`/bhc/patients/${patient.id || patient._id}`}
                        className="font-semibold text-[#0B2E59] hover:underline"
                      >
                        {patient.name ||
                          `${patient.firstName} ${patient.lastName}`}
                      </Link>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      initializeForm(record);
                      setIsEditing(false);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenConfirm(true)}
                    className="flex items-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#092347]"
                  >
                    <Check size={14} />
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0B2E59] shadow-sm transition hover:bg-slate-50"
                  >
                    <Pencil size={14} />
                    Edit Record
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/bhc/referrals/create?recordId=${record.id || record._id}`,
                      )
                    }
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <ClipboardList size={14} />
                    Create Referral
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ═══ Clinical Record — Single Card ═══ */}
          <div className="lg:col-span-2">
            <SideCard title="Clinical Record" icon={<HeartPulse size={14} />}>
              {isEditing ? (
                /* ── Edit Mode ── */
                <div className="space-y-1">
                  <SectionDivider label="Clinical Assessment" />
                  <div className="pt-3">
                    <div className="grid gap-5 md:grid-cols-2">
                      <FormInput
                        label="Diagnosis / Assessment"
                        name="diagnosis"
                        value={form.diagnosis}
                        onChange={handleChange}
                        required
                      />
                      <FormSelect
                        label="Follow-up Status"
                        name="followUpStatus"
                        value={form.followUpStatus}
                        onChange={handleChange}
                        required
                      >
                        <option>Consultation</option>
                        <option>Under Observation</option>
                        <option>Follow-up After 2 Days</option>
                        <option>Discharged</option>
                        <option>Referred to Hospital</option>
                      </FormSelect>
                    </div>
                  </div>
                  <div className="pt-4">
                    <FormTextarea
                      label="Chief Complaint"
                      name="chiefComplaint"
                      value={form.chiefComplaint}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="pt-4">
                    <FormTextarea
                      label="Summary of Present Illness"
                      name="summaryOfPresentIllness"
                      value={form.summaryOfPresentIllness}
                      onChange={handleChange}
                      placeholder="Details of the patient's current symptoms, onset, duration, and severity..."
                    />
                  </div>

                  <SectionDivider label="Treatment & Actions" />
                  <div className="pt-3">
                    <FormTextarea
                      label="Initial Action Taken / Medication"
                      name="medication"
                      value={form.medication}
                      onChange={handleChange}
                    />
                  </div>

                  <SectionDivider label="Vital Signs" />
                  <div className="pt-3">
                    <FormTextarea
                      label="Vital Signs Summary"
                      name="vitalSigns"
                      value={form.vitalSigns}
                      onChange={handleChange}
                      placeholder="e.g., BP: 120/80 mmHg, Temp: 36.5°C, HR: 80 bpm, Weight: 60kg"
                    />
                  </div>

                  {patient?.category === "Maternal" && (
                    <>
                      <SectionDivider label="Maternal Parameters" />
                      <div className="grid gap-5 pt-3 md:grid-cols-2">
                        <FormInput
                          label="Age of Gestation (AOG)"
                          name="aog"
                          value={form.aog}
                          onChange={handleChange}
                        />
                        <FormInput
                          label="Expected Delivery Date (EDD)"
                          name="expectedDeliveryDate"
                          type="date"
                          value={form.expectedDeliveryDate}
                          onChange={handleChange}
                        />
                      </div>
                    </>
                  )}

                  <SectionDivider label="Attending Staff" />
                  <div className="pt-3 pb-2">
                    <FormInput
                      label="Attending Staff / Midwife"
                      name="attendingStaff"
                      value={form.attendingStaff}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              ) : (
                /* ── View Mode ── */
                <div className="space-y-1">
                  <SectionDivider label="Clinical Assessment" />
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
                    <PatientDetailItem
                      label="Classification"
                      value={patient?.category || "General Consultation"}
                    />
                    <PatientDetailItem
                      label="Initial Diagnosis"
                      value={record.diagnosis || "—"}
                    />
                    <PatientDetailItem
                      label="Follow-up Status"
                      value={record.followUpStatus || "Consultation"}
                    />
                    <PatientDetailItem
                      label="Attending Staff"
                      value={record.attendingStaff || "—"}
                    />
                  </div>
                  <div className="pt-2">
                    <PatientDetailItem
                      label="Chief Complaint"
                      value={record.chiefComplaint || "—"}
                    />
                  </div>
                  <div className="pt-2">
                    <NarrativeBox
                      label="Summary of Present Illness"
                      value={record.summaryOfPresentIllness}
                      emptyText="No summary of present illness documented."
                    />
                  </div>

                  <SectionDivider label="Treatment & Actions" />
                  <div className="pt-3">
                    <PatientDetailItem
                      label="Initial Action Taken"
                      value={record.medication || "No actions recorded"}
                    />
                  </div>

                  <SectionDivider label="Vital Signs" />
                  <div className="pt-3">
                    <NarrativeBox
                      label="Recorded Vitals"
                      value={record.vitalSigns}
                      emptyText="No vital signs recorded for this visit."
                    />
                  </div>

                  {patient?.category === "Maternal" && (
                    <>
                      <SectionDivider label="Maternal Parameters" />
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
                        <PatientDetailItem
                          label="Age of Gestation (AOG)"
                          value={record.aog || "—"}
                        />
                        <PatientDetailItem
                          label="Expected Delivery Date (EDD)"
                          value={record.expectedDeliveryDate || "—"}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </SideCard>
          </div>

          {/* ═══ Sidebar ═══ */}
          <aside className="space-y-6">
            <SideCard title="Patient Profile" icon={<User size={14} />}>
              {patient ? (
                <div>
                  <div className="space-y-1">
                    <PatientDetailItem
                      label="Full Name"
                      value={
                        patient.name ||
                        `${patient.firstName} ${patient.lastName}`
                      }
                    />
                    <PatientDetailItem
                      label="Classification"
                      value={patient.category || "General"}
                    />
                    <PatientDetailItem
                      label="Age / Sex"
                      value={`${patient.age || "—"} yrs old / ${patient.sex || "—"}`}
                    />
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <Link
                      to={`/bhc/patients/${patient.id || patient._id}`}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-[#0B2E59] shadow-sm transition hover:bg-slate-50"
                    >
                      View Full Patient Profile
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  Patient data unavailable.
                </div>
              )}
            </SideCard>
          </aside>
        </div>
      </DashboardLayout>

      <ConfirmationModal
        open={openConfirm}
        title="Update Health Record?"
        description="Please confirm that you want to apply the updated details to this health record."
        confirmText="Update Record"
        cancelText="Cancel"
        onConfirm={handleInlineSubmit}
        onCancel={() => setOpenConfirm(false)}
        loading={saving}
      />

      <SuccessModal
        open={openSuccess}
        title="Health Record Updated"
        description="The consultation information has been successfully saved."
        onClose={() => setOpenSuccess(false)}
      />
    </>
  );
}

/* ─────────────────────────────────────────────
   LOCAL HELPERS
──────────────────────────────────────────── */

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-2">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function NarrativeBox({ label, value, emptyText }) {
  if (!value) {
    if (emptyText) {
      return (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
          <p className="text-xs text-slate-400">{emptyText}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      {label && (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
        {value}
      </p>
    </div>
  );
}
