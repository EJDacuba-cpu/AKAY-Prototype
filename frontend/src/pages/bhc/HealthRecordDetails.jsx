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
  ButtonSpinner,
  FormInput,
  FormSelect,
  FormTextarea,
  SideCard,
  SoftLoadingArea,
  SuccessModal
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";

import {
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
  formatUserName,
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
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({});
  const [formErrors, setFormErrors] = useState({});

  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecordDetails("bhc", recordId),
    queryFn: async () => {
      const recordData = await getHealthRecordById(recordId);
      let existingReferral;
      try {
        existingReferral = await getReferralByHealthRecordId(recordId);
        const linkedTrackingId =
          recordData?.linkedTrackingId ||
          recordData?.linked_tracking_id ||
          recordData?.referralTrackingId ||
          recordData?.referral_tracking_id;
        if (
          !existingReferral &&
          !recordData?.isFollowUp &&
          linkedTrackingId
        ) {
          existingReferral = await getReferralByTrackingId(linkedTrackingId);
        }
      } catch {
        existingReferral = null;
      }
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
      category: formatDisplayValue(
        data.category ||
          data.classification ||
          data.recordType ||
          data.patientClassification,
        "General Consultation",
      ),
      visitType: data.visitType || data.visit_type || getRecordVisitTypeValue(data),
      parentHealthRecordId: getParentHealthRecordId(data) || null,
      previousRecordId: getParentHealthRecordId(data) || "",
      isFollowUp: getRecordVisitTypeValue(data) === "follow_up_visit",
      diagnosis: getRecordDiagnosis(data, ""),
      chiefComplaint: getRecordChiefComplaint(data, ""),
      summaryOfPresentIllness: getRecordSummary(data, ""),
      consultationNotes: getRecordNotes(data, ""),
      medication: getRecordInitialActions(data, ""),
      vitalSigns: getVitalSigns(data, ""),
      followUpStatus: getRecordFollowUpStatus(data, "Consultation"),
      followUpDate: getRecordValue(data, ["followUpDate", "follow_up_date"], ""),
      patientCondition: getRecordValue(
        data,
        ["patientCondition", "patient_condition"],
        "",
      ),
      monitoringNotes: getRecordValue(
        data,
        ["monitoringNotes", "monitoring_notes"],
        "",
      ),
      attendingStaff: getRecordPractitioner(data, ""),
      aog: getRecordValue(data, ["aog", "ageOfGestation", "age_of_gestation"], ""),
      expectedDeliveryDate: getRecordValue(
        data,
        ["expectedDeliveryDate", "expected_delivery_date", "edd"],
        "",
      ),
      maternalData: getMaternalData(data),
      supplementsGiven: getMaternalSupplements(data),
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleInlineSubmit() {
    if (saving) return;

    const nextErrors = validateInlineForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);
      const updatedRecord = await updateHealthRecord(recordId, form);

      setRecord(updatedRecord || ((prev) => ({ ...prev, ...form })));

      setOpenSuccess(true);
      setIsEditing(false);
      setFormErrors({});
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

  function handleCancelEdit() {
    initializeForm(record);
    setFormErrors({});
    setIsEditing(false);
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <SoftLoadingArea
          isLoading
          message="Loading details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </SoftLoadingArea>
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
  const followUpDateValue = getRecordValue(record, ["followUpDate", "follow_up_date"], "");
  const patientConditionValue = getRecordValue(record, [
    "patientCondition",
    "patient_condition",
  ], "");
  const monitoringNotesValue = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
  const hasFollowUpData = Boolean(
    followUpDateValue || patientConditionValue || monitoringNotesValue,
  );
  const shouldShowMonitoringFollowUp = status !== "Completed" && hasFollowUpData;
  const showPatientProfileSidebar = false;
  const linkedReferralTarget =
    linkedReferral?.trackingId ||
    linkedReferral?.id ||
    record.linkedTrackingId ||
    record.linked_tracking_id ||
    record.referralTrackingId ||
    record.referral_tracking_id ||
    "";
  const hasLinkedReferral = Boolean(linkedReferralTarget);
  const needsRhuReferral =
    record.needs_referral === true ||
    record.needsReferral === true ||
    record.needsReferral === "yes";
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
      record.record_type ||
      record.healthRecordType ||
      record.health_record_type ||
      record.patientClassification ||
      patient?.category ||
      patient?.patientClassification,
    "General Consultation",
  );
  const patientClassification = recordCategory;
  const visitTypeLabel = getRecordVisitTypeLabel(record);
  const displayDate = formatLongDate(getRecordDateValue(record), "Not recorded");
  const displayTime = getRecordTime(record);
  const medicalNotesValue =
    status === "Completed"
      ? getCompletedRecordMedicalNotes(record, monitoringNotesValue, "")
      : getRecordNotes(record, "");
  const chiefComplaintValue = getRecordChiefComplaint(record, "");
  const diagnosisValue = getRecordDiagnosis(record, "");
  const summaryValue = getRecordSummary(record, "");
  const hasClinicalAssessmentDetails = Boolean(
    chiefComplaintValue || diagnosisValue || summaryValue,
  );
  const initialActionsValue = getRecordInitialActions(record, "");
  const treatmentNotesValue = getRecordTreatmentNotes(record, "");
  const hasTreatmentDetails = Boolean(
    initialActionsValue || treatmentNotesValue || medicalNotesValue,
  );
  const isMaternalRecord =
    form.category === "Maternal" || patientClassification === "Maternal";
  const maternalSupplements = getMaternalSupplements(record);

  return (
    <>
      <DashboardLayout role="bhc" title="Health Record Details">
        <SoftLoadingArea
          isLoading={isFetching && !loading}
          message="Refreshing details..."
          minHeight="min-h-[520px]"
        >

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
                  {getRecordChiefComplaint(record, "Medical Consultation")}
                </h1>
                <HealthRecordStatusBadge status={status} />
                {hasLinkedReferral && <ReferredChip />}
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
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInlineSubmit}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {saving ? <ButtonSpinner /> : <Check size={14} />}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      initializeForm(record);
                      setFormErrors({});
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                  >
                    <Pencil size={14} />
                    Edit Record
                  </button>
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
                  {hasLinkedReferral && (
                    <Link
                      to={`/bhc/referrals/${linkedReferralTarget}`}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <ClipboardList size={14} />
                      View Referral
                    </Link>
                  )}
                  {!hasLinkedReferral && needsRhuReferral && (
                    <Link
                      to={`/bhc/referrals/create?recordId=${record.id || record._id}&patientId=${patientId || ""}`}
                      className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                    >
                      <FilePlus2 size={14} />
                      Create Referral
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-5">
            <VisitInfoStrip
              visitTypeLabel={visitTypeLabel}
              classification={recordCategory}
              displayDate={displayDate}
              displayTime={displayTime}
              practitioner={getRecordPractitioner(record)}
            />
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div
          className={
            isEditing
              ? "space-y-6"
              : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
          }
        >
          {/* ═══ Clinical Record — Single Card ═══ */}
          <div className="space-y-6">
            <SideCard title="Clinical Record" icon={<HeartPulse size={14} />}>
              {isEditing ? (
                /* ── Edit Mode ── */
                <div className="space-y-1">
                  <SectionDivider label="Clinical Assessment" />
                  <div className="pt-3">
                    <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                      <FieldWithError error={formErrors.category}>
                        <FormSelect
                          label="Classification"
                          name="category"
                          value={form.category || ""}
                          onChange={handleChange}
                          required
                        >
                          <option value="General Consultation">
                            General Consultation
                          </option>
                          <option value="Maternal">Maternal</option>
                          <option value="Immunization">Immunization</option>
                          <option value="Senior Citizen">Senior Citizen</option>
                        </FormSelect>
                      </FieldWithError>
                      <FieldWithError error={formErrors.diagnosis}>
                        <FormInput
                          label="Initial Diagnosis"
                          name="diagnosis"
                          value={form.diagnosis || ""}
                          onChange={handleChange}
                          required
                        />
                      </FieldWithError>
                      <FieldWithError error={formErrors.followUpStatus}>
                        <FormSelect
                          label="Follow-up Status"
                          name="followUpStatus"
                          value={form.followUpStatus || ""}
                          onChange={handleChange}
                          required
                        >
                          <option value="Routine Monitoring">
                            Routine Monitoring
                          </option>
                          <option value="Follow-up Required">
                            Follow-up Required
                          </option>
                          <option value="Completed">Completed</option>
                        </FormSelect>
                      </FieldWithError>
                      <FieldWithError error={formErrors.attendingStaff}>
                        <FormInput
                          label="Name of Practitioner"
                          name="attendingStaff"
                          value={form.attendingStaff || ""}
                          onChange={handleChange}
                          required
                        />
                      </FieldWithError>
                    </div>
                  </div>
                  <div className="pt-2">
                    <FieldWithError error={formErrors.chiefComplaint}>
                      <FormInput
                        label="Chief Complaint"
                        name="chiefComplaint"
                        value={form.chiefComplaint || ""}
                        onChange={handleChange}
                        required
                      />
                    </FieldWithError>
                  </div>
                  <div className="pt-2">
                    <FormTextarea
                      label="Summary of Present Illness"
                      name="summaryOfPresentIllness"
                      value={form.summaryOfPresentIllness || ""}
                      onChange={handleChange}
                      placeholder="Details of the patient's current symptoms, onset, duration, and severity..."
                    />
                  </div>

                  <SectionDivider label="Treatment & Actions" />
                  <div className="pt-3">
                    <FormTextarea
                      label="Initial Action Taken"
                      name="medication"
                      value={form.medication || ""}
                      onChange={handleChange}
                    />
                  </div>

                  <SectionDivider label="Vital Signs" />
                  <div className="pt-3">
                    <FormTextarea
                      label="Recorded Vitals"
                      name="vitalSigns"
                      value={form.vitalSigns || ""}
                      onChange={handleChange}
                      placeholder="e.g., BP: 120/80 mmHg, Temp: 36.5°C, HR: 80 bpm, Weight: 60kg"
                    />
                  </div>

	                  {patientClassification === "Maternal" && (
	                    <>
	                      <SectionDivider label="Maternal Parameters" />
                      <div className="grid gap-x-8 gap-y-3 pt-3 md:grid-cols-2">
                        <FormInput
                          label="Age of Gestation (AOG)"
                          name="aog"
                          value={form.aog || ""}
                          onChange={handleChange}
                        />
                        <FormInput
                          label="Expected Delivery Date (EDD)"
                          name="expectedDeliveryDate"
                          type="date"
                          value={form.expectedDeliveryDate || ""}
                          onChange={handleChange}
                        />
                      </div>
                    </>
                  )}

                  <SectionDivider label="Monitoring & Follow-up" />
                  <div className="grid gap-x-8 gap-y-3 pt-3 md:grid-cols-2">
                    <FormInput
                      label="Follow-up Date"
                      name="followUpDate"
                      type="date"
                      value={form.followUpDate || ""}
                      onChange={handleChange}
                    />
                    <FormInput
                      label="Patient Condition"
                      name="patientCondition"
                      value={form.patientCondition || ""}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="pt-2 pb-2">
                    <FormTextarea
                      label="Monitoring Notes"
                      name="monitoringNotes"
                      value={form.monitoringNotes || ""}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              ) : (
                /* ── View Mode ── */
                <div className="divide-y divide-slate-100">
                  <DetailSection title="Clinical Assessment">
                    {hasClinicalAssessmentDetails ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <PatientDetailItem
                            label="Chief Complaint"
                            value={chiefComplaintValue || "Not recorded"}
                          />
                          <PatientDetailItem
                            label="Initial Diagnosis"
                            value={diagnosisValue || "Not recorded"}
                          />
                        </div>
                        {summaryValue && (
                          <NarrativeBox
                            label="Summary of Present Illness"
                            value={summaryValue}
                          />
                        )}
                      </>
                    ) : (
                      <SectionEmptyState text="No clinical assessment details recorded." />
                    )}
                  </DetailSection>

                  <DetailSection title="Treatment & Actions">
                    {hasTreatmentDetails ? (
                      <>
                        <PatientDetailItem
                          label="Initial Action Taken"
                          value={initialActionsValue || "Not recorded"}
                        />
                        {isDistinctRecordedValue(
                          treatmentNotesValue,
                          initialActionsValue,
                        ) && (
                          <NarrativeBox
                            label="Treatment Notes"
                            value={treatmentNotesValue}
                          />
                        )}
                        {isDistinctRecordedValue(
                          medicalNotesValue,
                          initialActionsValue,
                          treatmentNotesValue,
                        ) && (
                          <NarrativeBox
                            label="Medical Notes"
                            value={medicalNotesValue}
                          />
                        )}
                      </>
                    ) : (
                      <SectionEmptyState text="No treatment or action details recorded." />
                    )}
                  </DetailSection>

                  {isMaternalRecord && (
                    <DetailSection title="Maternal Parameters">
                      <div className="grid gap-4 md:grid-cols-2">
                        <PatientDetailItem
                          label="Age of Gestation (AOG)"
                          value={getRecordValue(record, ["aog", "ageOfGestation", "age_of_gestation"])}
                        />
                        <PatientDetailItem
                          label="Expected Delivery Date (EDD)"
                          value={formatLongDate(getRecordValue(record, ["expectedDeliveryDate", "expected_delivery_date", "edd"], ""), "Not recorded")}
                        />
	                      </div>
	                    </DetailSection>
	                  )}
                    {isMaternalRecord && (
                      <DetailSection title="Vitamins / Supplements Given">
                        <MaternalSupplementsList
                          supplements={maternalSupplements}
                        />
                      </DetailSection>
                    )}
                    {shouldShowMonitoringFollowUp && (
                      <DetailSection title="Monitoring & Follow-up">
                        <div className="grid gap-4 md:grid-cols-2">
                          {(patientConditionValue ||
                            status === "Follow-up Required") && (
                            <PatientDetailItem
                              label="Patient Condition"
                              value={patientConditionValue}
                            />
                          )}
                          {(followUpDateValue ||
                            status === "Follow-up Required") && (
                            <PatientDetailItem
                              label="Follow-up Date"
                              value={formatLongDate(
                                followUpDateValue,
                                "Not recorded",
                              )}
                            />
                          )}
                        </div>
                        {monitoringNotesValue && (
                          <NarrativeBox
                            label="Monitoring Notes"
                            value={monitoringNotesValue}
                          />
                        )}
                      </DetailSection>
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
          {!isEditing && (
            <aside className="space-y-3">
              <QuickSummaryCard
                vitalItems={getVitalSignItems(record)}
              />
            </aside>
          )}

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
        </SoftLoadingArea>
      </DashboardLayout>

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

function validateInlineForm(form = {}) {
  const errors = {};
  const requiredFields = [
    ["category", "Classification is required."],
    ["diagnosis", "Initial Diagnosis is required."],
    ["followUpStatus", "Follow-up Status is required."],
    ["attendingStaff", "Name of Practitioner is required."],
    ["chiefComplaint", "Chief Complaint is required."],
  ];

  requiredFields.forEach(([field, message]) => {
    if (!String(form[field] || "").trim()) {
      errors[field] = message;
    }
  });

  return errors;
}

function FieldWithError({ error, children }) {
  return (
    <div>
      {children}
      {error && (
        <p className="mt-1.5 text-[11px] font-medium text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}

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

function DetailSection({ title, children }) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <div className="mb-4 flex items-center gap-3">
        <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {title}
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function VisitInfoStrip({
  visitTypeLabel,
  classification,
  displayDate,
  displayTime,
  practitioner,
}) {
  return (
    <div className="  px-3 py-2 ">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetadataItem label="Visit Type" value={visitTypeLabel} />
        <MetadataItem label="Classification" value={classification} />
        <MetadataItem label="Date of Visit" value={displayDate} />
        <MetadataItem
          label="Time of Visit"
          value={displayTime || "Not recorded"}
        />
        <MetadataItem label="Name of Practitioner" value={practitioner} />
      </div>
    </div>
  );
}

function MetadataItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function QuickSummaryCard({ vitalItems }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-bold text-[#0F172A]">Quick Summary</h2>
      </div>
      <div className="px-5">
        <SummarySection title="Vital Signs">
          <VitalSignsGrid items={vitalItems} compact />
        </SummarySection>
      </div>
    </div>
  );
}

function SummarySection({ title, children }) {
  return (
    <section className="py-4">
      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="max-w-[58%] text-right text-xs font-semibold text-slate-700">
        {formatDisplayValue(value, "Not recorded")}
      </span>
    </div>
  );
}

function VitalSignsGrid({ items, compact = false }) {
  const hasRecordedVitals = items.some((item) => item.value);

  if (!hasRecordedVitals) {
    if (compact) {
      return <p className="text-sm text-slate-500">No vital signs recorded.</p>;
    }

    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
        <p className="text-xs text-slate-400">
          No vital signs recorded for this visit.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <SummaryRow
            key={item.label}
            label={item.label}
            value={item.value || "Not recorded"}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {item.value || "Not recorded"}
          </p>
        </div>
      ))}
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
  const compact = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!value || compact === "consultation") return "Routine Monitoring";
  if (["follow up", "follow up required", "follow up after 2 days"].includes(compact)) {
    return "Follow-up Required";
  }
  if (["completed", "complete", "recovered", "closed", "discharged"].includes(compact)) {
    return "Completed";
  }

  return "Routine Monitoring";
}

function isFollowUpEligibleStatus(status) {
  return normalizeHealthRecordStatus(status) === "Follow-up Required";
}

function HealthRecordStatusBadge({ status }) {
  const normalizedStatus = normalizeHealthRecordStatus(status);
  const styles = {
    "Follow-up Required": "border-amber-200 bg-amber-50 text-amber-800",
    "Routine Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
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

function ReferredChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
      Referred
    </span>
  );
}

function getParentHealthRecordId(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};

  return formatDisplayValue(
    record.parentHealthRecordId ||
      record.parent_health_record_id ||
      record.originalHealthRecordId ||
      record.original_health_record_id ||
      monitoringData.parentHealthRecordId ||
      monitoringData.parent_health_record_id ||
      monitoringData.previousRecordId ||
      record.previousRecordId,
    "",
  );
}

function getRecordVisitTypeLabel(record = {}) {
  return getRecordVisitTypeValue(record) === "follow_up_visit"
    ? "Follow-up Visit"
    : "Initial Consultation";
}

function getRecordVisitTypeValue(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  const value = String(
    record.visitType ||
      record.visit_type ||
      monitoringData.visitType ||
      monitoringData.visit_type ||
      "",
  )
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (
    value === "follow up visit" ||
    value === "follow up" ||
    record.isFollowUp ||
    record.is_follow_up ||
    getParentHealthRecordId(record)
  ) {
    return "follow_up_visit";
  }

  return "initial_consultation";
}

function getRecordValue(record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

function isLikelyRawId(value) {
  return /^[0-9a-f-]{8,}$/i.test(String(value || "").trim());
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

function getMaternalData(record = {}) {
  return record.maternalData || record.maternal_data || {};
}

function getMaternalSupplements(record = {}) {
  const maternalData = getMaternalData(record);
  const supplements =
    record.supplementsGiven ||
    record.supplements_given ||
    maternalData.supplementsGiven ||
    maternalData.supplements_given ||
    [];

  if (!Array.isArray(supplements)) return [];

  return supplements
    .filter(Boolean)
    .map((item = {}) => ({
      supplement_type: item.supplement_type || item.supplementType || "",
      supplement_name: item.supplement_name || item.supplementName || "",
      quantity: item.quantity || "",
      unit: item.unit || "",
      date_given: item.date_given || item.dateGiven || "",
      remarks: item.remarks || item.notes || "",
      given_by_name: item.given_by_name || item.givenByName || "",
    }));
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
  return getRecordValue(
    record,
    ["consultationNotes", "consultation_notes", "medicalNotes", "medical_notes", "notes"],
    fallback,
  );
}

function getCompletedRecordMedicalNotes(
  record = {},
  monitoringNotes = "",
  fallback = "Not recorded",
) {
  const notes = getRecordNotes(record, "");
  if (notes) return notes;
  return monitoringNotes || fallback;
}

function getRecordTreatmentNotes(record = {}, fallback = "") {
  return getRecordValue(
    record,
    ["treatmentNotes", "treatment_notes", "treatment"],
    fallback,
  );
}

function isDistinctRecordedValue(value, ...existingValues) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "Not recorded") return false;

  return existingValues.every(
    (existingValue) =>
      String(existingValue || "").trim().toLowerCase() !==
      normalized.toLowerCase(),
  );
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
  const creatorName = formatUserName(
    record.creator ||
      record.createdByUser ||
      record.created_by_user ||
      record.user ||
      record.practitioner ||
      record.staff,
    "",
  );

  if (creatorName) return creatorName;

  const value = getNestedRecordValue(
    record,
    [
      "attendingStaff",
      "attending_staff",
      "nameOfPractitioner",
      "name_of_practitioner",
      "recordedBy",
      "recorded_by",
    ],
    ["monitoringData", "monitoring_data"],
  );

  if (!value || isLikelyRawId(value)) return fallback;
  return value;
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
  if (value.summary) return String(value.summary);

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

function getVitalSignItems(record = {}) {
  const vitalSigns = record?.vitalSigns || record?.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");

  const readTextValue = (patterns) => {
    for (const pattern of patterns) {
      const match = String(vitalText || "").match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };

  const systolic =
    record?.systolicBp ||
    record?.systolic_bp ||
    vitalObject.systolicBp ||
    vitalObject.systolic_bp;
  const diastolic =
    record?.diastolicBp ||
    record?.diastolic_bp ||
    vitalObject.diastolicBp ||
    vitalObject.diastolic_bp;
  const bpValue =
    systolic && diastolic
      ? `${systolic}/${diastolic} mmHg`
      : readTextValue([/BP:\s*([^|,]+)/i, /Blood Pressure:\s*([^|,]+)/i]);
  const temperatureValue =
    record?.temperature ||
    record?.temp ||
    vitalObject.temperature ||
    vitalObject.temp ||
    readTextValue([/Temp(?:erature)?:\s*([^|,]+)/i]);
  const pulseValue =
    record?.pulseRate ||
    record?.pulse_rate ||
    record?.pulse ||
    vitalObject.pulseRate ||
    vitalObject.pulse_rate ||
    vitalObject.pulse ||
    readTextValue([/Pulse:\s*([^|,]+)/i, /HR:\s*([^|,]+)/i]);
  const weightValue =
    record?.weight ||
    vitalObject.weight ||
    readTextValue([/Weight:\s*([^|,]+)/i]);
  const heightValue =
    record?.height ||
    vitalObject.height ||
    readTextValue([/Height:\s*([^|,]+)/i]);

  return [
    { label: "BP", value: cleanVitalSignValue(bpValue) },
    {
      label: "Temperature",
      value: cleanVitalSignValue(temperatureValue),
    },
    { label: "Pulse", value: cleanVitalSignValue(pulseValue) },
    { label: "Weight", value: cleanVitalSignValue(weightValue) },
    { label: "Height", value: cleanVitalSignValue(heightValue) },
  ];
}

function MaternalSupplementsList({ supplements }) {
  if (!supplements.length) {
    return (
      <SectionEmptyState text="No vitamins or supplements were recorded for this visit." />
    );
  }

  return (
    <div className="space-y-3">
      {supplements.map((supplement, index) => (
        <div
          key={`${supplement.supplement_type || "supplement"}-${index}`}
          className="rounded-xl border border-pink-100 bg-pink-50/30 p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#0F172A]">
                {supplement.supplement_name || "Supplement"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDisplayValue(supplement.quantity, "Not recorded")}{" "}
                {formatDisplayValue(supplement.unit, "")}
              </p>
            </div>
            <span className="w-fit rounded-lg border border-pink-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-pink-700">
              {formatLongDate(supplement.date_given, "Date not recorded")}
            </span>
          </div>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <PatientDetailItem
              label="Given By"
              value={supplement.given_by_name || "Not recorded"}
            />
            <PatientDetailItem
              label="Remarks"
              value={supplement.remarks || "Not recorded"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function cleanVitalSignValue(value) {
  const text = String(value || "").trim();
  if (!text || /^n\/a\b/i.test(text) || /(^|[/: ])n\/a($|[ /])/i.test(text)) {
    return "";
  }
  return text;
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

function SectionEmptyState({ text }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
      <p className="text-xs text-slate-400">{text}</p>
    </div>
  );
}
