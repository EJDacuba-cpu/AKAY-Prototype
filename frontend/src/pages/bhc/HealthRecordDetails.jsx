import { Link, useLocation, useParams, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
  RefreshingIndicator,
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
import {
  formatHypertensionDiabeticClientStatus,
  formatHypertensionDiabeticCondition,
  formatServiceType,
  getHypertensionDiabeticData,
  getServiceTypeLabel,
  isNcdRecord as isNcdProgramRecord,
  isMaternalRecord as isMaternalProgramRecord,
} from "../../utils/healthRecordPrograms";

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
  const detailsUpdating = isFetching && !loading && Boolean(details);

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
    } catch {
      // The edit modal remains open so the user can retry.
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
          message="Loading health record details..."
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
  const followUpDateValue = getRecordValue(record, ["followUpDate", "follow_up_date"], "");
  const canRecordFollowUpVisit =
    Boolean(followUpDateValue) &&
    getRecordVisitTypeValue(record) !== "follow_up_visit";
  const patientConditionValue = getRecordValue(record, [
    "patientCondition",
    "patient_condition",
  ], "");
  const monitoringNotesValue = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
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
  const epiVaccineEntries = getEpiVaccineEntries(record);
  const epiBreastfeedingMonitoring = getEpiBreastfeedingMonitoring(record);
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
  const serviceType = isImmunizationRecord
    ? "Child Health / EPI"
    : getServiceTypeLabel(
        {
          ...record,
          patientClassification:
            record.patientClassification ||
            patient?.category ||
            patient?.patientClassification,
        },
        "General Consultation",
      );
  const patientClassification = serviceType;
  const displayDate = formatLongDate(getRecordDateValue(record), "Not recorded");
  const displayTime = getRecordTime(record);
  const pageTitle = getHealthRecordDetailsTitle(serviceType);
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
  const isHypertensionDiabeticRecord =
    patientClassification === "Hypertension / Diabetic Monitoring" ||
    (!isImmunizationRecord && isNcdProgramRecord(record));
  const isMaternalRecord =
    patientClassification === "Maternal / Prenatal" ||
    (!isImmunizationRecord &&
      !isHypertensionDiabeticRecord &&
      (isMaternalProgramRecord(record) ||
        formatServiceType(form.category, "") === "Maternal / Prenatal"));
  const dispensedMedicines = getDispensedMedicines(record);
  const isGeneralConsultationRecord =
    patientClassification === "General Consultation";
  const isFamilyPlanningRecord = patientClassification === "Family Planning";
  const familyPlanningDetails = getFamilyPlanningDetails(record);
  const hasFamilyPlanningDetails = familyPlanningDetails.some(
    (item) => item.value,
  );
  const morbidityReportingStatus = getMorbidityReportingStatus(record);
  const shouldShowMorbidityReporting =
    isGeneralConsultationRecord ||
    morbidityReportingStatus === "morbidity" ||
    morbidityReportingStatus === "notifiable";
  const hfmdSurveillance = getHfmdSurveillance(record);
  const generalVitalItems = getVitalSignItems(record);

  return (
    <>
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="min-h-[520px]">

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
                  {pageTitle}
                </h1>
                {hasLinkedReferral && <ReferredChip />}
                {detailsUpdating && (
                  <RefreshingIndicator label="Updating health record details..." />
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  Record #{recordId}
                </span>
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
              patientName={patientName}
              patientId={patientId}
              serviceType={serviceType}
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
              : isImmunizationRecord || isMaternalRecord || isHypertensionDiabeticRecord
                ? "space-y-5"
                : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
          }
        >
          {/* ═══ Clinical Record — Single Card ═══ */}
          <div className="space-y-6">
            {!isEditing && isMaternalRecord ? (
              <MaternalPrenatalRecordDetails
                record={record}
                patientName={patientName}
                serviceType={serviceType}
                displayDate={displayDate}
                displayTime={displayTime}
                practitioner={getRecordPractitioner(record)}
                dispensedMedicines={dispensedMedicines}
                followUpDate={followUpDateValue}
                needsReferral={needsRhuReferral}
                linkedReferral={linkedReferral}
              />
            ) : (
            <SideCard
              title={
                isImmunizationRecord && !isEditing
                  ? "Child Health / EPI Record"
                  : isMaternalRecord && !isEditing
                    ? "Maternal / Prenatal Record"
                  : isHypertensionDiabeticRecord && !isEditing
                    ? "Hypertension / Diabetic Monitoring Record"
                  : "Clinical Record"
              }
              icon={
                isImmunizationRecord && !isEditing ? (
                  <Syringe size={14} />
                ) : (
                  <HeartPulse size={14} />
                )
              }
            >
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
                          <option value="Hypertension / Diabetic Monitoring">
                            Hypertension / Diabetic Monitoring
                          </option>
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
              ) : isImmunizationRecord ? (
                <EpiRecordDetails
                  record={record}
                  patientName={patientName}
                  serviceType={serviceType}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  practitioner={getRecordPractitioner(record)}
                  vaccineEntries={epiVaccineEntries}
                  breastfeedingMonitoring={epiBreastfeedingMonitoring}
                  dispensedMedicines={dispensedMedicines}
                  followUpDate={followUpDateValue}
                  needsReferral={needsRhuReferral}
                  linkedReferralTarget={linkedReferralTarget}
                />
              ) : isMaternalRecord ? (
                <MaternalPrenatalRecordDetails
                  record={record}
                  patientName={patientName}
                  serviceType={serviceType}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  practitioner={getRecordPractitioner(record)}
                  dispensedMedicines={dispensedMedicines}
                  followUpDate={followUpDateValue}
                  needsReferral={needsRhuReferral}
                  linkedReferral={linkedReferral}
                />
              ) : isHypertensionDiabeticRecord ? (
                <HypertensionDiabeticRecordDetails
                  record={record}
                  patientName={patientName}
                  serviceType={serviceType}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  practitioner={getRecordPractitioner(record)}
                  dispensedMedicines={dispensedMedicines}
                  followUpDate={followUpDateValue}
                  needsReferral={needsRhuReferral}
                  linkedReferral={linkedReferral}
                />
              ) : isFamilyPlanningRecord ? (
                <FamilyPlanningRecordDetails
                  record={record}
                  patientName={patientName}
                  serviceType={serviceType}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  practitioner={getRecordPractitioner(record)}
                  details={familyPlanningDetails}
                  dispensedMedicines={dispensedMedicines}
                  followUpDate={followUpDateValue}
                  needsReferral={needsRhuReferral}
                  linkedReferral={linkedReferral}
                />
              ) : isGeneralConsultationRecord ? (
                <GeneralConsultationRecordDetails
                  patientName={patientName}
                  serviceType={serviceType}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  practitioner={getRecordPractitioner(record)}
                  vitalItems={generalVitalItems}
                  chiefComplaint={chiefComplaintValue}
                  diagnosis={diagnosisValue}
                  signsSymptoms={summaryValue}
                  treatmentAction={initialActionsValue}
                  treatmentNotes={treatmentNotesValue}
                  medicalNotes={medicalNotesValue}
                  shouldShowReporting={shouldShowMorbidityReporting}
                  morbidityReportingStatus={morbidityReportingStatus}
                  hfmdSurveillance={hfmdSurveillance}
                  dispensedMedicines={dispensedMedicines}
                  followUpDate={followUpDateValue}
                  needsReferral={needsRhuReferral}
                  linkedReferral={linkedReferral}
                  patientCondition={patientConditionValue}
                  monitoringNotes={monitoringNotesValue}
                  status={status}
                />
              ) : (
                /* ── View Mode ── */
                <div className="divide-y divide-slate-100">
                  <DetailSection title="Visit Overview">
                    <div className="grid gap-4 md:grid-cols-3">
                      <PatientDetailItem label="Date of Visit" value={displayDate} />
                      <PatientDetailItem
                        label="Time of Visit"
                        value={displayTime || "Not recorded"}
                      />
                      <PatientDetailItem
                        label="Name of Practitioner"
                        value={getRecordPractitioner(record)}
                      />
                    </div>
                  </DetailSection>

                  <DetailSection title="Vital Signs">
                    <VitalSignsGrid items={generalVitalItems} />
                  </DetailSection>

                  <DetailSection title="Consultation Information">
                    {hasClinicalAssessmentDetails || hasTreatmentDetails ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <PatientDetailItem
                            label="Chief Complaint"
                            value={chiefComplaintValue || "Not recorded"}
                          />
                          <PatientDetailItem
                            label="Diagnosis / Assessment"
                            value={diagnosisValue || "Not recorded"}
                          />
                          <PatientDetailItem
                            label="Treatment / Action Taken"
                            value={initialActionsValue || "Not recorded"}
                          />
                        </div>
                        {summaryValue && (
                          <NarrativeBox
                            label="Signs & Symptoms"
                            value={summaryValue}
                          />
                        )}
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
                      <SectionEmptyState text="No consultation details recorded." />
                    )}
                  </DetailSection>

                  {shouldShowMorbidityReporting && (
                    <DetailSection title="Morbidity / Notifiable Disease Record">
                      <div className="grid gap-4 md:grid-cols-2">
                        <PatientDetailItem
                          label="Reporting Status"
                          value={formatMorbidityReportingStatus(
                            morbidityReportingStatus,
                          )}
                        />
                      </div>
                    </DetailSection>
                  )}

                  {isGeneralConsultationRecord && (
                    <DetailSection title="Community-Based Surveillance">
                      <div className="grid gap-4 md:grid-cols-2">
                        <PatientDetailItem
                          label="HFMD Surveillance"
                          value={hfmdSurveillance ? "Yes" : "No"}
                        />
                      </div>
                    </DetailSection>
                  )}

                  <DetailSection title="Medicines / Supplies Dispensed">
                    <DispensedMedicinesList medicines={dispensedMedicines} />
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

                  <DetailSection title="Follow-up & Referral">
                    <div className="grid gap-4 md:grid-cols-3">
                      <PatientDetailItem
                        label="Follow-up Date"
                        value={formatLongDate(
                          followUpDateValue,
                          "No follow-up date recorded.",
                        )}
                      />
                      <PatientDetailItem
                        label="Needs RHU Referral"
                        value={needsRhuReferral ? "Yes" : "No"}
                      />
                      {(patientConditionValue ||
                        status === "Follow-up Required") && (
                        <PatientDetailItem
                          label="Patient Condition"
                          value={patientConditionValue}
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
	                </div>
	              )}
            </SideCard>
            )}

          </div>

          {/* ═══ Sidebar ═══ */}
          {!isEditing &&
            !isImmunizationRecord &&
            !isMaternalRecord &&
            !isHypertensionDiabeticRecord && (
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
        </div>
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
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
}) {
  return (
    <div className="  px-3 py-2 ">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetadataItem label="Patient Full Name" value={patientName} />
        <MetadataItem label="Service Type" value={serviceType} />
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
    record.record_type,
    record.healthRecordType,
    record.health_record_type,
    record.patientClassification,
    patient?.category,
    patient?.patientClassification,
  ].some((value) => {
    const normalized = String(value || "").toLowerCase();
    return (
      normalized === "immunization" ||
      normalized.includes("epi") ||
      normalized.includes("child health") ||
      normalized.includes("vaccination") ||
      normalized.includes("vaccine")
    );
  });
}

function getImmunizationData(record = {}) {
  return record.immunizationData || record.immunization_data || {};
}

function getEpiVaccineEntries(record = {}) {
  const data = getImmunizationData(record);
  const entries = Array.isArray(data.vaccineEntries)
    ? data.vaccineEntries
    : Array.isArray(data.vaccinesGiven)
      ? data.vaccinesGiven
      : Array.isArray(record.vaccineEntries)
        ? record.vaccineEntries
        : Array.isArray(record.vaccinesGiven)
          ? record.vaccinesGiven
          : [];

  return entries
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => String(entry.vaccineName || entry.vaccine_name || "").trim())
    .map((entry) => ({
      vaccineName: entry.vaccineName || entry.vaccine_name || "Vaccine",
      dateGiven: entry.dateGiven || entry.date_given || entry.date || "",
      weight: entry.weight || "",
      height: entry.height || "",
      temperature: entry.temperature || entry.temp || "",
      remarks: entry.remarks || entry.notes || "",
    }));
}

function getEpiBreastfeedingMonitoring(record = {}) {
  const data = getImmunizationData(record);
  return (
    data.breastfeedingMonitoring ||
    data.breastfeeding_monitoring ||
    record.breastfeedingMonitoring ||
    record.breastfeeding_monitoring ||
    {}
  );
}

function getConfirmedBreastfeedingMonths(data = {}) {
  const months = [
    ["month1", "1 Month"],
    ["month2", "2 Months"],
    ["month3", "3 Months"],
    ["month4", "4 Months"],
    ["month5", "5 Months"],
    ["month6", "6 Months"],
  ];

  return months
    .filter(([key]) => data[key] === true || data[key] === "yes")
    .map(([, label]) => label);
}

function getEpiRemarks(record = {}) {
  const data = getImmunizationData(record);
  return getRecordValue(
    {
      ...data,
      ...record,
    },
    [
      "consultationNotes",
      "consultation_notes",
      "notes",
      "remarks",
      "medicalNotes",
      "medical_notes",
    ],
    "",
  );
}

function getVisitLevelMonitoringItems(record = {}) {
  return [
    {
      label: "Weight",
      value: formatMeasurement(getRecordValue(record, ["weight"], ""), "kg"),
    },
    {
      label: "Height",
      value: formatMeasurement(getRecordValue(record, ["height"], ""), "cm"),
    },
    {
      label: "Temperature",
      value: formatMeasurement(
        getRecordValue(record, ["temperature", "temp"], ""),
        "°C",
      ),
    },
  ];
}

function formatMeasurement(value, unit) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.toLowerCase().includes(String(unit).toLowerCase())
    ? clean
    : `${clean} ${unit}`;
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
      label: "FP Visit Category",
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

function getHealthRecordDetailsTitle(serviceType = "") {
  const normalized = formatServiceType(serviceType, "");
  if (normalized === "Maternal / Prenatal") return "Maternal / Prenatal Record";
  if (normalized === "Child Health / EPI") return "Child Health / EPI Record";
  if (normalized === "Family Planning") return "Family Planning Record";
  if (normalized === "Hypertension / Diabetic Monitoring") {
    return "Hypertension / Diabetic Monitoring Record";
  }
  if (normalized === "TB DOTS / TB Monitoring") return "TB Follow-up Record";
  if (normalized === "General Consultation") return "General Consultation Record";
  return normalized ? `${normalized} Record` : "Health Record Details";
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

function normalizeMorbidityReportingStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["not_included", "morbidity", "notifiable"].includes(normalized)
    ? normalized
    : "";
}

function getMorbidityReportingStatus(record = {}) {
  const explicitStatus = normalizeMorbidityReportingStatus(
    getNestedRecordValue(
      record,
      ["morbidityReportingStatus", "morbidity_reporting_status"],
      ["monitoringData", "monitoring_data"],
    ),
  );
  if (explicitStatus) return explicitStatus;

  const included = String(
    getNestedRecordValue(
      record,
      ["includeInMorbidityReport", "include_in_morbidity_report"],
      ["monitoringData", "monitoring_data"],
    ),
  ).toLowerCase();
  const notifiable = String(
    getNestedRecordValue(
      record,
      ["isNotifiableDisease", "is_notifiable_disease"],
      ["monitoringData", "monitoring_data"],
    ),
  ).toLowerCase();

  if (included === "true" || included === "yes") {
    return notifiable === "true" || notifiable === "yes"
      ? "notifiable"
      : "morbidity";
  }

  return "not_included";
}

function formatMorbidityReportingStatus(status = "") {
  switch (normalizeMorbidityReportingStatus(status)) {
    case "morbidity":
      return "Include in Morbidity Log";
    case "notifiable":
      return "Mark as Notifiable Disease";
    default:
      return "Not included";
  }
}

function getSurveillanceCategoryValue(record = {}) {
  const raw = getNestedRecordValue(
    record,
    [
      "surveillanceCategory",
      "surveillance_category",
      "diseaseSurveillanceCategory",
      "disease_surveillance_category",
      "diseaseCategory",
      "disease_category",
    ],
    ["monitoringData", "monitoring_data"],
  );
  const normalized = String(raw || "").trim().toLowerCase();
  if (
    normalized === "hfmd" ||
    normalized.includes("hand, foot") ||
    normalized.includes("hand foot") ||
    normalized.includes("mouth disease")
  ) {
    return "hfmd";
  }
  if (normalized === "other") return "other";
  return normalized;
}

function getHfmdSurveillance(record = {}) {
  const explicit = getNestedRecordValue(
    record,
    ["hfmdSurveillance", "hfmd_surveillance"],
    ["monitoringData", "monitoring_data"],
  );

  if (explicit !== "") {
    const normalized = String(explicit || "").trim().toLowerCase();
    return explicit === true || ["true", "yes", "1"].includes(normalized);
  }

  return getSurveillanceCategoryValue(record) === "hfmd";
}

function getMaternalData(record = {}) {
  return record.maternalData || record.maternal_data || {};
}

function getDispensedMedicines(record = {}) {
  const medicines = record.dispensedMedicines || record.dispensed_medicines || [];
  return Array.isArray(medicines) ? medicines.filter(Boolean) : [];
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
  if (direct) return formatDisplayTime(direct, "");

  const recorded = getRecordValue(record, ["dateRecorded", "date_recorded"], "");
  const match = String(recorded).match(/\d{2}:\d{2}/);
  return match ? formatDisplayTime(match[0], "") : "";
}

function formatDisplayTime(value, fallback = "Not recorded") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const dateValue = new Date(raw);
  if (!Number.isNaN(dateValue.getTime()) && raw.includes("T")) {
    return dateValue.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;

  const hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours) || hours > 23) return raw;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
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
      record?.respiratoryRate || record?.respiratory_rate
        ? `Respiratory Rate: ${record.respiratoryRate || record.respiratory_rate} cpm`
        : "",
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
    value.respiratoryRate || value.respiratory_rate
      ? `Respiratory Rate: ${value.respiratoryRate || value.respiratory_rate} cpm`
      : "",
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
  const respiratoryRateValue =
    record?.respiratoryRate ||
    record?.respiratory_rate ||
    vitalObject.respiratoryRate ||
    vitalObject.respiratory_rate ||
    readTextValue([
      /Respiratory Rate:\s*([^|,]+)/i,
      /Resp(?:iratory)?\.?\s*Rate:\s*([^|,]+)/i,
      /RR:\s*([^|,]+)/i,
    ]);
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
    {
      label: "Respiratory Rate",
      value: cleanVitalSignValue(respiratoryRateValue),
    },
    { label: "Weight", value: cleanVitalSignValue(weightValue) },
    { label: "Height", value: cleanVitalSignValue(heightValue) },
  ];
}

function DispensedMedicinesList({ medicines }) {
  if (!medicines.length) {
    return (
      <SectionEmptyState text="No medicines or supplies were dispensed during this visit." />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[minmax(180px,1.5fr)_120px_minmax(160px,1fr)_140px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
        <span>Medicine / Supply Name</span>
        <span>Quantity</span>
        <span>Remarks</span>
        <span>Date Dispensed</span>
      </div>
      <div className="divide-y divide-slate-100">
        {medicines.map((medicine, index) => (
          <div
            key={medicine.id || `${medicine.medicineId || "medicine"}-${index}`}
            className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(180px,1.5fr)_120px_minmax(160px,1fr)_140px] md:items-center"
          >
            <div>
              <p className="font-semibold text-[#0F172A]">
                {medicine.medicineName || medicine.medicine_name_snapshot || "Medicine"}
              </p>
              <p className="text-[11px] text-slate-400">
                {medicine.category || medicine.category_snapshot || ""}
              </p>
            </div>
            <p className="text-slate-600">
              {formatDisplayValue(medicine.quantity, "0")}{" "}
              {formatDisplayValue(medicine.unit, "")}
            </p>
            <p className="text-slate-600">
              {formatDisplayValue(medicine.remarks, "\u2014")}
            </p>
            <p className="text-slate-500">
              {formatLongDate(
                medicine.dateDispensed || medicine.created_at || medicine.createdAt,
                "\u2014",
              )}
            </p>
          </div>
        ))}
      </div>
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

const MATERNAL_RISK_LABELS = {
  ageRisk: "Age less than 18 or greater than 35",
  heightRisk: "Height less than 145 cm",
  grandMultipara: "Grand multipara / fourth baby or more",
  previousCs: "Previous C/S",
  recurrentMiscarriageOrStillbirth: "3 consecutive miscarriage or stillbirth",
  postpartumHemorrhage: "Post-partum hemorrhage",
  tuberculosis: "Tuberculosis",
  heartDisease: "Heart Disease",
  diabetes: "Diabetes",
  bronchialAsthma: "Bronchial Asthma",
  goiter: "Goiter",
  hypertensive: "Hypertensive",
  alcoholUser: "Alcohol user",
  smoker: "Smoker",
};

function getMaternalValue(maternal = {}, record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = maternal?.[key] ?? record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

function getPreviousPregnancyHistory(maternal = {}) {
  const rows =
    maternal.previousPregnancyHistory ||
    maternal.previous_pregnancy_history ||
    [];
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

function PreviousPregnancyHistoryTable({ rows = [] }) {
  if (!rows.length) {
    return (
      <SectionEmptyState text="No previous pregnancy history recorded." />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[120px_minmax(180px,1fr)_110px_minmax(180px,1fr)] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:grid">
        <div className="px-3 py-2.5">Pregnancy No.</div>
        <div className="px-3 py-2.5">Place of Delivery</div>
        <div className="px-3 py-2.5">Year</div>
        <div className="px-3 py-2.5">Notes</div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, index) => (
          <div
            key={`${row.pregnancyNo || row.pregnancy_no || "pregnancy"}-${index}`}
            className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[120px_minmax(180px,1fr)_110px_minmax(180px,1fr)] md:items-center md:gap-0"
          >
            <EpiTableCell
              label="Pregnancy No."
              value={row.pregnancyNo || row.pregnancy_no}
            />
            <EpiTableCell
              label="Place of Delivery"
              value={row.placeOfDelivery || row.place_of_delivery}
            />
            <EpiTableCell label="Year" value={row.year} />
            <EpiTableCell label="Notes" value={row.notes} />
          </div>
        ))}
      </div>
    </div>
  );
}

function getSelectedMaternalRiskLabels(maternal = {}) {
  const riskAssessment =
    maternal.riskAssessment ||
    maternal.risk_assessment ||
    maternal.medicalHistory ||
    maternal.medical_history ||
    {};

  return Object.entries(MATERNAL_RISK_LABELS)
    .filter(([key]) => riskAssessment?.[key] === true || riskAssessment?.[key] === "true")
    .map(([, label]) => label);
}

function getPreviousFpMethodValue(maternal = {}) {
  const method =
    maternal.previousFpMethodUsed ||
    maternal.previous_fp_method_used ||
    "";
  const other =
    maternal.previousFpMethodOther ||
    maternal.previous_fp_method_other ||
    "";

  if (String(method).toLowerCase() === "other" && other) return other;
  return method || "";
}

function getLaboratoryResultItems(maternal = {}) {
  const labs = maternal.laboratoryResults || maternal.laboratory_results || {};
  return [
    ["Hemoglobin", ["hemoglobin"]],
    ["CBC", ["cbc"]],
    ["Blood Type", ["bloodType", "blood_type"]],
    ["HBsAg", ["hbsag", "HBsAg", "hbsAg"]],
    ["HIV", ["hiv"]],
    ["Syphilis", ["syphilis"]],
    ["Urinalysis", ["urinalysis"]],
  ].map(([label, keys]) => ({
    label,
    value: getRecordValue(labs, keys, ""),
  }));
}

function getTetanusToxoidDate(maternal = {}, record = {}, dose) {
  const sourceObjects = [
    maternal.tetanusToxoidStatus,
    maternal.tetanus_toxoid_status,
    record.tetanusToxoidStatus,
    record.tetanus_toxoid_status,
    maternal,
    record,
  ].filter((source) => source && typeof source === "object");
  const keys = [
    `tt${dose}`,
    `td${dose}`,
    `tt${dose}Date`,
    `tt${dose}_date`,
    `td${dose}Date`,
    `td${dose}_date`,
    `TT${dose}Date`,
    `TD${dose}Date`,
  ];
  const normalizedKeys = new Set(keys.map(normalizeRecordKey));

  for (const source of sourceObjects) {
    for (const key of keys) {
      const value = source?.[key];
      if (value) return value;
    }

    for (const [key, value] of Object.entries(source)) {
      if (value && normalizedKeys.has(normalizeRecordKey(key))) {
        return value;
      }
    }
  }

  return "";
}

function getRecordedTetanusToxoidDoses(maternal = {}, record = {}) {
  return [1, 2, 3, 4, 5]
    .map((dose) => ({
      dose: `TT${dose}`,
      date: getTetanusToxoidDate(maternal, record, dose),
    }))
    .filter((entry) => Boolean(entry.date));
}

function normalizeRecordKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getUltrasoundValue(maternal = {}, keys = []) {
  const ultrasound = maternal.ultrasound || {};
  return getRecordValue(ultrasound, keys, "") || getRecordValue(maternal, keys, "");
}

function getVitalField(record = {}, field) {
  const vitalSigns = record.vitalSigns || record.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};

  if (record?.[field]) return record[field];
  if (vitalObject?.[field]) return vitalObject[field];

  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");
  const patternMap = {
    weight: [/Weight:\s*([^|,]+)/i, /WT:\s*([^|,]+)/i],
    height: [/Height:\s*([^|,]+)/i, /HGT:\s*([^|,]+)/i],
  };

  for (const pattern of patternMap[field] || []) {
    const match = String(vitalText || "").match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function getBloodPressureValue(record = {}) {
  const vitalSigns = record.vitalSigns || record.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const systolic =
    record.systolicBp ||
    record.systolic_bp ||
    vitalObject.systolicBp ||
    vitalObject.systolic_bp;
  const diastolic =
    record.diastolicBp ||
    record.diastolic_bp ||
    vitalObject.diastolicBp ||
    vitalObject.diastolic_bp;

  if (systolic && diastolic) return `${systolic}/${diastolic} mmHg`;

  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");
  const match = String(vitalText || "").match(/(?:BP|Blood Pressure):\s*([^|,]+)/i);
  return match?.[1]?.trim() || "Not recorded";
}

function HypertensionDiabeticRecordDetails(props) {
  return (
    <HypertensionDiabeticTabbedRecordDetails {...props} />
  );
}

function HypertensionDiabeticLegacyDetails({
  record,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  dispensedMedicines,
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const data = getHypertensionDiabeticData(record);
  const referralStatus =
    linkedReferral?.status ||
    record.referralStatus ||
    record.referral_status ||
    "";

  return (
    <div className="divide-y divide-slate-100">
      <DetailSection title="Visit Overview">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <PatientDetailItem label="Patient Full Name" value={patientName} />
          <PatientDetailItem label="Service Type" value={serviceType} />
          <PatientDetailItem label="Date of Visit" value={displayDate} />
          <PatientDetailItem
            label="Time of Visit"
            value={displayTime || "Not recorded"}
          />
          <PatientDetailItem
            label="Name of Practitioner"
            value={practitioner}
          />
        </div>
      </DetailSection>

      <DetailSection title="Monitoring Details">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <PatientDetailItem label="BP" value={data.bp || "—"} />
          <PatientDetailItem label="FBS" value={data.fbs || "—"} />
          <PatientDetailItem
            label="Condition Type"
            value={formatHypertensionDiabeticCondition(data.conditionType) || "—"}
          />
          <PatientDetailItem
            label="Client Status"
            value={formatHypertensionDiabeticClientStatus(data.clientStatus) || "—"}
          />
          <PatientDetailItem
            label="Date of Last Consultation"
            value={formatLongDate(data.dateOfLastConsultation, "—")}
          />
        </div>
      </DetailSection>

      <DetailSection title="Treatment / Action Taken">
        {data.treatmentActionTaken ? (
          <NarrativeBox
            label="Treatment / Action Taken"
            value={data.treatmentActionTaken}
          />
        ) : (
          <SectionEmptyState text="No treatment or action taken recorded." />
        )}
      </DetailSection>

      <DetailSection title="Medicines / Supplies Dispensed">
        <DispensedMedicinesList medicines={dispensedMedicines} />
      </DetailSection>

      <DetailSection title="Follow-up & Referral">
        <div className="grid gap-4 md:grid-cols-3">
          <PatientDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "—")}
          />
          <PatientDetailItem
            label="Needs RHU Referral"
            value={needsReferral ? "Yes" : "No"}
          />
          <PatientDetailItem
            label="Referral Status"
            value={referralStatus || "—"}
          />
        </div>
      </DetailSection>
    </div>
  );
}

HypertensionDiabeticRecordDetails.Legacy = HypertensionDiabeticLegacyDetails;

function HypertensionDiabeticTabbedRecordDetails({
  record,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  dispensedMedicines,
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const data = getHypertensionDiabeticData(record);
  const referralStatus =
    linkedReferral?.status ||
    record.referralStatus ||
    record.referral_status ||
    "";

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Patient" value={patientName} />
          <TabbedDetailItem label="Service Type" value={serviceType} />
          <TabbedDetailItem
            label="Date and Time"
            value={[displayDate, displayTime].filter(Boolean).join(" / ")}
          />
          <TabbedDetailItem label="Practitioner" value={practitioner} />
          <TabbedDetailItem label="BP" value={data.bp} />
          <TabbedDetailItem label="FBS" value={data.fbs} />
          <TabbedDetailItem
            label="Condition Type"
            value={formatHypertensionDiabeticCondition(data.conditionType)}
          />
          <TabbedDetailItem
            label="Client Status"
            value={formatHypertensionDiabeticClientStatus(data.clientStatus)}
          />
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
    {
      id: "monitoring",
      label: "Monitoring Details",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="BP" value={data.bp} />
          <TabbedDetailItem label="FBS" value={data.fbs} />
          <TabbedDetailItem
            label="Condition Type"
            value={formatHypertensionDiabeticCondition(data.conditionType)}
          />
          <TabbedDetailItem
            label="Client Status"
            value={formatHypertensionDiabeticClientStatus(data.clientStatus)}
          />
          <TabbedDetailItem
            label="Date of Last Consultation"
            value={formatLongDate(data.dateOfLastConsultation, "Not recorded")}
          />
        </div>
      ),
    },
    {
      id: "treatment",
      label: "Treatment / Action Taken",
      content: data.treatmentActionTaken ? (
        <TabbedNarrativeBlock
          label="Treatment / Action Taken"
          value={data.treatmentActionTaken}
        />
      ) : (
        <SectionEmptyState text="No treatment or action taken recorded." />
      ),
    },
    {
      id: "medicines",
      label: "Medicines",
      content: <DispensedMedicinesList medicines={dispensedMedicines} />,
    },
    {
      id: "followup",
      label: "Follow-up & Referral",
      content: (
        <div className="grid gap-4 md:grid-cols-3">
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem
            label="Needs RHU Referral"
            value={needsReferral ? "Yes" : "No"}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
  ];

  return (
    <TabbedDetailsCard
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function GeneralConsultationRecordDetails({
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  vitalItems = [],
  chiefComplaint,
  diagnosis,
  signsSymptoms,
  treatmentAction,
  treatmentNotes,
  medicalNotes,
  shouldShowReporting,
  morbidityReportingStatus,
  hfmdSurveillance,
  dispensedMedicines = [],
  followUpDate,
  needsReferral,
  linkedReferral,
  patientCondition,
  monitoringNotes,
  status,
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const referralStatus =
    linkedReferral?.status || linkedReferral?.referralStatus || "";
  const hasConsultationDetails = Boolean(
    chiefComplaint ||
      diagnosis ||
      signsSymptoms ||
      treatmentAction ||
      treatmentNotes ||
      medicalNotes,
  );

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Patient" value={patientName} />
          <TabbedDetailItem label="Service Type" value={serviceType} />
          <TabbedDetailItem
            label="Date and Time"
            value={[displayDate, displayTime].filter(Boolean).join(" / ")}
          />
          <TabbedDetailItem label="Practitioner" value={practitioner} />
          <TabbedDetailItem label="Chief Complaint" value={chiefComplaint} />
          <TabbedDetailItem label="Diagnosis" value={diagnosis} />
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
    {
      id: "vitals",
      label: "Vital Signs",
      content: <VitalSignsGrid items={vitalItems} />,
    },
    {
      id: "consultation",
      label: "Consultation Details",
      content: hasConsultationDetails ? (
        <div className="space-y-4">
          <TabbedNarrativeBlock label="Chief Complaint" value={chiefComplaint} />
          <TabbedNarrativeBlock
            label="Signs & Symptoms / Assessment Findings"
            value={signsSymptoms}
          />
          <TabbedNarrativeBlock label="Diagnosis" value={diagnosis} />
          <TabbedNarrativeBlock
            label="Treatment / Action Taken"
            value={treatmentAction}
          />
          {isDistinctRecordedValue(treatmentNotes, treatmentAction) && (
            <TabbedNarrativeBlock
              label="Treatment Notes"
              value={treatmentNotes}
            />
          )}
          {isDistinctRecordedValue(medicalNotes, treatmentAction, treatmentNotes) && (
            <TabbedNarrativeBlock label="Medical Notes" value={medicalNotes} />
          )}
        </div>
      ) : (
        <SectionEmptyState text="No consultation details recorded." />
      ),
    },
    {
      id: "reporting",
      label: "Reporting Decision",
      content: shouldShowReporting ? (
        <div className="grid gap-4 md:grid-cols-2">
          <TabbedDetailItem
            label="Morbidity / Notifiable Status"
            value={formatMorbidityReportingStatus(morbidityReportingStatus)}
          />
          <TabbedDetailItem
            label="HFMD Surveillance"
            value={hfmdSurveillance ? "Yes" : "No"}
          />
        </div>
      ) : (
        <SectionEmptyState text="No reporting decision recorded." />
      ),
    },
    {
      id: "medicines",
      label: "Medicines",
      content: <DispensedMedicinesList medicines={dispensedMedicines} />,
    },
    {
      id: "followup",
      label: "Follow-up & Referral",
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TabbedDetailItem
              label="Next Follow-up Date"
              value={formatLongDate(followUpDate, "Not recorded")}
            />
            <TabbedDetailItem
              label="Needs RHU Referral"
              value={needsReferral ? "Yes" : "No"}
            />
            <TabbedDetailItem label="Referral Status" value={referralStatus} />
            {(patientCondition || status === "Follow-up Required") && (
              <TabbedDetailItem
                label="Patient Condition"
                value={patientCondition}
              />
            )}
          </div>
          {monitoringNotes && (
            <TabbedNarrativeBlock
              label="Monitoring Notes"
              value={monitoringNotes}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <TabbedDetailsCard
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function FamilyPlanningRecordDetails({
  record,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  details = [],
  dispensedMedicines = [],
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const getDetailValue = (label) =>
    details.find((item) => item.label === label)?.value || "";
  const referralStatus =
    linkedReferral?.status ||
    record.referralStatus ||
    record.referral_status ||
    "";
  const hasDetails = details.some((item) => item.value);
  const concern = getDetailValue("Concern / Complaint");
  const findings = getDetailValue("Findings / Notes");
  const advice = getDetailValue("Advice Given");
  const actionTaken = getDetailValue("Action Taken");

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Patient" value={patientName} />
          <TabbedDetailItem label="Service Type" value={serviceType} />
          <TabbedDetailItem
            label="Date and Time"
            value={[displayDate, displayTime].filter(Boolean).join(" / ")}
          />
          <TabbedDetailItem label="Practitioner" value={practitioner} />
          <TabbedDetailItem label="Client Type" value={getDetailValue("Client Type")} />
          <TabbedDetailItem
            label="Method Used / Accepted"
            value={getDetailValue("Method Used / Accepted")}
          />
          <TabbedDetailItem
            label="Next Appointment Date"
            value={getDetailValue("Next Appointment Date")}
          />
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
    {
      id: "details",
      label: "Family Planning Details",
      content: hasDetails ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {details.map((item) => (
            <TabbedDetailItem
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>
      ) : (
        <SectionEmptyState text="No family planning details recorded." />
      ),
    },
    {
      id: "clinical",
      label: "Clinical Concern",
      content:
        concern || findings || advice || actionTaken ? (
          <div className="space-y-4">
            <TabbedNarrativeBlock label="Concern / Complaint" value={concern} />
            <TabbedNarrativeBlock label="Findings / Notes" value={findings} />
            <TabbedNarrativeBlock label="Advice Given" value={advice} />
            <TabbedNarrativeBlock label="Action Taken" value={actionTaken} />
          </div>
        ) : (
          <SectionEmptyState text="No clinical concern recorded." />
        ),
    },
    {
      id: "medicines",
      label: "Medicines / Supplies",
      content: <DispensedMedicinesList medicines={dispensedMedicines} />,
    },
    {
      id: "followup",
      label: "Follow-up & Referral",
      content: (
        <div className="grid gap-4 md:grid-cols-3">
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem
            label="Needs RHU Referral"
            value={needsReferral ? "Yes" : "No"}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
  ];

  return (
    <TabbedDetailsCard
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function MaternalPrenatalRecordDetails({
  record,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  dispensedMedicines,
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const EMPTY_VALUE = "Not recorded";
  const [activeTab, setActiveTab] = useState("summary");
  const maternal = getMaternalData(record);
  const term = getMaternalValue(maternal, record, ["term"], "");
  const preterm = getMaternalValue(maternal, record, ["preterm"], "");
  const abortion = getMaternalValue(maternal, record, ["abortion"], "");
  const living = getMaternalValue(maternal, record, ["living"], "");
  const tpal =
    getMaternalValue(maternal, record, ["tpal", "obScore", "ob_score"], "") ||
    ([term, preterm, abortion, living].some((value) => value !== "")
      ? [term || 0, preterm || 0, abortion || 0, living || 0].join("-")
      : "");
  const previousPregnancyHistory = getPreviousPregnancyHistory(maternal);
  const selectedRiskLabels = getSelectedMaternalRiskLabels(maternal);
  const recordedTetanusDoses = getRecordedTetanusToxoidDoses(maternal, record);
  const chiefComplaint = getRecordChiefComplaint(record, "");
  const treatment =
    getMaternalValue(maternal, record, ["treatment"], "") ||
    getRecordInitialActions(record, "");
  const findings = getRecordSummary(record, "");
  const notes = getRecordNotes(record, "");
  const notesFindings = [findings, notes]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("\n\n");
  const lmp = getMaternalValue(maternal, record, ["lmp"], "");
  const pmp = getMaternalValue(maternal, record, ["pmp"], "");
  const edc = getMaternalValue(
    maternal,
    record,
    ["expectedDeliveryDate", "expected_delivery_date", "edc", "edd"],
    "",
  );
  const aog = getMaternalValue(
    maternal,
    record,
    ["aog", "ageOfGestation", "age_of_gestation"],
    "",
  );
  const bp = getBloodPressureValue(record);
  const weight = formatMeasurement(getVitalField(record, "weight"), "kg");
  const height = formatMeasurement(getVitalField(record, "height"), "cm");
  const bmi = getMaternalValue(maternal, record, ["bmi"], "");
  const vitalItems = getVitalSignItems(record);
  const temperature = vitalItems.find((item) => item.label === "Temperature")?.value || "";
  const pulse = vitalItems.find((item) => item.label === "Pulse")?.value || "";
  const respiratoryRate =
    vitalItems.find((item) => item.label === "Respiratory Rate")?.value || "";
  const labs = getLaboratoryResultItems(maternal);
  const hasLabResults = labs.some((item) => Boolean(item.value));
  const ultrasoundResult = getUltrasoundValue(maternal, [
    "result",
    "ultrasoundResult",
    "ultrasound_result",
  ]);
  const ultrasoundDate = getUltrasoundValue(maternal, [
    "dateDone",
    "date_done",
    "date",
  ]);
  const ultrasoundRemarks = getUltrasoundValue(maternal, ["remarks", "notes"]);
  const referralStatus =
    linkedReferral?.status ||
    record.referralStatus ||
    record.referral_status ||
    "";
  const referralReason =
    linkedReferral?.reasonForReferral ||
    linkedReferral?.reason_for_referral ||
    record.referralReason ||
    record.referral_reason ||
    "";
  const previousFpMethod = getPreviousFpMethodValue(maternal);
  const hasPreviousFpMethod = Boolean(previousFpMethod);

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Patient" value={patientName} />
          <TabbedDetailItem label="Service Type" value={serviceType} />
          <TabbedDetailItem
            label="Date and Time"
            value={[displayDate, displayTime].filter(Boolean).join(" / ")}
          />
          <TabbedDetailItem label="Practitioner" value={practitioner} />
          <TabbedDetailItem label="BP" value={bp} />
          <TabbedDetailItem label="Weight" value={weight} />
          <TabbedDetailItem label="LMP" value={formatLongDate(lmp, EMPTY_VALUE)} />
          <TabbedDetailItem label="EDC" value={formatLongDate(edc, EMPTY_VALUE)} />
          <TabbedDetailItem label="AOG" value={aog} />
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, EMPTY_VALUE)}
          />
          <TabbedDetailItem label="Referral Status" value={referralStatus} />
        </div>
      ),
    },
    {
      id: "pregnancy",
      label: "Pregnancy Details",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="LMP" value={formatLongDate(lmp, EMPTY_VALUE)} />
          <TabbedDetailItem label="PMP" value={formatLongDate(pmp, EMPTY_VALUE)} />
          <TabbedDetailItem
            label="Expected Delivery Date / EDC"
            value={formatLongDate(edc, EMPTY_VALUE)}
          />
          <TabbedDetailItem label="AOG" value={aog} />
          <TabbedDetailItem label="Gravida" value={getMaternalValue(maternal, record, ["gravida"], "")} />
          <TabbedDetailItem label="Para" value={getMaternalValue(maternal, record, ["para"], "")} />
          <TabbedDetailItem label="Term" value={term} />
          <TabbedDetailItem label="Preterm" value={preterm} />
          <TabbedDetailItem label="Abortion" value={abortion} />
          <TabbedDetailItem label="Living" value={living} />
          <TabbedDetailItem label="OB Score / TPAL" value={tpal} />
        </div>
      ),
    },
    {
      id: "vitals",
      label: "Vital Signs",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Blood Pressure" value={bp} />
          <TabbedDetailItem label="Weight" value={weight} />
          <TabbedDetailItem label="Height / HGT" value={height} />
          <TabbedDetailItem label="BMI" value={bmi} />
          <TabbedDetailItem label="Temperature" value={temperature} />
          <TabbedDetailItem label="Pulse" value={pulse} />
          <TabbedDetailItem label="Respiratory Rate" value={respiratoryRate} />
        </div>
      ),
    },
    {
      id: "complaint",
      label: "Complaint & Treatment",
      content: (
        <div className="space-y-4">
          <TabbedNarrativeBlock
            label="Chief Complaint"
            value={chiefComplaint}
          />
          <TabbedNarrativeBlock
            label="Treatment / Advice Given"
            value={treatment}
          />
          {notesFindings && (
            <TabbedNarrativeBlock
              label="Notes / Findings"
              value={notesFindings}
            />
          )}
        </div>
      ),
    },
    {
      id: "medicines",
      label: "Medicines",
      content: <DispensedMedicinesList medicines={dispensedMedicines} />,
    },
    {
      id: "history",
      label: "Pregnancy History",
      content: <PreviousPregnancyHistoryTable rows={previousPregnancyHistory} />,
    },
    {
      id: "riskLabs",
      label: "Risk / Labs",
      content: (
        <div className="space-y-6">
          <TabbedSubsection title="Medical History / Risk Codes">
            {selectedRiskLabels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedRiskLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-[#B91C1C]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <SectionEmptyState text="No risk codes recorded." />
            )}
          </TabbedSubsection>
          <TabbedSubsection title="Previous FP Method Used">
            {hasPreviousFpMethod ? (
              <TabbedDetailItem label="Previous FP Method Used" value={previousFpMethod} />
            ) : (
              <SectionEmptyState text="No previous FP method recorded." />
            )}
          </TabbedSubsection>
          <TabbedSubsection title="Laboratory Results">
            {hasLabResults ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {labs.map((item) => (
                  <TabbedDetailItem
                    key={item.label}
                    label={item.label}
                    value={item.value || EMPTY_VALUE}
                  />
                ))}
              </div>
            ) : (
              <SectionEmptyState text="No laboratory results recorded." />
            )}
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "tt",
      label: "TT / Td Recorded",
      content:
        recordedTetanusDoses.length > 0 ? (
          <div className="space-y-4">
            <TabbedSubsection title="Tetanus Toxoid / Td Recorded This Visit">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Dose</th>
                      <th className="px-4 py-3">Date Given</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recordedTetanusDoses.map((entry) => (
                      <tr key={entry.dose}>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">
                          {entry.dose}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">
                          {formatLongDate(entry.date, EMPTY_VALUE)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabbedSubsection>
          </div>
        ) : (
          <SectionEmptyState text="No tetanus toxoid / Td dose was recorded for this visit." />
        ),
    },
    {
      id: "ultrasound",
      label: "Ultrasound",
      content:
        ultrasoundResult || ultrasoundDate || ultrasoundRemarks ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <TabbedDetailItem
                label="Date Done"
                value={formatLongDate(ultrasoundDate, EMPTY_VALUE)}
              />
            </div>
            <NarrativeBox
              label="Ultrasound Result / Findings"
              value={ultrasoundResult}
              emptyText="No ultrasound findings recorded."
            />
            <NarrativeBox
              label="Remarks"
              value={ultrasoundRemarks}
              emptyText="No ultrasound remarks recorded."
            />
          </div>
        ) : (
          <SectionEmptyState text="No ultrasound result recorded for this visit." />
        ),
    },
    {
      id: "followup",
      label: "Follow-up & Referral",
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TabbedDetailItem
              label="Next Follow-up Date"
              value={formatLongDate(followUpDate, EMPTY_VALUE)}
            />
            <TabbedDetailItem
              label="Needs RHU Referral"
              value={needsReferral ? "Yes" : "No"}
            />
            <TabbedDetailItem label="Referral Status" value={referralStatus || EMPTY_VALUE} />
          </div>
          <NarrativeBox
            label="Referral Reason"
            value={referralReason}
            emptyText="No referral reason recorded."
          />
        </div>
      ),
    },
  ];

  return (
    <TabbedDetailsCard
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function TabbedDetailsCard({ tabs = [], activeTab, onTabChange }) {
  const tabListRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const selectedTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  function updateScrollState() {
    const element = tabListRef.current;
    if (!element) return;
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setScrollState({
      canScrollLeft: element.scrollLeft > 4,
      canScrollRight: element.scrollLeft < maxScrollLeft - 4,
    });
  }

  function scrollTabs(direction) {
    const element = tabListRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction === "left" ? -220 : 220,
      behavior: "smooth",
    });
  }

  useEffect(() => {
    updateScrollState();
    const element = tabListRef.current;
    if (!element) return undefined;

    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [tabs.length]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-white px-3 py-3">
        <style>{`
          .akay-tab-scrollbar {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .akay-tab-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollTabs("left")}
            disabled={!scrollState.canScrollLeft}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:pointer-events-none disabled:opacity-30"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            ref={tabListRef}
            className="akay-tab-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto"
          >
          {tabs.map((tab) => {
            const selected = tab.id === selectedTab?.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  selected
                    ? "bg-[#B91C1C] text-white shadow-sm"
                    : "text-slate-500 hover:bg-red-50 hover:text-[#B91C1C]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          </div>
          <button
            type="button"
            onClick={() => scrollTabs("right")}
            disabled={!scrollState.canScrollRight}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:pointer-events-none disabled:opacity-30"
            aria-label="Scroll tabs right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="p-5 sm:p-6">{selectedTab?.content}</div>
    </section>
  );
}

function TabbedSubsection({ title, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {title}
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </section>
  );
}

function TabbedDetailItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[#0F172A]">
        {formatTabValue(value)}
      </p>
    </div>
  );
}

function TabbedNarrativeBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
        {formatTabValue(value)}
      </p>
    </div>
  );
}

function formatTabValue(value) {
  const text = String(value ?? "").trim();
  if (
    !text ||
    text.toLowerCase() === "not recorded" ||
    text.toLowerCase() === "no follow-up date recorded." ||
    text === "\u2014"
  ) {
    return "Not recorded";
  }
  return text;
}

function EpiRecordDetails({
  record,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  vaccineEntries = [],
  breastfeedingMonitoring = {},
  dispensedMedicines = [],
  followUpDate,
  needsReferral,
  linkedReferralTarget,
}) {
  const [activeTab, setActiveTab] = useState("summary");
  const remarks = getEpiRemarks(record);
  const visitMonitoringItems = getVisitLevelMonitoringItems(record);
  const confirmedMonths = getConfirmedBreastfeedingMonths(breastfeedingMonitoring);
  const weight = visitMonitoringItems.find((item) => item.label === "Weight")?.value || "";
  const height = visitMonitoringItems.find((item) => item.label === "Height")?.value || "";
  const temperature =
    visitMonitoringItems.find((item) => item.label === "Temperature")?.value || "";
  const tabs = [
    {
      id: "summary",
      label: "Summary",
      content: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TabbedDetailItem label="Patient" value={patientName} />
          <TabbedDetailItem label="Service Type" value={serviceType} />
          <TabbedDetailItem
            label="Date and Time"
            value={[displayDate, displayTime].filter(Boolean).join(" / ")}
          />
          <TabbedDetailItem label="Practitioner" value={practitioner} />
          <TabbedDetailItem
            label="Vaccines Given Count"
            value={String(vaccineEntries.length)}
          />
          <TabbedDetailItem label="Weight" value={weight} />
          <TabbedDetailItem label="Height" value={height} />
          <TabbedDetailItem label="Temperature" value={temperature} />
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem
            label="Referral Status"
            value={linkedReferralTarget ? "Referred" : ""}
          />
        </div>
      ),
    },
    {
      id: "vaccines",
      label: "Vaccines Given",
      content:
        vaccineEntries.length > 0 ? (
          <EpiVaccinesTable entries={vaccineEntries} record={record} />
        ) : (
          <SectionEmptyState text="No vaccines were recorded during this visit." />
        ),
    },
    {
      id: "monitoring",
      label: "Visit Monitoring",
      content: (
        <div className="grid gap-4 md:grid-cols-3">
          <TabbedDetailItem label="Weight" value={weight} />
          <TabbedDetailItem label="Height" value={height} />
          <TabbedDetailItem label="Temperature" value={temperature} />
        </div>
      ),
    },
    {
      id: "breastfeeding",
      label: "Breastfeeding Monitoring",
      content:
        confirmedMonths.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {confirmedMonths.map((month) => (
              <span
                key={month}
                className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-[#B91C1C]"
              >
                {month}
              </span>
            ))}
          </div>
        ) : (
          <SectionEmptyState text="No breastfeeding monitoring recorded for this visit." />
        ),
    },
    {
      id: "remarks",
      label: "Remarks",
      content: remarks ? (
        <TabbedNarrativeBlock label="Remarks" value={remarks} />
      ) : (
        <SectionEmptyState text="No remarks recorded for this visit." />
      ),
    },
    {
      id: "medicines",
      label: "Medicines",
      content: <DispensedMedicinesList medicines={dispensedMedicines} />,
    },
    {
      id: "followup",
      label: "Follow-up & Referral",
      content: (
        <div className="grid gap-4 md:grid-cols-3">
          <TabbedDetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <TabbedDetailItem
            label="Needs RHU Referral"
            value={needsReferral ? "Yes" : "No"}
          />
          <TabbedDetailItem
            label="Referral Status"
            value={linkedReferralTarget ? "Referred" : ""}
          />
        </div>
      ),
    },
  ];

  return (
    <TabbedDetailsCard
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function EpiVaccinesTable({ entries, record }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[minmax(160px,1.35fr)_minmax(120px,0.95fr)_minmax(80px,0.7fr)_minmax(80px,0.7fr)_minmax(100px,0.8fr)_minmax(150px,1.1fr)] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:grid">
        <div className="px-3 py-2.5">Vaccine</div>
        <div className="px-3 py-2.5">Date Given</div>
        <div className="px-3 py-2.5">Weight</div>
        <div className="px-3 py-2.5">Height</div>
        <div className="px-3 py-2.5">Temperature</div>
        <div className="px-3 py-2.5">Remarks</div>
      </div>
      <div className="divide-y divide-slate-100">
        {entries.map((entry, index) => (
          <div
            key={`${entry.vaccineName || "vaccine"}-${entry.dateGiven || index}`}
            className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(160px,1.35fr)_minmax(120px,0.95fr)_minmax(80px,0.7fr)_minmax(80px,0.7fr)_minmax(100px,0.8fr)_minmax(150px,1.1fr)] md:items-center md:gap-0"
          >
            <EpiTableCell label="Vaccine" strong value={entry.vaccineName} />
            <EpiTableCell
              label="Date Given"
              value={formatLongDate(
                entry.dateGiven || getRecordDateValue(record),
                "Not recorded",
              )}
            />
            <EpiTableCell
              label="Weight"
              value={formatMeasurement(entry.weight || record.weight, "kg")}
            />
            <EpiTableCell
              label="Height"
              value={formatMeasurement(entry.height || record.height, "cm")}
            />
            <EpiTableCell
              label="Temperature"
              value={formatMeasurement(
                entry.temperature || record.temperature || record.temp,
                "°C",
              )}
            />
            <EpiTableCell label="Remarks" value={entry.remarks} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EpiTableCell({ label, value, strong = false }) {
  return (
    <div className="min-w-0 md:px-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:hidden">
        {label}
      </p>
      <p
        className={`truncate text-sm ${
          strong ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600"
        }`}
      >
        {formatDisplayValue(value, "\u2014")}
      </p>
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

function SectionEmptyState({ text }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
      <p className="text-xs text-slate-400">{text}</p>
    </div>
  );
}
