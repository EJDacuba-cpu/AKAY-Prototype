import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  FilePlus2,
  HeartPulse,
  Syringe,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  RefreshingIndicator,
  SideCard,
  SoftLoadingArea,
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import { getRhuHealthRecords } from "../../services/healthRecordService";
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
  const detailsUpdating = isFetching && !loading && Boolean(details);

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Health Record Details">
        <style>{keyframes}</style>
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
  const canRecordFollowUpVisit =
    Boolean(followUpDateValue) &&
    getRecordVisitTypeValue(record) !== "follow_up_visit";
  const showPatientProfileSidebar = false;
  const isImmunizationRecord = isImmunizationClassification(record, patient);
  const rawRecordClassification = getRecordClassification(record, patient);
  const recordClassification = isImmunizationRecord
    ? "Child Health / EPI"
    : rawRecordClassification;
  const recordTypeLabel = isImmunizationRecord
    ? "Immunization"
    : rawRecordClassification;
  const epiVaccineEntries = getEpiVaccineEntries(record);
  const epiBreastfeedingMonitoring = getEpiBreastfeedingMonitoring(record);
  const displayDate = getRecordDate(record);
  const displayTime = getRecordTime(record);
  const pageTitle = isImmunizationRecord
    ? "Child Health / EPI Visit"
    : getRecordConcern(record, "Medical Consultation");
  const needsRhuReferral =
    record.needs_referral === true ||
    record.needsReferral === true ||
    record.needsReferral === "yes";
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
      <div className="min-h-[520px]">

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
                {pageTitle}
              </h1>
              {hasLinkedReferral && <ReferredChip />}
              {detailsUpdating && (
                <RefreshingIndicator label="Updating health record details..." />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-[11px] font-semibold text-slate-600">
                {getRecordId(record)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
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
          </div>
        </div>
        <div className="mt-5">
          <VisitInfoStrip
            patientName={patientName}
            patientId={patientId}
            classification={recordClassification}
            recordType={recordTypeLabel}
            displayDate={displayDate}
            displayTime={displayTime}
            practitioner={getRecordPractitioner(record, "RHU Staff")}
          />
        </div>
      </div>

      <div
        className={
          isImmunizationRecord
            ? "space-y-5"
            : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        }
      >
        <div>
          <SideCard
            title={
              isImmunizationRecord
                ? "Child Health / EPI Record"
                : "Clinical Record"
            }
            icon={
              isImmunizationRecord ? (
                <Syringe size={14} />
              ) : (
                <HeartPulse size={14} />
              )
            }
          >
            {isImmunizationRecord ? (
              <EpiRecordDetails
                record={record}
                vaccineEntries={epiVaccineEntries}
                breastfeedingMonitoring={epiBreastfeedingMonitoring}
                followUpDate={followUpDateValue}
                needsReferral={needsRhuReferral}
                linkedReferralTarget={linkedReferralTarget}
              />
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

        {!isImmunizationRecord && (
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
      </div>
    </DashboardLayout>
  );
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

function ReferredChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
      Referred
    </span>
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
  patientName,
  classification,
  recordType,
  displayDate,
  displayTime,
  practitioner,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MetadataItem label="Patient Full Name" value={patientName} />
        <MetadataItem label="Classification" value={classification} />
        <MetadataItem label="Record Type" value={recordType || classification} />
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

function EpiRecordDetails({
  record,
  vaccineEntries = [],
  breastfeedingMonitoring = {},
  followUpDate,
  needsReferral,
  linkedReferralTarget,
}) {
  const remarks = getEpiRemarks(record);
  const visitMonitoringItems = getVisitLevelMonitoringItems(record);
  const confirmedMonths = getConfirmedBreastfeedingMonths(breastfeedingMonitoring);

  return (
    <div className="divide-y divide-slate-100">
      <DetailSection title="Vaccines Given This Visit">
        {vaccineEntries.length > 0 ? (
          <EpiVaccinesTable entries={vaccineEntries} record={record} />
        ) : (
          <div className="space-y-3">
            <SectionEmptyState text="No vaccine recorded for this visit." />
            {remarks && <NarrativeBox label="Remarks" value={remarks} />}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Visit-Level Monitoring">
        <VitalSignsGrid items={visitMonitoringItems} />
      </DetailSection>

      <DetailSection title="Exclusive Breastfeeding Monitoring">
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
          <SectionEmptyState text="No breastfeeding monitoring recorded." />
        )}
      </DetailSection>

      <DetailSection title="Remarks">
        {remarks ? (
          <NarrativeBox label="Remarks" value={remarks} />
        ) : (
          <SectionEmptyState text="No remarks recorded." />
        )}
      </DetailSection>

      <DetailSection title="Follow-up & Referral">
        <div className="grid gap-4 md:grid-cols-3">
          <PatientDetailItem
            label="Follow-up Date"
            value={formatLongDate(followUpDate, "No follow-up date recorded.")}
          />
          <PatientDetailItem
            label="Needs RHU Referral"
            value={needsReferral ? "Yes" : "No"}
          />
          <PatientDetailItem
            label="Referral Tracking ID"
            value={linkedReferralTarget || "No referral linked to this record."}
          />
        </div>
      </DetailSection>
    </div>
  );
}

function EpiVaccinesTable({ entries, record }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_minmax(90px,0.75fr)_minmax(90px,0.75fr)_minmax(110px,0.85fr)] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:grid">
        <div className="px-3 py-2.5">Vaccine</div>
        <div className="px-3 py-2.5">Date Given</div>
        <div className="px-3 py-2.5">Weight</div>
        <div className="px-3 py-2.5">Height</div>
        <div className="px-3 py-2.5">Temperature</div>
      </div>
      <div className="divide-y divide-slate-100">
        {entries.map((entry, index) => (
          <div
            key={`${entry.vaccineName || "vaccine"}-${entry.dateGiven || index}`}
            className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_minmax(90px,0.75fr)_minmax(90px,0.75fr)_minmax(110px,0.85fr)] md:items-center md:gap-0"
          >
            <EpiTableCell label="Vaccine" strong value={entry.vaccineName} />
            <EpiTableCell
              label="Date Given"
              value={formatLongDate(
                entry.dateGiven || getRecordDateRaw(record),
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
        {formatDisplayValue(value, "Not recorded")}
      </p>
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

function getRecordDateRaw(record) {
  return getRecordValue(
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
  );
}

function getRecordDate(record) {
  return formatLongDate(getRecordDateRaw(record), "Not recorded");
}

function getRecordTime(record) {
  const direct = record?.timeOfVisit || record?.time_of_visit || record?.time;
  if (direct) return formatDisplayTime(direct, "");

  const recorded = record?.dateRecorded || record?.date_recorded;
  const match = String(recorded || "").match(/\d{2}:\d{2}/);
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
