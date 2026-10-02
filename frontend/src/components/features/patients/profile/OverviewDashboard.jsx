import { CalendarClock, ChevronRight, HeartPulse, ShieldAlert, ShieldCheck } from "lucide-react";

import { EmptyNote, ProfileSection, TextAction } from "./ProfileSection";
import { FollowUpStateBadge } from "./FollowUpsAndReferrals";
import { NO_ALLERGY_PATTERN } from "../PatientAlertChips";
import { calculateBmi, formatBmi } from "../../../../utils/bmi";
import {
  getLatestVitalRecord,
  getVitalRecordDate,
  hasVitalValue,
  isVitalRecordToday,
} from "../../../../utils/currentPatientVitals";
import { getRecordDateValue, getRecordOutcome } from "../../../../utils/healthRecordPrograms";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { formatShortDate } from "../../../../utils/patientProfile";

const OUTCOME_TEXT = {
  Referred: "text-amber-700",
  "Follow-up": "text-red-600",
  Routine: "text-gray-500",
};

const CONDITION_STATUS_TONE = {
  Active: "border-red-200 bg-red-50 text-red-700",
  Controlled: "border-amber-200 bg-amber-50 text-amber-700",
  Resolved: "border-green-200 bg-green-50 text-green-700",
};

const CARE_STATUS_TONE = {
  info: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  success: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  warning: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
  neutral: "border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]",
};

function getRecordKey(record = {}) {
  return (
    record.id ||
    record.health_record_id ||
    record.healthRecordId ||
    record.record_id ||
    record.recordId ||
    record._id ||
    ""
  );
}

/** One documented condition: name, status pill and the dates already on file. */
function ConditionTile({ disease }) {
  const tone = CONDITION_STATUS_TONE[disease.status] || "border-gray-200 bg-gray-50 text-gray-600";
  const meta = [
    disease.firstRecorded && `First noted ${formatShortDate(disease.firstRecorded)}`,
    disease.lastConfirmed && `Confirmed ${formatShortDate(disease.lastConfirmed)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-2.5 border border-gray-200 p-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center bg-red-50 text-red-600">
        <HeartPulse size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">{disease.name}</span>
          {disease.status && (
            <span
              className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
            >
              {disease.status}
            </span>
          )}
        </div>
        {meta && <p className="mt-0.5 truncate text-[11px] text-gray-500">{meta}</p>}
      </div>
    </div>
  );
}

/** Single allergy-status line; only the allergies field the record actually has. */
function AllergyStatusRow({ allergies }) {
  const text = String(allergies || "").trim();
  const isNegative = !text || NO_ALLERGY_PATTERN.test(text);
  const Icon = isNegative ? ShieldCheck : ShieldAlert;
  return (
    <div
      className={`mt-2 flex items-center gap-2 border px-2.5 py-1.5 text-xs ${
        isNegative ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      {isNegative ? "No known allergies" : `Allergy: ${text}`}
    </div>
  );
}

/** Documented current conditions as individual tiles, plus one allergy status line. */
function ConditionsCard({ background }) {
  const diseases = Array.isArray(background?.currentDiseases) ? background.currentDiseases : [];
  return (
    <ProfileSection id="overview-conditions" title="Current Conditions" className="mb-0 p-4">
      {diseases.length === 0 ? (
        <EmptyNote>No documented conditions yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {diseases.map((disease, index) => (
            <ConditionTile key={`${disease.name}-${index}`} disease={disease} />
          ))}
        </div>
      )}
      <AllergyStatusRow allergies={background?.allergies} />
    </ProfileSection>
  );
}

/** Read-only preview of the same care-tracking programs shown in Care & Programs. */
function CareTrackingPreviewCard({ entries, onViewAll }) {
  return (
    <ProfileSection
      id="overview-care-tracking"
      title="Care Tracking"
      meta={entries.length ? `${entries.length} programs` : null}
      actions={entries.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
      className="mb-0 p-4"
    >
      {entries.length === 0 ? (
        <EmptyNote>No applicable care programs for this patient yet.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entries.map((entry) => (
            <div key={entry.key} className="border border-gray-200 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">{entry.label}</span>
                <span
                  className={`shrink-0 rounded-none border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    CARE_STATUS_TONE[entry.statusTone] || CARE_STATUS_TONE.neutral
                  }`}
                >
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {entry.nextVisit
                  ? `Next visit ${formatShortDate(entry.nextVisit)}`
                  : entry.lastVisit
                    ? `Last visit ${formatShortDate(entry.lastVisit)}`
                    : "No record yet"}
              </p>
            </div>
          ))}
        </div>
      )}
    </ProfileSection>
  );
}

/** Latest vitals + BMI, denser single-row grid on wider screens. */
function VitalsSummaryCard({ records, isLoading }) {
  const record = getLatestVitalRecord(records);
  const bmi = record ? calculateBmi(record.weight, record.height) : null;
  const recordedAt = record ? getVitalRecordDate(record) : null;
  const value = (raw) => (hasVitalValue(raw) ? raw : "—");
  const cells = record
    ? [
        ["BP", hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp) ? `${value(record.systolicBp)}/${value(record.diastolicBp)}` : "—", "mmHg"],
        ["Pulse", value(record.pulse), "bpm"],
        ["Temp", value(record.temperature), "°C"],
        ["SpO₂", value(record.spo2), "%"],
        ["Weight", value(record.weight), "kg"],
        ["Height", value(record.height), "cm"],
        ["BMI", bmi !== null && Number.isFinite(bmi) ? formatBmi(bmi) : "—", "kg/m²"],
        // Optional Additional Measurement: shown only when recorded.
        ...(hasVitalValue(record.fbs) ? [["FBS", record.fbs, "mg/dL"]] : []),
      ]
    : [];
  const when = recordedAt
    ? `${isVitalRecordToday(record) ? "Today, " : ""}${recordedAt.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        ...(isVitalRecordToday(record) ? {} : { month: "short", day: "numeric", year: "numeric" }),
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";

  return (
    <ProfileSection id="overview-vitals" title="Latest Vitals & BMI" meta={when} className="mb-0 p-4">
      <div aria-busy={isLoading}>
        {isLoading ? (
          <p role="status" className="text-sm text-gray-600">Loading vital signs...</p>
        ) : !record ? (
          <p className="text-sm text-gray-600">No vital signs recorded yet.</p>
        ) : (
          <dl className={`grid grid-cols-2 gap-px overflow-hidden border border-gray-200 bg-gray-200 sm:grid-cols-4 ${cells.length > 7 ? "lg:grid-cols-8" : "lg:grid-cols-7"}`}>
            {cells.map(([label, reading, unit]) => (
              <div key={label} className="min-w-0 bg-white px-2 py-1">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
                <dd className="m-0 truncate text-sm font-bold tabular-nums text-gray-900">
                  {reading}
                  <span className="ml-1 text-[10px] font-normal text-gray-500">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </ProfileSection>
  );
}

/** Condensed preview of the nearest active/pending follow-ups. */
function FollowUpsPreviewCard({ followUps, onViewAll }) {
  const visible = followUps.slice(0, 3);
  return (
    <ProfileSection
      id="overview-follow-ups"
      title="Follow-ups"
      meta={followUps.length ? `${followUps.length} active` : null}
      actions={followUps.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
      className="mb-0 p-4"
    >
      {visible.length === 0 ? (
        <EmptyNote>No active or pending follow-ups.</EmptyNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex items-center gap-2 text-gray-900">
                <CalendarClock size={13} className="shrink-0 text-gray-400" aria-hidden="true" />
                <span className="tabular-nums">{formatDate(task.dueDate, "Not recorded")}</span>
              </span>
              <FollowUpStateBadge state={task.effectiveState} />
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

/** Condensed preview of the most recent health records. */
function RecentRecordsPreviewCard({ records, isLoading, onViewAll, onViewRecord }) {
  const visible = records.slice(0, 3);
  return (
    <ProfileSection
      id="overview-recent-records"
      title="Recent Health Records"
      meta={records.length ? `${records.length} total` : null}
      actions={records.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
      className="mb-0 p-4"
    >
      {isLoading && records.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">Loading health records...</p>
      ) : visible.length === 0 ? (
        <EmptyNote>No health records recorded for this patient yet.</EmptyNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((record) => {
            const recordId = getRecordKey(record);
            const outcome = getRecordOutcome(record);
            return (
              <li key={String(recordId)}>
                <button
                  type="button"
                  onClick={() => onViewRecord(recordId)}
                  className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 text-left text-sm transition hover:bg-gray-50"
                >
                  <span className="text-xs tabular-nums text-gray-500">
                    {formatShortDate(getRecordDateValue(record))}
                  </span>
                  <span className="min-w-0 truncate text-gray-900">
                    {formatDisplayValue(record.chiefComplaint, "No complaint recorded")}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {outcome && <span className={OUTCOME_TEXT[outcome] || ""}>{outcome}</span>}
                    <ChevronRight size={13} className="text-gray-300" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ProfileSection>
  );
}

/**
 * Overview tab's left-column clinical dashboard: conditions, care tracking,
 * vitals, follow-ups and recent records, stacked. The caller places this
 * beside the sticky Patient Health Summary column and the Registration /
 * Background sections below it - this component only owns its own cards.
 * Only rendered when the caller can view clinical history.
 */
export default function OverviewDashboard({
  patient,
  records,
  recordsLoading,
  activeFollowUps,
  careTracking = [],
  onViewRecords,
  onViewFollowUps,
  onViewPrograms,
  onViewRecord,
}) {
  return (
    <div className="mb-3 space-y-3">
      <ConditionsCard background={patient.medicalBackground} />
      <CareTrackingPreviewCard entries={careTracking} onViewAll={onViewPrograms} />
      <VitalsSummaryCard records={records} isLoading={recordsLoading} />
      <FollowUpsPreviewCard followUps={activeFollowUps} onViewAll={onViewFollowUps} />
      <RecentRecordsPreviewCard
        records={records}
        isLoading={recordsLoading}
        onViewAll={onViewRecords}
        onViewRecord={onViewRecord}
      />
    </div>
  );
}
