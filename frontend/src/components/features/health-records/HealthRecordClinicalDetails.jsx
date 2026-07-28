import {
  Activity,
  Baby,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  HeartHandshake,
  Salad,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import { Link } from "react-router";

import { RecordTabs } from "../../common";
import PatientDetailItem from "../patients/PatientDetailItem";
import { formatDisplayValue, formatLongDate } from "../../../utils/formatters";
import { FollowUpEpisodeContent } from "./FollowUpEpisodePanel";
import {
  formatHypertensionDiabeticClientStatus,
  formatHypertensionDiabeticCondition,
  getHypertensionDiabeticData,
  getServiceTypeLabel,
  isNcdRecord as isNcdProgramRecord,
  isMaternalRecord as isMaternalProgramRecord,
} from "../../../utils/healthRecordPrograms";
import {
  isImmunizationClassification,
  getEpiVaccineEntries,
  getEpiBreastfeedingMonitoring,
  getConfirmedBreastfeedingMonths,
  getEpiRemarks,
  getVisitLevelMonitoringItems,
  formatMeasurement,
  getFamilyPlanningDetails,
  normalizeHealthRecordStatus,
  getRecordValue,
  getMorbidityReportingStatus,
  formatMorbidityReportingStatus,
  getHfmdSurveillance,
  getMaternalData,
  getDispensedMedicines,
  getRecordDateValue,
  getRecordDiagnosis,
  getRecordChiefComplaint,
  getRecordSummary,
  getRecordNotes,
  getCompletedRecordMedicalNotes,
  getRecordTreatmentNotes,
  isDistinctRecordedValue,
  getRecordInitialActions,
  getVitalSignItems,
  getMaternalValue,
  getPreviousPregnancyHistory,
  getSelectedMaternalRiskLabels,
  getPreviousFpMethodValue,
  getLaboratoryResultItems,
  getRecordedTetanusToxoidDoses,
  getUltrasoundValue,
  getVitalField,
  getBloodPressureValue,
  formatDisplayTime,
  getRecordVisitTypeValue,
} from "./recordDetailsHelpers";

/* ─────────────────────────────────────────────
   HealthRecordClinicalDetails
   Renders the full clinical record — vital signs, program-specific data
   (Prenatal, EPI, Family Planning, NCD, TB, General Consultation), treatment,
   and follow-up — the same way pages/bhc/HealthRecordDetails.jsx does.
   Shared by the health record details page and both referral details pages.
──────────────────────────────────────────── */

export default function HealthRecordClinicalDetails({
  record,
  patient = {},
  linkedReferral = null,
}) {
  if (!record) return null;

  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Consultation",
  );
  const followUpDateValue = getRecordValue(record, ["followUpDate", "follow_up_date"], "");
  const followUpTimeValue = getRecordValue(
    record,
    ["followUpTime", "follow_up_time"],
    "",
  );
  const followUpReasonValue = getRecordValue(
    record,
    ["followUpReason", "follow_up_reason"],
    "",
  );
  const patientConditionValue = getRecordValue(record, [
    "patientCondition",
    "patient_condition",
  ], "");
  const monitoringNotesValue = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
  const needsRhuReferral =
    record.needs_referral === true ||
    record.needsReferral === true ||
    record.needsReferral === "yes";
  const isImmunizationRecord = isImmunizationClassification(record, patient);
  const epiVaccineEntries = getEpiVaccineEntries(record);
  const epiBreastfeedingMonitoring = getEpiBreastfeedingMonitoring(record);
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
      isMaternalProgramRecord(record));
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
  const linkedReferralTarget =
    linkedReferral?.trackingId ||
    linkedReferral?.id ||
    record.linkedTrackingId ||
    record.linked_tracking_id ||
    record.referralTrackingId ||
    record.referral_tracking_id ||
    "";

  if (isImmunizationRecord) {
    return (
      <EpiRecordDetails
        record={record}
        vaccineEntries={epiVaccineEntries}
        breastfeedingMonitoring={epiBreastfeedingMonitoring}
        dispensedMedicines={dispensedMedicines}
        followUpDate={followUpDateValue}
        needsReferral={needsRhuReferral}
        linkedReferralTarget={linkedReferralTarget}
      />
    );
  }

  if (isMaternalRecord) {
    return (
      <MaternalPrenatalRecordDetails
        record={record}
        dispensedMedicines={dispensedMedicines}
        followUpDate={followUpDateValue}
        needsReferral={needsRhuReferral}
        linkedReferral={linkedReferral}
      />
    );
  }

  if (isHypertensionDiabeticRecord) {
    return (
      <HypertensionDiabeticRecordDetails
        record={record}
        dispensedMedicines={dispensedMedicines}
        followUpDate={followUpDateValue}
        needsReferral={needsRhuReferral}
        linkedReferral={linkedReferral}
      />
    );
  }

  if (isFamilyPlanningRecord) {
    return (
      <FamilyPlanningRecordDetails
        record={record}
        details={familyPlanningDetails}
        dispensedMedicines={dispensedMedicines}
        followUpDate={followUpDateValue}
        needsReferral={needsRhuReferral}
        linkedReferral={linkedReferral}
      />
    );
  }

  if (isGeneralConsultationRecord) {
    return (
      <GeneralConsultationRecordDetails
        record={record}
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
        followUpTime={followUpTimeValue}
        followUpReason={followUpReasonValue}
        needsReferral={needsRhuReferral}
        linkedReferral={linkedReferral}
        patientCondition={patientConditionValue}
        monitoringNotes={monitoringNotesValue}
        status={status}
      />
    );
  }

  return (
    <GenericRecordDetails
      record={record}
      hasClinicalAssessmentDetails={hasClinicalAssessmentDetails}
      hasTreatmentDetails={hasTreatmentDetails}
      chiefComplaintValue={chiefComplaintValue}
      diagnosisValue={diagnosisValue}
      initialActionsValue={initialActionsValue}
      summaryValue={summaryValue}
      treatmentNotesValue={treatmentNotesValue}
      medicalNotesValue={medicalNotesValue}
      shouldShowMorbidityReporting={shouldShowMorbidityReporting}
      morbidityReportingStatus={morbidityReportingStatus}
      isGeneralConsultationRecord={isGeneralConsultationRecord}
      hfmdSurveillance={hfmdSurveillance}
      dispensedMedicines={dispensedMedicines}
      isFamilyPlanningRecord={isFamilyPlanningRecord}
      hasFamilyPlanningDetails={hasFamilyPlanningDetails}
      familyPlanningDetails={familyPlanningDetails}
      followUpDateValue={followUpDateValue}
      needsRhuReferral={needsRhuReferral}
      patientConditionValue={patientConditionValue}
      status={status}
      monitoringNotesValue={monitoringNotesValue}
    />
  );
}

/* ─────────────────────────────────────────────
   LOCAL HELPERS / PRESENTATIONAL PRIMITIVES
──────────────────────────────────────────── */

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

export function DispensedMedicinesList({ medicines }) {
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
              {formatDisplayValue(medicine.remarks, "—")}
            </p>
            <p className="text-slate-500">
              {formatLongDate(
                medicine.dateDispensed || medicine.created_at || medicine.createdAt,
                "—",
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
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

  const tabs = [
    {
      id: "monitoring",
      label: "Monitoring",
      icon: Activity,
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
      id: "management",
      label: "Management",
      icon: ClipboardList,
      content: (
        <div className="space-y-6">
          {data.treatmentActionTaken ? (
            <TabbedNarrativeBlock
              label="Treatment / Action Taken"
              value={data.treatmentActionTaken}
            />
          ) : (
            <SectionEmptyState text="No treatment or action taken recorded." />
          )}
          <TabbedSubsection title="Medicines Dispensed">
            <DispensedMedicinesList medicines={dispensedMedicines} />
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "followup",
      label: "Follow-up",
      icon: CalendarClock,
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
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="monitoring"
    />
  );
}

function GenericRecordDetails({
  record,
  hasClinicalAssessmentDetails,
  hasTreatmentDetails,
  chiefComplaintValue,
  diagnosisValue,
  initialActionsValue,
  summaryValue,
  treatmentNotesValue,
  medicalNotesValue,
  shouldShowMorbidityReporting,
  morbidityReportingStatus,
  isGeneralConsultationRecord,
  hfmdSurveillance,
  dispensedMedicines,
  isFamilyPlanningRecord,
  hasFamilyPlanningDetails,
  familyPlanningDetails,
  followUpDateValue,
  needsRhuReferral,
  patientConditionValue,
  status,
  monitoringNotesValue,
}) {
  const tabs = [
    {
      id: "record",
      label: "Record Details",
      icon: Stethoscope,
      content: hasClinicalAssessmentDetails ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PatientDetailItem
              label="Chief Complaint"
              value={chiefComplaintValue || "Not recorded"}
            />
            <PatientDetailItem
              label="Diagnosis / Assessment"
              value={diagnosisValue || "Not recorded"}
            />
          </div>
          {summaryValue && (
            <NarrativeBox label="Signs & Symptoms" value={summaryValue} />
          )}
        </div>
      ) : (
        <SectionEmptyState text="No consultation details recorded." />
      ),
    },
  ];

  const careContent = [];

  careContent.push(
    hasTreatmentDetails ? (
      <div key="treatment" className="space-y-4">
        <PatientDetailItem
          label="Treatment / Action Taken"
          value={initialActionsValue || "Not recorded"}
        />
        {isDistinctRecordedValue(treatmentNotesValue, initialActionsValue) && (
          <NarrativeBox label="Treatment Notes" value={treatmentNotesValue} />
        )}
        {isDistinctRecordedValue(
          medicalNotesValue,
          initialActionsValue,
          treatmentNotesValue,
        ) && <NarrativeBox label="Medical Notes" value={medicalNotesValue} />}
      </div>
    ) : (
      <SectionEmptyState
        key="treatment"
        text="No treatment details recorded."
      />
    ),
  );

  careContent.push(
    <div key="medicines">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Medicines / Supplies Dispensed
      </p>
      <DispensedMedicinesList medicines={dispensedMedicines} />
    </div>,
  );

  if (shouldShowMorbidityReporting) {
    careContent.push(
      <div key="morbidity">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Morbidity / Notifiable Disease Record
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <PatientDetailItem
            label="Reporting Status"
            value={formatMorbidityReportingStatus(morbidityReportingStatus)}
          />
        </div>
      </div>,
    );
  }

  if (isGeneralConsultationRecord) {
    careContent.push(
      <div key="surveillance">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Community-Based Surveillance
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <PatientDetailItem
            label="HFMD Surveillance"
            value={hfmdSurveillance ? "Yes" : "No"}
          />
        </div>
      </div>,
    );
  }

  if (isFamilyPlanningRecord) {
    careContent.push(
      <div key="familyPlanning">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Family Planning Details
        </p>
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
      </div>,
    );
  }

  tabs.push({
    id: "care",
    label: "Care",
    icon: ClipboardList,
    content: <div className="space-y-6">{careContent}</div>,
  });

  tabs.push({
    id: "followup",
    label: "Follow-up",
    icon: CalendarClock,
    content: (
      <div>
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
          {(patientConditionValue || status === "Follow-up Required") && (
            <PatientDetailItem
              label="Patient Condition"
              value={patientConditionValue}
            />
          )}
        </div>
        {monitoringNotesValue && (
          <NarrativeBox label="Monitoring Notes" value={monitoringNotesValue} />
        )}
      </div>
    ),
  });

  return (
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="record"
    />
  );
}

function GeneralConsultationRecordDetails({
  record,
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
  followUpTime,
  followUpReason,
  needsReferral,
  linkedReferral,
  patientCondition,
  monitoringNotes,
  status,
}) {
  const referralStatus =
    linkedReferral?.status || linkedReferral?.referralStatus || "";
  const isFollowUpVisit =
    getRecordVisitTypeValue(record) === "follow_up_visit";
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
      id: "consultation",
      label: "Clinical Details",
      icon: Stethoscope,
      content: (
        <div className="space-y-6">
          <TabbedSubsection title="Vital Signs">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {vitalItems.map((item) => (
                <TabbedDetailItem
                  key={item.label}
                  label={item.label}
                  value={item.value}
                />
              ))}
              <TabbedDetailItem label="Record Status" value={status} />
              {isFollowUpVisit && (
                <TabbedDetailItem
                  label="Current Condition"
                  value={patientCondition}
                />
              )}
            </div>
          </TabbedSubsection>
          {hasConsultationDetails ? (
            <div className="space-y-4">
              <TabbedNarrativeBlock label="Chief Complaint" value={chiefComplaint} />
              <TabbedNarrativeBlock
                label={
                  isFollowUpVisit
                    ? "Follow-up Findings / Changes Since Previous Visit"
                    : "Signs & Symptoms / Summary of Present Illness"
                }
                value={signsSymptoms}
              />
              <TabbedNarrativeBlock label="Diagnosis / Assessment" value={diagnosis} />
            </div>
          ) : (
            <SectionEmptyState text="No consultation details recorded." />
          )}
        </div>
      ),
    },
    {
      id: "careReporting",
      label: "Treatment & Supplies",
      icon: ClipboardCheck,
      content: (
        <div className="space-y-6">
          <div className="space-y-4">
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
              <TabbedNarrativeBlock
                label={isFollowUpVisit ? "Follow-up Notes" : "Medical Notes"}
                value={medicalNotes}
              />
            )}
          </div>
          <TabbedSubsection title="Medicines / Supplies Dispensed">
            <DispensedMedicinesList medicines={dispensedMedicines} />
          </TabbedSubsection>
          {!isFollowUpVisit && shouldShowReporting && (
            <TabbedSubsection title="Reporting Decision">
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
            </TabbedSubsection>
          )}
        </div>
      ),
    },
    {
      id: "followup",
      label: "Follow-up History",
      icon: CalendarClock,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <TabbedDetailItem
              label="Next Follow-up Date"
              value={formatLongDate(followUpDate, "Not recorded")}
            />
            <TabbedDetailItem
              label="Next Follow-up Time"
              value={formatDisplayTime(followUpTime, "Not recorded")}
            />
          </div>
          <TabbedNarrativeBlock
            label="Follow-up Reason"
            value={followUpReason}
          />
          {monitoringNotes && (
            <TabbedNarrativeBlock
              label="Monitoring Notes"
              value={monitoringNotes}
            />
          )}
          <div className="border-t border-slate-200 pt-6">
            <FollowUpEpisodeContent
              episode={record.followUpEpisode}
              currentRecord={record}
              showVisitChain={false}
            />
          </div>
        </div>
      ),
    },
  ];

  if (needsReferral || linkedReferral) {
    const referralTarget =
      linkedReferral?.trackingId ||
      linkedReferral?.tracking_id ||
      linkedReferral?.id ||
      "";

    tabs.push({
      id: "referral",
      label: "Referral",
      icon: HeartHandshake,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TabbedDetailItem
              label="Referral Required"
              value={needsReferral ? "Yes" : "No"}
            />
            <TabbedDetailItem
              label="Referral Status"
              value={referralStatus}
            />
            <TabbedDetailItem
              label="Urgency"
              value={
                linkedReferral?.urgencyLevel ||
                linkedReferral?.urgency_level
              }
            />
            <TabbedDetailItem
              label="Receiving Facility"
              value={
                linkedReferral?.receivingFacility ||
                linkedReferral?.ruralHealthUnit?.name ||
                linkedReferral?.rural_health_unit?.name
              }
            />
          </div>
          <TabbedNarrativeBlock
            label="Reason for Referral"
            value={
              linkedReferral?.reasonForReferral ||
              linkedReferral?.reason_for_referral
            }
          />
          {referralTarget && (
            <Link
              to={`/bhc/referrals/${referralTarget}`}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
            >
              <ClipboardList size={14} />
              View Referral Details
            </Link>
          )}
        </div>
      ),
    });
  }

  return (
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="consultation"
    />
  );
}

function FamilyPlanningRecordDetails({
  record,
  details = [],
  dispensedMedicines = [],
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const getDetailValue = (label) =>
    details.find((item) => item.label === label)?.value || "";
  const referralStatus =
    linkedReferral?.status ||
    record.referralStatus ||
    record.referral_status ||
    "";
  const concern = getDetailValue("Concern / Complaint");
  const findings = getDetailValue("Findings / Notes");
  const advice = getDetailValue("Advice Given");
  const actionTaken = getDetailValue("Action Taken");
  const remarks = getDetailValue("Remarks / Notes");
  const nextAppointmentDate = getDetailValue("Next Appointment Date");
  const clientRecordLabels = [
    "Client Type",
    "Method Used / Accepted",
    "Previous Method",
    "FP Visit Category",
    "Source",
    "Date Registered",
    "Date of Visit",
  ];
  const clientRecordDetails = details.filter((item) =>
    clientRecordLabels.includes(item.label),
  );
  const hasClientRecordDetails = clientRecordDetails.some((item) => item.value);

  const tabs = [
    {
      id: "client",
      label: "Client Record",
      icon: Users,
      content: hasClientRecordDetails ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clientRecordDetails.map((item) => (
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
      id: "clinicalCare",
      label: "Clinical Care",
      icon: HeartHandshake,
      content: (
        <div className="space-y-6">
          {concern || findings || advice || actionTaken || remarks ? (
            <div className="space-y-4">
              <TabbedNarrativeBlock label="Concern / Complaint" value={concern} />
              <TabbedNarrativeBlock label="Findings / Notes" value={findings} />
              <TabbedNarrativeBlock label="Advice Given" value={advice} />
              <TabbedNarrativeBlock label="Action Taken" value={actionTaken} />
              <TabbedNarrativeBlock label="Remarks" value={remarks} />
            </div>
          ) : (
            <SectionEmptyState text="No clinical concern recorded." />
          )}
          <TabbedSubsection title="Medicines / Supplies">
            <DispensedMedicinesList medicines={dispensedMedicines} />
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "followup",
      label: "Follow-up",
      icon: CalendarClock,
      content: (
        <div className="grid gap-4 md:grid-cols-3">
          <TabbedDetailItem
            label="Next Appointment Date"
            value={nextAppointmentDate}
          />
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
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="client"
    />
  );
}

function MaternalPrenatalRecordDetails({
  record,
  dispensedMedicines,
  followUpDate,
  needsReferral,
  linkedReferral,
}) {
  const EMPTY_VALUE = "Not recorded";
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
  const temperature =
    vitalItems.find((item) => item.label === "Temperature")?.value || "";
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
      id: "prenatal",
      label: "Prenatal Record",
      icon: Baby,
      content: (
        <div className="space-y-6">
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
          <TabbedSubsection title="Maternal Vital Signs">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TabbedDetailItem label="Blood Pressure" value={bp} />
              <TabbedDetailItem label="Weight" value={weight} />
              <TabbedDetailItem label="Height / HGT" value={height} />
              <TabbedDetailItem label="BMI" value={bmi} />
              <TabbedDetailItem label="Temperature" value={temperature} />
            </div>
          </TabbedSubsection>
          <TabbedSubsection title="Complaint">
            <div className="space-y-4">
              <TabbedNarrativeBlock
                label="Chief Complaint"
                value={chiefComplaint}
              />
              {notesFindings && (
                <TabbedNarrativeBlock
                  label="Findings / Notes"
                  value={notesFindings}
                />
              )}
            </div>
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "historyTests",
      label: "History & Tests",
      icon: FlaskConical,
      content: (
        <div className="space-y-6">
          <TabbedSubsection title="Pregnancy History">
            <PreviousPregnancyHistoryTable rows={previousPregnancyHistory} />
          </TabbedSubsection>
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
          <TabbedSubsection title="Ultrasound">
            {ultrasoundResult || ultrasoundDate || ultrasoundRemarks ? (
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
            )}
          </TabbedSubsection>
          <TabbedSubsection title="TT / Td Recorded This Visit">
            {recordedTetanusDoses.length > 0 ? (
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
            ) : (
              <SectionEmptyState text="No tetanus toxoid / Td dose was recorded for this visit." />
            )}
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "careFollowup",
      label: "Care & Follow-up",
      icon: CalendarClock,
      content: (
        <div className="space-y-6">
          <TabbedNarrativeBlock
            label="Treatment / Advice Given"
            value={treatment}
          />
          <TabbedSubsection title="Medicines Dispensed">
            <DispensedMedicinesList medicines={dispensedMedicines} />
          </TabbedSubsection>
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
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="prenatal"
    />
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
    text === "—"
  ) {
    return "Not recorded";
  }
  return text;
}

function EpiRecordDetails({
  record,
  vaccineEntries = [],
  breastfeedingMonitoring = {},
  dispensedMedicines = [],
  followUpDate,
  needsReferral,
  linkedReferralTarget,
}) {
  const remarks = getEpiRemarks(record);
  const visitMonitoringItems = getVisitLevelMonitoringItems(record);
  const confirmedMonths = getConfirmedBreastfeedingMonths(breastfeedingMonitoring);
  const weight = visitMonitoringItems.find((item) => item.label === "Weight")?.value || "";
  const height = visitMonitoringItems.find((item) => item.label === "Height")?.value || "";
  const temperature =
    visitMonitoringItems.find((item) => item.label === "Temperature")?.value || "";
  const tabs = [
    {
      id: "immunization",
      label: "Immunization",
      icon: Syringe,
      content:
        vaccineEntries.length > 0 ? (
          <EpiVaccinesTable entries={vaccineEntries} record={record} />
        ) : (
          <SectionEmptyState text="No vaccines were recorded during this visit." />
        ),
    },
    {
      id: "growthFeeding",
      label: "Growth & Feeding",
      icon: Salad,
      content: (
        <div className="space-y-6">
          <TabbedSubsection title="Visit Monitoring">
            <div className="grid gap-4 md:grid-cols-3">
              <TabbedDetailItem label="Weight" value={weight} />
              <TabbedDetailItem label="Height" value={height} />
              <TabbedDetailItem label="Temperature" value={temperature} />
            </div>
          </TabbedSubsection>
          <TabbedSubsection title="Breastfeeding Monitoring">
            {confirmedMonths.length > 0 ? (
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
            )}
          </TabbedSubsection>
          <TabbedSubsection title="Remarks">
            {remarks ? (
              <TabbedNarrativeBlock label="Remarks" value={remarks} />
            ) : (
              <SectionEmptyState text="No remarks recorded for this visit." />
            )}
          </TabbedSubsection>
        </div>
      ),
    },
    {
      id: "careFollowup",
      label: "Care & Follow-up",
      icon: CalendarClock,
      content: (
        <div className="space-y-6">
          <TabbedSubsection title="Medicines / Supplies Dispensed">
            <DispensedMedicinesList medicines={dispensedMedicines} />
          </TabbedSubsection>
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
        </div>
      ),
    },
  ];

  return (
    <RecordTabs
      key={record?.id || record?._id}
      tabs={tabs}
      defaultTabId="immunization"
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
        {formatDisplayValue(value, "—")}
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
