import { Link, useLocation, useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FilePlus2,
  Pencil,
  User,
  X,
  Check,
  HeartPulse,
  Syringe,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import HealthRecordDetailsSkeleton from "../../components/common/loading/HealthRecordDetailsSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";

import { getPatientById } from "../../services/patientService";
import {
  getHealthRecordById,
  updateHealthRecord,
} from "../../services/healthRecordService";
import {
  getReferralByHealthRecordId,
  getReferralByTrackingId,
} from "../../services/referrals";

import {
  ConfirmationModal,
  FormInput,
  FormSelect,
  FormTextarea,
  SideCard,
  StatusBadge,
  SuccessModal
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";

import {
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const VACCINE_TIMELINE = [
  {
    id: "birth",
    label: "At Birth",
    vaccines: [
      { field: "bcg_vaccine", label: "BCG Vaccine" },
      { field: "hepb_birth", label: "Hep B Birth Dose" },
    ],
  },
  {
    id: "week6",
    label: "6 Weeks",
    vaccines: [
      { field: "pentavalent_dose1", label: "Pentavalent Dose 1" },
      { field: "opv_dose1", label: "OPV Dose 1" },
      { field: "pcv_dose1", label: "PCV Dose 1" },
      { field: "ipv_dose1", label: "IPV Dose 1" },
    ],
  },
  {
    id: "week10",
    label: "10 Weeks",
    vaccines: [
      { field: "pentavalent_dose2", label: "Pentavalent Dose 2" },
      { field: "opv_dose2", label: "OPV Dose 2" },
      { field: "pcv_dose2", label: "PCV Dose 2" },
    ],
  },
  {
    id: "week14",
    label: "14 Weeks",
    vaccines: [
      { field: "pentavalent_dose3", label: "Pentavalent Dose 3" },
      { field: "opv_dose3", label: "OPV Dose 3" },
      { field: "pcv_dose3", label: "PCV Dose 3" },
      { field: "ipv_dose2", label: "IPV Dose 2" },
    ],
  },
  {
    id: "month9",
    label: "9 Months",
    vaccines: [{ field: "mmr_dose1", label: "MMR Dose 1" }],
  },
  {
    id: "month12",
    label: "12-15 Months",
    vaccines: [{ field: "mmr_dose2", label: "MMR Dose 2" }],
  },
];

export default function HealthRecordDetails() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);
  const [linkedReferral, setLinkedReferral] = useState(null);

  const [isEditing, setIsEditing] = useState(
    Boolean(location.state?.startInEditMode),
  );
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({});

  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecordDetails("bhc", recordId),
    queryFn: async () => {
      const recordData = await getHealthRecordById(recordId);
      const existingReferral =
        (await getReferralByHealthRecordId(recordId)) ||
        (!recordData?.isFollowUp && recordData?.linkedTrackingId
          ? await getReferralByTrackingId(recordData.linkedTrackingId)
          : null);
      const patientData = recordData?.patientId
        ? await getPatientById(recordData.patientId)
        : null;

      return { record: recordData, patient: patientData, linkedReferral: existingReferral };
    },
    enabled: Boolean(recordId),
  });

  useEffect(() => {
    if (!details) return;
    setRecord(details.record);
    setPatient(details.patient);
    setLinkedReferral(details.linkedReferral);
    if (details.record) initializeForm(details.record);
  }, [details]);

  const loading = isLoading && !details;

  function initializeForm(data) {
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
  }

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
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails("bhc", recordId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("bhc"),
      });
      if (record?.patientId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.patientDetails("bhc", record.patientId),
        });
      }
    } catch (error) {
      console.error("Failed to update health record info:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <HealthRecordDetailsSkeleton />
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0F172A]">
            Health record not found
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-block rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#7F1D1D]"
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
  const isImmunizationRecord = isImmunizationClassification(record, patient);
  const immunizationGroups = getImmunizationGroups(record);
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const recordCategory = formatDisplayValue(
    record.category ||
      record.classification ||
      record.recordType ||
      record.patientClassification ||
      patient?.category ||
      patient?.patientClassification,
    "General",
  );
  const patientClassification = recordCategory;

  return (
    <>
      <DashboardLayout role="bhc" title="Health Record Details">
        <RefreshingIndicator
          show={isFetching && !loading}
          label="Refreshing details..."
          className="mb-3"
        />

        {/* ─── Header ─── */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </button>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#0F172A]">
                  {record.diagnosis || "Medical Consultation"}
                </h1>
                <StatusBadge status={record.followUpStatus || "Consultation"} />
                {isFollowUp && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#B45309]">
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
                        className="font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
                      >
                        {patientName}
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
                    className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                  >
                    <Check size={14} />
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to={`/bhc/health-records/add?recordId=${record.id || record._id}&mode=edit`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                  >
                    <Pencil size={14} />
                    Edit Record
                  </Link>
                  <Link
                    to={`/bhc/health-records/add?recordId=${record.id || record._id}&mode=follow-up`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                  >
                    <FilePlus2 size={14} />
                    Add Follow-up Record
                  </Link>
                  {linkedReferral?.trackingId ? (
                    <Link
                      to={`/bhc/referrals/${linkedReferral.trackingId}`}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <ClipboardList size={14} />
                      View Referral
                    </Link>
                  ) : (
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
                      Submit Referral
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ═══ Clinical Record — Single Card ═══ */}
          <div className="space-y-6 lg:col-span-2">
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
                        <option>For Referral</option>
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

                  {patientClassification === "Maternal" && (
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
                      label="Visit Type"
                      value={recordCategory}
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

                  {patientClassification === "Maternal" && (
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

            {isImmunizationRecord && (
              <SideCard
                title="Immunization Details"
                icon={<Syringe size={14} />}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      Vaccine Schedule
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Vaccines recorded during this visit.
                    </p>
                  </div>

                  {immunizationGroups.length > 0 ? (
                    <div className="space-y-3">
                      {immunizationGroups.map((group) => (
                        <div
                          key={group.id}
                          className="rounded-xl border border-slate-100 bg-slate-50/40 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </h3>
                            <span className="text-[11px] font-medium text-slate-400">
                              {group.administeredCount}/{group.vaccines.length}{" "}
                              administered
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {group.vaccines.map((vaccine) => (
                              <div
                                key={vaccine.field}
                                className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-700">
                                    {vaccine.label}
                                  </p>
                                  {vaccine.dateAdministered && (
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                      Date administered:{" "}
                                      {vaccine.dateAdministered}
                                    </p>
                                  )}
                                </div>
                                <VaccineStatusBadge
                                  administered={vaccine.administered}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
                      <p className="text-xs text-slate-400">
                        No immunization details recorded for this visit.
                      </p>
                    </div>
                  )}
                </div>
              </SideCard>
            )}
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
                        patientName
                      }
                    />
                    <PatientDetailItem
                      label="Initial Registration Category"
                      value={formatDisplayValue(patient.category, "General")}
                    />
                    <PatientDetailItem
                      label="Age / Sex"
                      value={`${patient.age || "—"} yrs old / ${patient.sex || "—"}`}
                    />
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <Link
                      to={`/bhc/patients/${patient.id || patient._id}`}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
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
        description="The health record information has been successfully saved."
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

function isImmunizationClassification(record = {}, patient = {}) {
  return [
    record.classification,
    record.category,
    record.recordType,
    record.patientClassification,
    patient?.category,
    patient?.patientClassification,
  ].some((value) => String(value || "").toLowerCase() === "immunization");
}

function getImmunizationGroups(record = {}) {
  const data = record.immunizationData;
  if (!data || typeof data !== "object") return [];

  return VACCINE_TIMELINE.map((group) => {
    const vaccines = group.vaccines.map((vaccine) => {
      const dateAdministered =
        data[`${vaccine.field}_date`] ||
        data[`${vaccine.field}Date`] ||
        data[`${vaccine.field}_date_administered`] ||
        "";

      return {
        ...vaccine,
        administered: Boolean(data[vaccine.field]),
        dateAdministered,
      };
    });

    return {
      ...group,
      vaccines,
      administeredCount: vaccines.filter((vaccine) => vaccine.administered)
        .length,
    };
  });
}

function VaccineStatusBadge({ administered }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        administered
          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
          : "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {administered ? "Administered" : "Not Administered"}
    </span>
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
