import { Link, useLocation, useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  FilePlus2,
  Pencil,
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
  SuccessModal
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";

import {
  formatDisplayValue,
  formatLongDate,
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
      diagnosis: getRecordDiagnosis(data, ""),
      chiefComplaint: getRecordChiefComplaint(data, ""),
      summaryOfPresentIllness: getRecordSummary(data, ""),
      consultationNotes: getRecordNotes(data, ""),
      medication: getRecordInitialActions(data, ""),
      vitalSigns: getVitalSigns(data, ""),
      followUpStatus: getRecordFollowUpStatus(data, "Consultation"),
      attendingStaff: getRecordPractitioner(data, ""),
      aog: getRecordValue(data, ["aog", "ageOfGestation", "age_of_gestation"], ""),
      expectedDeliveryDate: getRecordValue(
        data,
        ["expectedDeliveryDate", "expected_delivery_date", "edd"],
        "",
      ),
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

  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Consultation",
  );
  const canRecordFollowUpVisit = isFollowUpEligibleStatus(status);
  const showPatientProfileSidebar = false;
  const isImmunizationRecord = isImmunizationClassification(record, patient);
  const immunizationGroups = getImmunizationGroups(record);
  const patientId =
    patient?.id ||
    patient?._id ||
    record.patientId ||
    record.patient_id ||
    record.patient?.id ||
    record.patient?._id;
  const patientName = formatPatientName(
    patient || record.patient,
    record.patientName || record.patient_name || "Unnamed Patient",
  );
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
  const displayDate = formatLongDate(getRecordDateValue(record), "Not recorded");
  const displayTime = getRecordTime(record);

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
                <HealthRecordStatusBadge status={status} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  {recordId}
                </span>
                <span className="text-slate-300">•</span>
                <span>{displayDate}{displayTime ? ` at ${displayTime}` : ""}</span>
                {patientId && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>
                      Patient:{" "}
                      <Link
                        to={`/bhc/patients/${patientId}`}
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
                  {canRecordFollowUpVisit && (
                    <Link
                      to={`/bhc/health-records/add?recordId=${record.id || record._id}&mode=follow-up`}
                      title="This action creates a follow-up visit linked to the current health record."
                      aria-label="Record a follow-up visit linked to this health record"
                      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
                    >
                      <FilePlus2 size={14} />
                      Record Follow-up Visit
                    </Link>
                  )}
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
        <div className="space-y-6">
          {/* ═══ Clinical Record — Single Card ═══ */}
          <div className="space-y-6">
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
                      value={getRecordDiagnosis(record)}
                    />
                    <PatientDetailItem
                      label="Follow-up Status"
                      value={getRecordFollowUpStatus(record)}
                    />
                    <PatientDetailItem
                      label="Attending Staff"
                      value={getRecordPractitioner(record)}
                    />
                  </div>
                  <div className="pt-2">
                    <PatientDetailItem
                      label="Chief Complaint"
                      value={getRecordChiefComplaint(record)}
                    />
                  </div>
                  <div className="pt-2">
                    <NarrativeBox
                      label="Summary of Present Illness"
                      value={getRecordSummary(record, "")}
                      emptyText="Not recorded"
                    />
                  </div>

                  <SectionDivider label="Treatment & Actions" />
                  <div className="pt-3">
                    <PatientDetailItem
                      label="Initial Action Taken"
                      value={getRecordInitialActions(record)}
                    />
                  </div>

                  <SectionDivider label="Vital Signs" />
                  <div className="pt-3">
                    <NarrativeBox
                      label="Recorded Vitals"
                      value={getVitalSigns(record, "")}
                      emptyText="No vital signs recorded for this visit."
                    />
                  </div>

                  {patientClassification === "Maternal" && (
                    <>
                      <SectionDivider label="Maternal Parameters" />
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
                        <PatientDetailItem
                          label="Age of Gestation (AOG)"
                          value={getRecordValue(record, ["aog", "ageOfGestation", "age_of_gestation"])}
                        />
                        <PatientDetailItem
                          label="Expected Delivery Date (EDD)"
                          value={formatLongDate(getRecordValue(record, ["expectedDeliveryDate", "expected_delivery_date", "edd"], ""), "Not recorded")}
                        />
	                      </div>
	                    </>
	                  )}
                    <SectionDivider label="Monitoring & Follow-up" />
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
                      <PatientDetailItem
                        label="Follow-up Date"
                        value={formatLongDate(
                          getRecordValue(
                            record,
                            ["followUpDate", "follow_up_date"],
                            "",
                          ),
                          "Not recorded",
                        )}
                      />
                      <PatientDetailItem
                        label="Patient Condition"
                        value={getRecordValue(record, [
                          "patientCondition",
                          "patient_condition",
                        ])}
                      />
                    </div>
                    <div className="pt-2">
                      <NarrativeBox
                        label="Monitoring Notes"
                        value={getRecordValue(
                          record,
                          ["monitoringNotes", "monitoring_notes"],
                          "",
                        )}
                        emptyText="Not recorded"
                      />
                    </div>
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
          {showPatientProfileSidebar && (
          <aside className="space-y-6">
            <SideCard title="Patient Profile" icon={<HeartPulse size={14} />}>
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
          )}
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

function normalizeHealthRecordStatus(status) {
  const value = String(status || "").trim();

  if (!value || value === "Consultation") return "Routine Monitoring";
  if (
    [
      "Follow-up",
      "Follow Up",
      "Follow-up Required",
      "Follow-up After 2 Days",
    ].includes(value)
  ) {
    return "Follow-up Required";
  }
  if (["Under Observation", "Observation"].includes(value)) {
    return "Under Observation";
  }
  if (
    ["Completed", "Complete", "Recovered", "Closed", "Discharged"].includes(
      value,
    )
  ) {
    return "Completed";
  }
  if (
    ["For Monitoring", "Active", "Monitoring", "Routine Monitoring"].includes(
      value,
    )
  ) {
    return "Routine Monitoring";
  }
  if (["For Referral", "Needs Referral"].includes(value)) {
    return "Needs Referral";
  }
  if (
    ["Referred", "Pending", "Pending RHU Review", "Received"].includes(value)
  ) {
    return "Referred/Pending";
  }

  return value;
}

function isFollowUpEligibleStatus(status) {
  return [
    "Follow-up Required",
    "For Monitoring",
    "Under Observation",
    "Routine Monitoring",
  ].includes(normalizeHealthRecordStatus(status));
}

function HealthRecordStatusBadge({ status }) {
  const normalizedStatus = normalizeHealthRecordStatus(status);
  const styles = {
    "Follow-up Required": "border-amber-200 bg-amber-50 text-amber-800",
    "Routine Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
    "Under Observation": "border-amber-200 bg-amber-50 text-amber-800",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "Needs Referral": "border-orange-200 bg-orange-50 text-orange-800",
    "Referred/Pending": "border-blue-200 bg-blue-50 text-blue-800",
    "For Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        styles[normalizedStatus] ||
        "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      {normalizedStatus}
    </span>
  );
}

function getRecordValue(record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

function getNestedRecordValue(record = {}, directKeys = [], nestedKeys = []) {
  const direct = getRecordValue(record, directKeys, "");
  if (direct) return direct;

  for (const nestedKey of nestedKeys) {
    const nested = record?.[nestedKey];
    if (!nested || typeof nested !== "object") continue;
    const value = getRecordValue(nested, directKeys, "");
    if (value) return value;
  }

  return "";
}

function getRecordDateValue(record = {}) {
  return getRecordValue(
    record,
    ["dateOfVisit", "date_of_visit", "dateRecorded", "date_recorded", "visitDate", "date", "createdAt", "created_at"],
    "",
  );
}

function getRecordTime(record = {}) {
  const direct = getRecordValue(record, ["timeOfVisit", "time_of_visit", "time"], "");
  if (direct) return direct;

  const recorded = getRecordValue(record, ["dateRecorded", "date_recorded"], "");
  const match = String(recorded).match(/\d{2}:\d{2}/);
  return match ? match[0] : "";
}

function getRecordDiagnosis(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["diagnosis", "initialDiagnosis", "initial_diagnosis"], fallback);
}

function getRecordChiefComplaint(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["chiefComplaint", "chief_complaint", "concern"], fallback);
}

function getRecordSummary(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "summaryOfPresentIllness",
      "summary_of_present_illness",
      "physicalExamination",
      "physical_examination",
      "medicalHistory",
      "medical_history",
      "notes",
    ],
    fallback,
  );
}

function getRecordNotes(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["consultationNotes", "consultation_notes", "notes"], fallback);
}

function getRecordInitialActions(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "initialActionsTaken",
      "initialActionTaken",
      "initial_actions_taken",
      "initial_action_taken",
      "medication",
      "treatmentNotes",
      "treatment_notes",
      "treatment",
    ],
    fallback,
  );
}

function getRecordPractitioner(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "attendingStaff",
      "attending_staff",
      "nameOfPractitioner",
      "name_of_practitioner",
      "recordedBy",
      "recorded_by",
    ],
    fallback,
  );
}

function getRecordFollowUpStatus(record = {}, fallback = "Routine Monitoring") {
  const value = getNestedRecordValue(
    record,
    ["followUpStatus", "follow_up_status", "status"],
    ["monitoringData", "monitoring_data"],
  );
  return value || fallback;
}

function getVitalSigns(record = {}, fallback = "") {
  const value = getRecordValue(record, ["vitalSigns", "vital_signs"], "");
  if (!value) {
    const values = [
      record?.systolicBp && record?.diastolicBp
        ? `BP: ${record.systolicBp}/${record.diastolicBp} mmHg`
        : "",
      record?.temp || record?.temperature ? `Temp: ${record.temp || record.temperature} C` : "",
      record?.pulse || record?.pulseRate ? `Pulse: ${record.pulse || record.pulseRate} bpm` : "",
      record?.weight ? `Weight: ${record.weight} kg` : "",
      record?.height ? `Height: ${record.height} cm` : "",
    ].filter(Boolean);

    return values.join(" | ") || fallback;
  }

  if (typeof value !== "object") return String(value);

  const values = [
    (value.systolicBp || value.systolic_bp) && (value.diastolicBp || value.diastolic_bp)
      ? `BP: ${value.systolicBp || value.systolic_bp}/${value.diastolicBp || value.diastolic_bp} mmHg`
      : "",
    value.temperature ? `Temp: ${value.temperature} C` : "",
    value.pulseRate || value.pulse_rate ? `Pulse: ${value.pulseRate || value.pulse_rate} bpm` : "",
    value.weight ? `Weight: ${value.weight} kg` : "",
    value.height ? `Height: ${value.height} cm` : "",
  ].filter(Boolean);

  return values.join(" | ") || fallback;
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
