import { Link, useLocation, useParams } from "react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  FilePlus2,
  HeartPulse,
  Pencil,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ButtonSpinner,
  FormInput,
  FormSelect,
  FormTextarea,
  SideCard,
  SoftLoadingArea,
  SuccessModal,
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import {
  getRhuHealthRecords,
  updateHealthRecord,
} from "../../services/healthRecordService";
import {
  getPatientDetailsListByRole,
  getPatientsByRole,
} from "../../services/patients";
import { queryKeys } from "../../utils/queryKeys";
import {
  formatDisplayValue,
  formatLongDate,
  formatUserName,
} from "../../utils/formatters";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;

export default function RHURecordDetails() {
  const { recordId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(
    Boolean(location.state?.startInEditMode),
  );
  const [form, setForm] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecordDetails("rhu", recordId),
    queryFn: async () => {
      const [rhuRecords, patientDetails, patientList] = await Promise.all([
        getRhuHealthRecords(),
        getPatientDetailsListByRole("rhu"),
        getPatientsByRole("rhu"),
      ]);

      const allRecords = Array.isArray(rhuRecords) ? rhuRecords : [];
      const foundRecord =
        allRecords.find((item) => getRecordId(item) === recordId) || null;

      const foundPatient = foundRecord
        ? findPatientForRecord(foundRecord, [
            ...(Array.isArray(patientDetails) ? patientDetails : []),
            ...(Array.isArray(patientList) ? patientList : []),
          ])
        : null;

      return {
        record: foundRecord,
        patient: foundPatient || derivePatientFromRecord(foundRecord),
      };
    },
    enabled: Boolean(recordId),
  });

  const record = details?.record || null;
  const patient = details?.patient || null;
  const loading = isLoading && !details;

  useEffect(() => {
    if (record) {
      setForm(buildInlineForm(record, patient));
    }
  }, [record, patient]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function handleCancelEdit() {
    setForm(buildInlineForm(record, patient));
    setFormErrors({});
    setIsEditing(false);
  }

  async function handleSaveChanges() {
    if (saving) return;

    const nextErrors = validateInlineForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);
      await updateHealthRecord(recordId, form, "rhu");
      setFormErrors({});
      setIsEditing(false);
      setOpenSuccess(true);
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails("rhu", recordId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("rhu"),
      });
      if (patient?.id || record?.patientId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.patientDetails("rhu", patient?.id || record?.patientId),
        });
      }
    } catch (error) {
      console.error("Failed to update RHU health record:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Health Record Details">
        <style>{keyframes}</style>
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
      <DashboardLayout role="rhu" title="Health Record Details">
        <style>{keyframes}</style>
        <div className="rounded-2xl border border-[#E8ECF0] bg-white p-8 shadow-sm">
          <Link
            to="/rhu/health-records"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </Link>
          <div className="mt-6 text-sm text-slate-500">
            Health record was not found.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Routine Monitoring",
  );
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
  const patientId = patient?.id || record.patientId;
  const patientName = getPatientName(patient) || getRecordPatientName(record);
  const canRecordFollowUpVisit = isFollowUpEligibleStatus(status);
  const showPatientProfileSidebar = false;
  const visitTypeLabel = getRecordVisitTypeLabel(record);
  const recordClassification = getRecordClassification(record, patient);
  const displayDate = getRecordDate(record);
  const displayTime = getRecordTime(record);
  const medicalNotesValue =
    status === "Completed"
      ? getCompletedRecordMedicalNotes(record, monitoringNotesValue, "")
      : getRecordNotes(record, "");
  const linkedReferralTarget =
    record.linkedTrackingId ||
    record.linked_tracking_id ||
    record.referralTrackingId ||
    record.referral_tracking_id ||
    "";
  const hasLinkedReferral = Boolean(linkedReferralTarget);
  const chiefComplaintValue = getRecordConcern(record, "");
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
  const isFamilyPlanningRecord = recordClassification === "Family Planning";
  const familyPlanningDetails = getFamilyPlanningDetails(record);
  const hasFamilyPlanningDetails = familyPlanningDetails.some(
    (item) => item.value,
  );

  return (
    <DashboardLayout role="rhu" title="Health Record Details">
      <style>{keyframes}</style>
      <SoftLoadingArea
        isLoading={isFetching && !loading}
        message="Refreshing details..."
        minHeight="min-h-[520px]"
      >

      <div className="mb-6">
        <Link
          to="/rhu/health-records"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
        >
          <ArrowLeft size={15} /> Back to Health Records
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-[#0F172A]">
                {getRecordConcern(record, "Medical Consultation")}
              </h1>
              <HealthRecordStatusBadge status={status} />
              {hasLinkedReferral && <ReferredChip />}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-[11px] font-semibold text-slate-600">
                {getRecordId(record)}
              </span>
              <span className="text-slate-300">/</span>
              <span>
                {displayDate}
                {displayTime ? ` at ${displayTime}` : ""}
              </span>
              {patientId && (
                <>
                  <span className="text-slate-300">/</span>
                  <span>
                    Patient:{" "}
                    <Link
                      to={`/rhu/patients/${patientId}`}
                      className="font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
                    >
                      {patientName}
                    </Link>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <X size={14} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
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
                    setForm(buildInlineForm(record, patient));
                    setFormErrors({});
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                >
                  <Pencil size={14} />
                  Edit Record
                </button>
                {canRecordFollowUpVisit && (
                  <Link
                    to={`/rhu/health-records/add?recordId=${getRecordId(record)}&mode=follow-up`}
                    title="This action creates a follow-up visit linked to the current health record."
                    aria-label="Record a follow-up visit linked to this health record"
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
                  >
                    <FilePlus2 size={14} />
                    Record Follow-up Visit
                  </Link>
                )}
                {hasLinkedReferral && (
                  <Link
                    to={`/rhu/referrals/${linkedReferralTarget}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <ClipboardList size={14} />
                    View Referral
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
        <div className="mt-5">
          <VisitInfoStrip
            visitTypeLabel={visitTypeLabel}
            classification={recordClassification}
            displayDate={displayDate}
            displayTime={displayTime}
            practitioner={getRecordPractitioner(record, "RHU Staff")}
          />
        </div>
      </div>

      <div
        className={
          isEditing
            ? "space-y-6"
            : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        }
      >
        <div>
          <SideCard title="Clinical Record" icon={<HeartPulse size={14} />}>
            {isEditing ? (
              <div className="space-y-1">
                <SectionDivider label="Clinical Assessment" />
                <div className="grid gap-x-8 gap-y-3 pt-3 md:grid-cols-2">
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
                      <option value="Family Planning">Family Planning</option>
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
                      label="Status"
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
                  />
                </div>

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
                <div className="pt-2">
                  <FormTextarea
                    label="Monitoring Notes"
                    name="monitoringNotes"
                    value={form.monitoringNotes || ""}
                    onChange={handleChange}
                  />
                </div>
              </div>
            ) : (
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

                {isFamilyPlanningRecord && (
                  <DetailSection title="Family Planning Details">
                    {hasFamilyPlanningDetails ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {familyPlanningDetails.map((item) => (
                          <PatientDetailItem
                            key={item.label}
                            label={item.label}
                            value={item.value}
                          />
                        ))}
                      </div>
                    ) : (
                      <SectionEmptyState text="No family planning details recorded." />
                    )}
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
        </div>

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
            {patient || patientName ? (
              <div>
                <div className="space-y-1">
                  <PatientDetailItem label="Full Name" value={patientName} />
                  <PatientDetailItem
                    label="Patient ID"
                    value={patientId || "Not linked"}
                  />
                  <PatientDetailItem
                    label="Classification"
                    value={getPatientClassification(patient)}
                  />
                  <PatientDetailItem
                    label="Age / Sex"
                    value={getAgeSex(patient, record)}
                  />
                  <PatientDetailItem
                    label="Contact Number"
                    value={patient?.contactNumber || patient?.contact}
                  />
                  <PatientDetailItem
                    label="Barangay / Address"
                    value={
                      patient?.barangay ||
                      patient?.address ||
                      "No address recorded"
                    }
                  />
                </div>

                {patientId && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <Link
                      to={`/rhu/patients/${patientId}`}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                    >
                      View Full Patient Profile
                    </Link>
                  </div>
                )}
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
      <SuccessModal
        open={openSuccess}
        title="Health Record Updated"
        description="The health record information has been successfully saved."
        onClose={() => setOpenSuccess(false)}
      />
    </DashboardLayout>
  );
}

function validateInlineForm(form = {}) {
  const errors = {};
  const requiredFields = [
    ["category", "Classification is required."],
    ["diagnosis", "Initial Diagnosis is required."],
    ["followUpStatus", "Status is required."],
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

function buildInlineForm(record, patient) {
  return {
    category: getRecordClassification(record, patient),
    visitType: getRecordVisitTypeValue(record),
    parentHealthRecordId: getParentHealthRecordId(record) || null,
    previousRecordId: getParentHealthRecordId(record) || "",
    isFollowUp: getRecordVisitTypeValue(record) === "follow_up_visit",
    diagnosis: getRecordDiagnosis(record, ""),
    chiefComplaint: getRecordConcern(record, ""),
    summaryOfPresentIllness: getRecordSummary(record, ""),
    medication: getRecordInitialActions(record, ""),
    vitalSigns: getVitalSigns(record),
    followUpStatus: getRecordFollowUpStatus(record, "Routine Monitoring"),
    followUpDate: getRecordValue(record, ["followUpDate", "follow_up_date"], ""),
    patientCondition: getRecordValue(
      record,
      ["patientCondition", "patient_condition"],
      "",
    ),
    monitoringNotes: getRecordValue(
      record,
      ["monitoringNotes", "monitoring_notes"],
      "",
    ),
    attendingStaff: getRecordPractitioner(record, ""),
  };
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
    "Routine Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
    "Follow-up Required": "border-amber-200 bg-amber-50 text-amber-800",
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

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-2">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
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

function NarrativeBox({ label, value, emptyText }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-relaxed text-slate-600">
        {value || emptyText}
      </div>
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

function getRecordId(record) {
  return record?.id || record?.recordId || record?._id || "";
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getRecordPatientName(record) {
  if (!record) return "";
  if (typeof record.patient === "string") return record.patient;

  return (
    record.patientName ||
    record.patient?.name ||
    [record.patient?.firstName, record.patient?.lastName]
      .filter(Boolean)
      .join(" ")
  );
}

function getPatientName(patient) {
  if (!patient) return "";

  const composed = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .join(" ");

  return patient.name || patient.patientName || patient.patient || composed;
}

function findPatientForRecord(record, patients) {
  const recordPatientId = record?.patientId || record?.patient?.id;
  const recordPatientName = normalizeName(getRecordPatientName(record));

  return patients.find((patient) => {
    if (recordPatientId && sameId(patient?.id, recordPatientId)) return true;

    return (
      recordPatientName &&
      normalizeName(getPatientName(patient)) === recordPatientName
    );
  });
}

function derivePatientFromRecord(record) {
  if (!record) return null;

  return {
    id: record.patientId,
    name: getRecordPatientName(record),
    ageSex: record.ageSex,
    age: record.age,
    sex: record.sex,
    contact: record.contact || record.contactNumber,
    category: record.category || record.patientClassification,
  };
}

function getPatientClassification(patient) {
  return (
    patient?.patientClassification ||
    patient?.category ||
    patient?.classification ||
    "General Consultation"
  );
}

function getRecordClassification(record, patient) {
  return (
    record?.classification ||
    record?.category ||
    record?.recordType ||
    record?.record_type ||
    record?.healthRecordType ||
    record?.health_record_type ||
    record?.patientClassification ||
    getPatientClassification(patient) ||
    "General Consultation"
  );
}

function getFamilyPlanningDetails(record = {}) {
  const data = record.familyPlanningData || record.family_planning_data || {};

  return [
    {
      label: "Client Type",
      value: getRecordValue(data, ["clientType", "client_type"], ""),
    },
    {
      label: "Method Used / Accepted",
      value: getRecordValue(data, ["methodUsed", "method_used"], ""),
    },
    {
      label: "Visit Type",
      value: getRecordValue(
        data,
        ["fpVisitType", "fp_visit_type", "visitType", "visit_type"],
        "",
      ),
    },
    {
      label: "Previous Method",
      value: getRecordValue(data, ["previousMethod", "previous_method"], ""),
    },
    {
      label: "Source",
      value: getRecordValue(data, ["source"], ""),
    },
    {
      label: "Date Registered",
      value: formatLongDate(
        getRecordValue(data, ["dateRegistered", "date_registered"], ""),
        "",
      ),
    },
    {
      label: "Date of Visit",
      value: formatLongDate(
        getRecordValue(data, ["dateOfVisit", "date_of_visit"], ""),
        "",
      ),
    },
    {
      label: "Next Appointment Date",
      value: formatLongDate(
        getRecordValue(
          data,
          ["nextAppointmentDate", "next_appointment_date"],
          "",
        ),
        "",
      ),
    },
    {
      label: "Remarks / Notes",
      value: getRecordValue(data, ["remarks", "notes"], ""),
    },
    {
      label: "Action Taken",
      value: getRecordValue(data, ["actionTaken", "action_taken"], ""),
    },
    {
      label: "Concern / Complaint",
      value: getRecordValue(data, ["concern"], ""),
    },
    {
      label: "Findings / Notes",
      value: getRecordValue(data, ["findings"], ""),
    },
    {
      label: "Advice Given",
      value: getRecordValue(data, ["adviceGiven", "advice_given"], ""),
    },
  ];
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

function getAgeSex(patient, record) {
  if (patient?.ageSex) return patient.ageSex;
  if (record?.ageSex) return record.ageSex;

  const age = patient?.age || record?.age || "N/A";
  const sex = patient?.sex || record?.sex || "N/A";
  return `${age} / ${sex}`;
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

function getRecordDiagnosis(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["diagnosis", "initialDiagnosis", "initial_diagnosis"], fallback);
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
      "consultationNotes",
      "consultation_notes",
      "notes",
    ],
    fallback,
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
      "treatment",
      "treatmentNotes",
      "treatment_notes",
    ],
    fallback,
  );
}

function getRecordTreatmentNotes(record = {}, fallback = "") {
  return getRecordValue(
    record,
    ["treatmentNotes", "treatment_notes", "treatment"],
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

function isDistinctRecordedValue(value, ...existingValues) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "Not recorded") return false;

  return existingValues.every(
    (existingValue) =>
      String(existingValue || "").trim().toLowerCase() !==
      normalized.toLowerCase(),
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
      "recordedBy",
      "recorded_by",
      "attendingStaff",
      "attending_staff",
      "nameOfPractitioner",
      "name_of_practitioner",
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

function getRecordConcern(record, fallback = "Not recorded") {
  return (
    record?.chiefComplaint ||
    record?.chief_complaint ||
    record?.concern ||
    record?.summaryOfPresentIllness ||
    record?.summary_of_present_illness ||
    fallback
  );
}

function getRecordDate(record) {
  return formatLongDate(
    getRecordValue(
      record,
      [
        "dateOfVisit",
        "date_of_visit",
        "dateRecorded",
        "date_recorded",
        "visitDate",
        "date",
        "dateCreated",
        "createdAt",
        "created_at",
      ],
      "",
    ),
    "Not recorded",
  );
}

function getRecordTime(record) {
  const direct = record?.timeOfVisit || record?.time_of_visit || record?.time;
  if (direct) return direct;

  const recorded = record?.dateRecorded || record?.date_recorded;
  const match = String(recorded || "").match(/\d{2}:\d{2}/);
  return match ? match[0] : "";
}

function getVitalSigns(record) {
  const vitalSigns = record?.vitalSigns || record?.vital_signs;
  if (vitalSigns && typeof vitalSigns !== "object") return vitalSigns;

  if (vitalSigns && typeof vitalSigns === "object") {
    if (vitalSigns.summary) return String(vitalSigns.summary);

    const values = [
      (vitalSigns.systolicBp || vitalSigns.systolic_bp) &&
      (vitalSigns.diastolicBp || vitalSigns.diastolic_bp)
        ? `BP: ${vitalSigns.systolicBp || vitalSigns.systolic_bp}/${vitalSigns.diastolicBp || vitalSigns.diastolic_bp} mmHg`
        : "",
      vitalSigns.temperature ? `Temp: ${vitalSigns.temperature} C` : "",
      vitalSigns.pulseRate || vitalSigns.pulse_rate
        ? `Pulse: ${vitalSigns.pulseRate || vitalSigns.pulse_rate} bpm`
        : "",
      vitalSigns.weight ? `Weight: ${vitalSigns.weight} kg` : "",
      vitalSigns.height ? `Height: ${vitalSigns.height} cm` : "",
    ].filter(Boolean);

    if (values.length) return values.join(" | ");
  }

  const values = [
    record?.systolicBp && record?.diastolicBp
      ? `BP: ${record.systolicBp}/${record.diastolicBp} mmHg`
      : "",
    record?.temp ? `Temp: ${record.temp} C` : "",
    record?.pulse ? `Pulse: ${record.pulse} bpm` : "",
    record?.weight ? `Weight: ${record.weight} kg` : "",
    record?.height ? `Height: ${record.height} cm` : "",
  ].filter(Boolean);

  return values.join(", ");
}

function getVitalSignItems(record = {}) {
  const vitalSigns = record?.vitalSigns || record?.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record);

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

function cleanVitalSignValue(value) {
  const text = String(value || "").trim();
  if (!text || /^n\/a\b/i.test(text) || /(^|[/: ])n\/a($|[ /])/i.test(text)) {
    return "";
  }
  return text;
}
