import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "../../ui/button";
import { RefreshingIndicator, ReferralIndicatorBadge } from "../../common";
import RecordOutcomeBadge from "../records/RecordOutcomeBadge";
import { ProfileSection } from "../patients/profile/ProfileSection";
import { FollowUpEpisodeContent } from "./FollowUpEpisodePanel";
import TbTreatmentCardForm, { normalizeTbData } from "./TbTreatmentCardForm";
import {
  PROGRAM_CLASSIFICATIONS,
  getConsultationPrograms,
} from "../../../utils/consultationPrograms";
import {
  VISIT_SERVICES,
  TEENAGE_PREGNANCY_MESSAGE,
} from "../../../utils/visitPurpose";
import {
  formatRecordReporting,
  getMorbidityReportingStatus,
} from "../../../utils/diagnosisReporting";
import { getSurveillanceDiagnoses } from "../../../utils/surveillance";
import {
  diagnosisCarePlanHeading,
  diagnosisCarePlanItems,
} from "../../../utils/recordCarePlan";
import {
  earlierDraftContinuedNotes,
  earlierDraftNotes,
  isBhcGeneralV2,
  showsDiagnosisRow,
} from "../../../utils/consultationWorkflow";
import { recordReportingLines } from "../../../utils/reportingEntries";
import { isTbRecord } from "../../../utils/tbRecords";
import {
  formatDisplayValue,
  formatLongDate,
} from "../../../utils/formatters";
import {
  isImmunizationClassification,
  getEpiVaccineEntries,
  getEpiBreastfeedingMonitoring,
  getConfirmedBreastfeedingMonths,
  getEpiRemarks,
  formatMeasurement,
  getFamilyPlanningDetails,
  normalizeHealthRecordStatus,
  getRecordValue,
  getMaternalData,
  getDispensedMedicines,
  getRecordDateValue,
  getRecordDiagnosis,
  getRecordPhysicalExam,
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
  getRecordVisitTypeValue,
} from "./recordDetailsHelpers";
import { cn } from "../../../lib/utils";

function textValue(value, empty = "Not recorded") {
  const text = String(value ?? "").trim();
  if (
    !text ||
    text.toLowerCase() === "not recorded" ||
    text.toLowerCase() === "no follow-up date recorded." ||
    text === "—"
  ) {
    return empty;
  }
  return text;
}

function Fact({ label, value }) {
  const display = textValue(value);
  const empty = display === "Not recorded";
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm font-medium",
          empty ? "text-neutral-500" : "text-neutral-900",
        )}
      >
        {display}
      </dd>
    </div>
  );
}

function FactGrid({ items = [], columns = 3 }) {
  if (!items.length) return null;
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {items.map((item) => (
        <Fact key={item.label} label={item.label} value={item.value} />
      ))}
    </dl>
  );
}

function Narrative({ label, value }) {
  const display = textValue(value);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 max-w-[75ch] whitespace-pre-wrap text-sm leading-relaxed",
          display === "Not recorded" ? "text-neutral-500" : "text-neutral-800",
        )}
      >
        {display}
      </p>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

function LedgerTable({ columns, rows }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto border border-neutral-200">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="h-11 bg-neutral-100">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="px-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="h-14 border-t border-neutral-200">
              {row.cells.map((cell, index) => (
                <td
                  key={`${row.key}-${index}`}
                  className={cn(
                    "px-3 text-neutral-800",
                    index === 0 ? "font-medium text-neutral-900" : "",
                  )}
                >
                  {cell || <span className="text-neutral-500">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-neutral-200 bg-neutral-50 text-neutral-600",
    info: "border-info-100 bg-info-50 text-info-700",
    warning: "border-warning-100 bg-warning-50 text-warning-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        tones[tone] || tones.neutral,
      )}
    >
      {children}
    </span>
  );
}

export default function BhcHealthRecordWorkspace({
  record,
  patient,
  linkedReferral = null,
  title,
  recordId,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  isFollowUpVisit = false,
  parentRecordId = "",
  nextActionLabel = "",
  hasLinkedReferral = false,
  referralStatus,
  isUpdating = false,
  outcomeRecord = null,
  onBack,
  onPrint,
}) {
  if (!record) return null;

  const purpose =
    record?.monitoringData?.visitPurpose ||
    record?.monitoring_data?.visitPurpose;
  const programs = getConsultationPrograms(record);
  const categories = [
    ...new Set(programs.map((key) => PROGRAM_CLASSIFICATIONS[key])),
  ];
  const postpartumOnly =
    Boolean(purpose?.services?.includes("Postpartum")) &&
    !purpose?.services?.includes("Prenatal");
  const tbRecord = isTbRecord(record);
  const immunization = isImmunizationClassification(record, patient);
  const maternal =
    serviceType === "Maternal / Prenatal" ||
    categories.includes("Maternal") ||
    programs.includes("Maternal");
  const familyPlanning =
    serviceType === "Family Planning" ||
    categories.includes("Family Planning") ||
    programs.includes("Family Planning");
  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Consultation",
  );
  const vitalItems = getVitalSignItems(record);
  const isFollowUp = getRecordVisitTypeValue(record) === "follow_up_visit";
  const chiefComplaint = getRecordChiefComplaint(record, "");
  const diagnosis = getRecordDiagnosis(record, "");
  const physicalExam = getRecordPhysicalExam(record, "");
  const summary = getRecordSummary(record, "");
  const monitoringNotes = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
  const medicalNotes =
    status === "Completed"
      ? getCompletedRecordMedicalNotes(record, monitoringNotes, "")
      : getRecordNotes(record, "");
  const treatmentAction = getRecordInitialActions(record, "");
  const treatmentNotes = getRecordTreatmentNotes(record, "");
  const patientCondition = getRecordValue(
    record,
    ["patientCondition", "patient_condition"],
    "",
  );
  const followUpDate = getRecordValue(
    record,
    ["followUpDate", "follow_up_date"],
    "",
  );
  const followUpReason = getRecordValue(record, ["followUpReason"], "");
  const needsReferral =
    record.needs_referral === true ||
    record.needsReferral === true ||
    record.needsReferral === "yes";
  const medicines = getDispensedMedicines(record);
  const morbidityStatus = getMorbidityReportingStatus(record);
  const reportingSummary = formatRecordReporting(record);
  const surveillanceSummary = getSurveillanceDiagnoses(record)
    .map(({ name }) => name)
    .join(", ");
  const showReporting =
    serviceType === "General Consultation" ||
    morbidityStatus === "morbidity" ||
    morbidityStatus === "notifiable";
  const reportingLines = isBhcGeneralV2(record)
    ? recordReportingLines(record)
    : [];
  const carePlanItems = diagnosisCarePlanItems(record?.diagnoses);
  const draftNotes = earlierDraftNotes(record);
  const continuedNotes = earlierDraftContinuedNotes(record);
  const fpDetails = getFamilyPlanningDetails(record);
  const maternalData = getMaternalData(record);

  return (
    <div className="space-y-4">
      <VisitHeader
        title={title}
        recordId={recordId}
        patientName={patientName}
        serviceType={serviceType}
        displayDate={displayDate}
        displayTime={displayTime}
        practitioner={practitioner}
        isFollowUpVisit={isFollowUpVisit}
        parentRecordId={parentRecordId}
        nextActionLabel={nextActionLabel}
        hasLinkedReferral={hasLinkedReferral}
        referralStatus={referralStatus}
        isUpdating={isUpdating}
        outcomeRecord={outcomeRecord}
        onBack={onBack}
        onPrint={onPrint}
      />

      {purpose && <PurposeSection purpose={purpose} />}

      <ProfileSection id="vital-signs" title="Vital signs">
        <FactGrid
          items={[
            ...vitalItems.map((item) => ({
              label: item.label,
              value: item.value,
            })),
            { label: "Record status", value: status },
            ...(isFollowUp
              ? [{ label: "Current condition", value: patientCondition }]
              : []),
          ]}
        />
      </ProfileSection>

      {!tbRecord && (
        <ProfileSection id="clinical-assessment" title="Clinical assessment">
          <div className="space-y-5">
            <Narrative label="Chief complaint" value={chiefComplaint} />
            <Narrative
              label={
                isFollowUp
                  ? "Follow-up findings / changes since previous visit"
                  : "Signs & symptoms / summary of present illness"
              }
              value={summary}
            />
            <Narrative label="Physical exam" value={physicalExam} />
            {showsDiagnosisRow(record, diagnosis) && (
              <Narrative label="Diagnosis / assessment" value={diagnosis} />
            )}
          </div>
        </ProfileSection>
      )}

      {immunization && (
        <EpiProgramSection record={record} />
      )}
      {(maternal || postpartumOnly) && (
        <MaternalProgramSection
          record={record}
          maternal={maternalData}
          postpartumOnly={postpartumOnly}
        />
      )}
      {familyPlanning && (
        <FamilyPlanningProgramSection details={fpDetails} />
      )}
      {tbRecord && (
        <ProfileSection id="tb-program" title="TB DOTS / TB monitoring">
          <TbTreatmentCardForm
            value={normalizeTbData(record.tbData || record.tb_data)}
            readOnly
            recordId={record.id}
          />
        </ProfileSection>
      )}

      {!tbRecord && (
        <ProfileSection id="treatment" title="Treatment">
          <div className="space-y-5">
            <Narrative
              label="Treatment / action taken"
              value={
                getMaternalValue(maternalData, record, ["treatment"], "") ||
                treatmentAction
              }
            />
            {isDistinctRecordedValue(
              treatmentNotes,
              treatmentAction,
              getMaternalValue(maternalData, record, ["treatment"], ""),
            ) && <Narrative label="Treatment notes" value={treatmentNotes} />}
            {isFollowUp &&
              isDistinctRecordedValue(
                medicalNotes,
                treatmentAction,
                treatmentNotes,
              ) && <Narrative label="Follow-up notes" value={medicalNotes} />}
            {!isFollowUp &&
              isDistinctRecordedValue(
                medicalNotes,
                treatmentAction,
                treatmentNotes,
                summary,
              ) && <Narrative label="Medical notes" value={medicalNotes} />}
            {familyPlanning && (
              <>
                <Narrative
                  label="Advice given"
                  value={fpDetail(fpDetails, "Advice Given")}
                />
                <Narrative
                  label="Action taken"
                  value={fpDetail(fpDetails, "Action Taken")}
                />
                <Narrative
                  label="Remarks"
                  value={fpDetail(fpDetails, "Remarks / Notes")}
                />
              </>
            )}
          </div>
        </ProfileSection>
      )}

      <ProfileSection id="medicines" title="Dispensed medicines">
        <MedicinesTable medicines={medicines} />
      </ProfileSection>

      {(showReporting ||
        reportingLines.length > 0 ||
        carePlanItems.length > 0 ||
        draftNotes ||
        continuedNotes) && (
        <ProfileSection id="reporting" title="Reporting">
          <div className="space-y-5">
            {reportingLines.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {reportingLines.map((line) => (
                  <li key={line.key} className="py-2 text-sm text-neutral-900">
                    {line.text}
                  </li>
                ))}
              </ul>
            )}
            {showReporting && (
              <FactGrid
                columns={2}
                items={[
                  {
                    label: "Morbidity / notifiable reports",
                    value: reportingSummary,
                  },
                  {
                    label: "Included in surveillance",
                    value: surveillanceSummary || "No",
                  },
                ]}
              />
            )}
            {carePlanItems.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  {diagnosisCarePlanHeading(record?.diagnoses)}
                </p>
                <ul className="divide-y divide-neutral-100">
                  {carePlanItems.map((item) => (
                    <li
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
                    >
                      <span className="font-medium text-neutral-900">
                        {item.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-neutral-600">
                        {item.plan}
                        {item.inSurveillance && (
                          <StatusPill tone="warning">In surveillance</StatusPill>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draftNotes && (
              <Narrative label="Earlier draft notes" value={draftNotes} />
            )}
            {continuedNotes && (
              <Narrative
                label="Earlier draft notes (continued)"
                value={continuedNotes}
              />
            )}
          </div>
        </ProfileSection>
      )}

      <FollowUpReferralSection
        record={record}
        linkedReferral={linkedReferral}
        followUpDate={followUpDate}
        followUpReason={followUpReason}
        needsReferral={needsReferral}
        patientCondition={patientCondition}
        monitoringNotes={monitoringNotes}
        status={status}
        parentRecordId={parentRecordId}
        nextAppointmentDate={fpDetail(fpDetails, "Next Appointment Date")}
        maternalReferralReason={
          linkedReferral?.reasonForReferral ||
          linkedReferral?.reason_for_referral ||
          record.referralReason ||
          record.referral_reason ||
          ""
        }
      />
    </div>
  );
}

function VisitHeader({
  title,
  recordId,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  isFollowUpVisit,
  parentRecordId,
  nextActionLabel,
  hasLinkedReferral,
  referralStatus,
  isUpdating,
  outcomeRecord,
  onBack,
  onPrint,
}) {
  return (
    <section className="rounded-card border border-neutral-200/80 bg-white p-5 shadow-card">
      <Button type="button" variant="secondary" size="sm" onClick={onBack} className="h-9">
        <ArrowLeft size={15} />
        Back
      </Button>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              {title}
            </h1>
            {hasLinkedReferral && (
              <ReferralIndicatorBadge hasReferral status={referralStatus} />
            )}
            {isFollowUpVisit && (
              <StatusPill tone="info">Follow-up visit</StatusPill>
            )}
            {outcomeRecord && <RecordOutcomeBadge record={outcomeRecord} />}
            {isUpdating && (
              <RefreshingIndicator label="Updating health record details..." />
            )}
          </div>
          <p className="mt-2 text-[13px] font-medium tabular-nums text-neutral-600">
            Record #{recordId}
          </p>
          {isFollowUpVisit && parentRecordId && (
            <p className="mt-1 text-[12px] text-neutral-500">
              Follow-up of record #{parentRecordId}
            </p>
          )}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={onPrint} className="h-9">
          <Printer size={14} />
          Print
        </Button>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-neutral-200 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Patient full name" value={patientName} />
        <Fact label="Service type" value={serviceType} />
        <Fact label="Date of visit" value={displayDate} />
        <Fact label="Time of visit" value={displayTime} />
        <Fact label="Name of practitioner" value={practitioner} />
        <Fact label="Next action" value={nextActionLabel} />
      </dl>
    </section>
  );
}

function PurposeSection({ purpose }) {
  return (
    <ProfileSection id="visit-purpose" title="Purpose of visit">
      <p className="text-sm text-neutral-900">
        {(purpose.services || [])
          .map((key) => VISIT_SERVICES[key] || key)
          .join(" + ")}
      </p>
      {purpose.overrideReason && (
        <p className="mt-3 text-sm text-neutral-700">
          BHC age eligibility override: {purpose.overrideReason}
        </p>
      )}
      {purpose.pregnancyConfirmed && (
        <p className="mt-3 text-sm text-neutral-700">
          Pregnancy confirmed by BHW? {purpose.pregnancyConfirmed}
        </p>
      )}
      {purpose.pregnancyConfirmed === "Yes" && (
        <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">
          {TEENAGE_PREGNANCY_MESSAGE}
        </p>
      )}
    </ProfileSection>
  );
}

function EpiProgramSection({ record }) {
  const vaccineEntries = getEpiVaccineEntries(record);
  const breastfeeding = getConfirmedBreastfeedingMonths(
    getEpiBreastfeedingMonitoring(record),
  );
  const remarks = getEpiRemarks(record);

  return (
    <ProfileSection id="epi-program" title="Child Health / EPI">
      <div className="space-y-6">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Immunization
          </p>
          {vaccineEntries.length > 0 ? (
            <LedgerTable
              columns={[
                "Vaccine",
                "Date given",
                "Weight",
                "Height",
                "Temperature",
                "Remarks",
              ]}
              rows={vaccineEntries.map((entry, index) => ({
                key: `${entry.vaccineName}-${entry.dateGiven || index}`,
                cells: [
                  entry.vaccineName,
                  formatLongDate(
                    entry.dateGiven || getRecordDateValue(record),
                    "Not recorded",
                  ),
                  formatMeasurement(entry.weight || record.weight, "kg"),
                  formatMeasurement(entry.height || record.height, "cm"),
                  formatMeasurement(
                    entry.temperature || record.temperature || record.temp,
                    "°C",
                  ),
                  entry.remarks,
                ],
              }))}
            />
          ) : (
            <EmptyNote>No vaccines were recorded during this visit.</EmptyNote>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Breastfeeding monitoring
          </p>
          {breastfeeding.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {breastfeeding.map((month) => (
                <StatusPill key={month}>{month}</StatusPill>
              ))}
            </div>
          ) : (
            <EmptyNote>
              No breastfeeding monitoring recorded for this visit.
            </EmptyNote>
          )}
          {remarks && (
            <div className="mt-4">
              <Narrative label="Remarks" value={remarks} />
            </div>
          )}
        </div>
      </div>
    </ProfileSection>
  );
}

function MaternalProgramSection({ record, maternal, postpartumOnly }) {
  const EMPTY = "Not recorded";
  const term = getMaternalValue(maternal, record, ["term"], "");
  const preterm = getMaternalValue(maternal, record, ["preterm"], "");
  const abortion = getMaternalValue(maternal, record, ["abortion"], "");
  const living = getMaternalValue(maternal, record, ["living"], "");
  const tpal =
    getMaternalValue(maternal, record, ["tpal", "obScore", "ob_score"], "") ||
    ([term, preterm, abortion, living].some((value) => value !== "")
      ? [term || 0, preterm || 0, abortion || 0, living || 0].join("-")
      : "");
  const history = getPreviousPregnancyHistory(maternal);
  const riskLabels = getSelectedMaternalRiskLabels(maternal);
  const tetanus = getRecordedTetanusToxoidDoses(maternal, record);
  const previousFp = getPreviousFpMethodValue(maternal);
  const labs = getLaboratoryResultItems(maternal);
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
  const notesFindings = [getRecordNotes(record, "")]
    .filter((value) =>
      isDistinctRecordedValue(value, getRecordSummary(record, ""), getRecordChiefComplaint(record, "")),
    )
    .join("\n\n");

  return (
    <ProfileSection
      id="maternal-program"
      title={postpartumOnly ? "Postpartum record" : "Maternal / Prenatal"}
    >
      <div className="space-y-6">
        {postpartumOnly && (
          <FactGrid
            columns={2}
            items={[
              { label: "Pulse", value: record.pulse },
              { label: "SpO₂", value: record.spo2 },
            ]}
          />
        )}
        <FactGrid
          items={[
            {
              label: "LMP",
              value: formatLongDate(
                getMaternalValue(maternal, record, ["lmp"], ""),
                EMPTY,
              ),
            },
            {
              label: "PMP",
              value: formatLongDate(
                getMaternalValue(maternal, record, ["pmp"], ""),
                EMPTY,
              ),
            },
            {
              label: "Expected delivery date / EDC",
              value: formatLongDate(
                getMaternalValue(
                  maternal,
                  record,
                  ["expectedDeliveryDate", "expected_delivery_date", "edc", "edd"],
                  "",
                ),
                EMPTY,
              ),
            },
            {
              label: "AOG",
              value: getMaternalValue(
                maternal,
                record,
                ["aog", "ageOfGestation", "age_of_gestation"],
                "",
              ),
            },
            {
              label: "Gravida",
              value: getMaternalValue(maternal, record, ["gravida"], ""),
            },
            {
              label: "Para",
              value: getMaternalValue(maternal, record, ["para"], ""),
            },
            { label: "Term", value: term },
            { label: "Preterm", value: preterm },
            { label: "Abortion", value: abortion },
            { label: "Living", value: living },
            { label: "OB score / TPAL", value: tpal },
            { label: "Previous FP method used", value: previousFp },
          ]}
        />
        {notesFindings && (
          <Narrative label="Findings / notes" value={notesFindings} />
        )}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Pregnancy history
          </p>
          {history.length > 0 ? (
            <LedgerTable
              columns={["Pregnancy no.", "Place of delivery", "Year", "Notes"]}
              rows={history.map((row, index) => ({
                key: `${row.pregnancyNo || row.pregnancy_no || "pregnancy"}-${index}`,
                cells: [
                  row.pregnancyNo || row.pregnancy_no,
                  row.placeOfDelivery || row.place_of_delivery,
                  row.year,
                  row.notes,
                ],
              }))}
            />
          ) : (
            <EmptyNote>No previous pregnancy history recorded.</EmptyNote>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Medical history / risk codes
          </p>
          {riskLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {riskLabels.map((label) => (
                <StatusPill key={label} tone="warning">
                  {label}
                </StatusPill>
              ))}
            </div>
          ) : (
            <EmptyNote>No risk codes recorded.</EmptyNote>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Laboratory results
          </p>
          {labs.some((item) => item.value) ? (
            <FactGrid
              items={labs.map((item) => ({
                label: item.label,
                value: item.value || EMPTY,
              }))}
            />
          ) : (
            <EmptyNote>No laboratory results recorded.</EmptyNote>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Ultrasound
          </p>
          {ultrasoundResult || ultrasoundDate || ultrasoundRemarks ? (
            <div className="space-y-4">
              <FactGrid
                columns={2}
                items={[
                  {
                    label: "Date done",
                    value: formatLongDate(ultrasoundDate, EMPTY),
                  },
                ]}
              />
              <Narrative
                label="Ultrasound result / findings"
                value={ultrasoundResult}
              />
              <Narrative label="Remarks" value={ultrasoundRemarks} />
            </div>
          ) : (
            <EmptyNote>No ultrasound result recorded for this visit.</EmptyNote>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            TT / Td recorded this visit
          </p>
          {tetanus.length > 0 ? (
            <LedgerTable
              columns={["Dose", "Date given"]}
              rows={tetanus.map((entry) => ({
                key: entry.dose,
                cells: [entry.dose, formatLongDate(entry.date, EMPTY)],
              }))}
            />
          ) : (
            <EmptyNote>
              No tetanus toxoid / Td dose was recorded for this visit.
            </EmptyNote>
          )}
        </div>
      </div>
    </ProfileSection>
  );
}

function FamilyPlanningProgramSection({ details }) {
  const clientLabels = [
    "Client Type",
    "Method Used / Accepted",
    "Previous Method",
    "FP Visit Category",
    "Source",
    "Date Registered",
    "Date of Visit",
  ];
  const client = details.filter((item) => clientLabels.includes(item.label));

  return (
    <ProfileSection id="fp-program" title="Family planning">
      <div className="space-y-5">
        <FactGrid
          items={client.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
        <Narrative
          label="Concern / complaint"
          value={fpDetail(details, "Concern / Complaint")}
        />
        <Narrative
          label="Findings / notes"
          value={fpDetail(details, "Findings / Notes")}
        />
      </div>
    </ProfileSection>
  );
}

function MedicinesTable({ medicines = [] }) {
  if (!medicines.length) {
    return (
      <EmptyNote>
        No medicines or supplies were dispensed during this visit.
      </EmptyNote>
    );
  }

  return (
    <LedgerTable
      columns={["Medicine / supply", "Quantity", "Remarks", "Date dispensed"]}
      rows={medicines.map((medicine, index) => ({
        key: medicine.id || `${medicine.medicineId || "medicine"}-${index}`,
        cells: [
          [
            medicine.medicineName || medicine.medicine_name_snapshot || "Medicine",
            medicine.category || medicine.category_snapshot || "",
          ]
            .filter(Boolean)
            .join(" · "),
          `${formatDisplayValue(medicine.quantity, "0")} ${formatDisplayValue(medicine.unit, "")}`.trim(),
          formatDisplayValue(medicine.remarks, "—"),
          formatLongDate(
            medicine.dateDispensed || medicine.created_at || medicine.createdAt,
            "—",
          ),
        ],
      }))}
    />
  );
}

function FollowUpReferralSection({
  record,
  linkedReferral,
  followUpDate,
  followUpReason,
  needsReferral,
  patientCondition,
  monitoringNotes,
  status,
  parentRecordId,
  nextAppointmentDate,
  maternalReferralReason,
}) {
  const referralStatus =
    linkedReferral?.status ||
    linkedReferral?.referralStatus ||
    record.referralStatus ||
    record.referral_status ||
    "";

  return (
    <ProfileSection
      id="follow-up-referral"
      title="Follow-up & referral information"
    >
      <div className="space-y-6">
        <FactGrid
          items={[
            {
              label: "Follow-up date",
              value: formatLongDate(followUpDate, "Not recorded"),
            },
            { label: "Follow-up reason", value: followUpReason },
            ...(nextAppointmentDate
              ? [{ label: "Next appointment date", value: nextAppointmentDate }]
              : []),
            {
              label: "Needs RHU referral",
              value: needsReferral ? "Yes" : "No",
            },
            { label: "Referral status", value: referralStatus },
            {
              label: "Urgency",
              value:
                linkedReferral?.urgencyLevel || linkedReferral?.urgency_level,
            },
            {
              label: "Receiving facility",
              value:
                linkedReferral?.receivingFacility ||
                linkedReferral?.ruralHealthUnit?.name ||
                linkedReferral?.rural_health_unit?.name,
            },
            ...(parentRecordId
              ? [{ label: "Parent record", value: `#${parentRecordId}` }]
              : []),
            ...((patientCondition || status === "Follow-up Required")
              ? [{ label: "Patient condition", value: patientCondition }]
              : []),
          ]}
        />
        <Narrative
          label="Reason for referral"
          value={
            linkedReferral?.reasonForReferral ||
            linkedReferral?.reason_for_referral ||
            maternalReferralReason
          }
        />
        {monitoringNotes && (
          <Narrative label="Monitoring notes" value={monitoringNotes} />
        )}
        <FollowUpEpisodeContent
          episode={record.followUpEpisode}
          currentRecord={record}
          sourceRecordId={record.id || record._id}
          showRecordNavigation={false}
          hideActions
        />
      </div>
    </ProfileSection>
  );
}

function fpDetail(details = [], label) {
  return details.find((item) => item.label === label)?.value || "";
}
