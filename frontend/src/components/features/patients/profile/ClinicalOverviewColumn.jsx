import { CalendarClock, ChevronRight } from "lucide-react";

import { StatusBadge } from "../../../common";
import { FollowUpStateBadge, getReferralDate, getReferralDestination } from "./FollowUpsAndReferrals";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { TextAction } from "./ProfileSection";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { formatShortDate } from "../../../../utils/patientProfile";
import { getRecordId } from "../../../../utils/bodyFindingsSummary";
import { getRecordDateValue, getRecordOutcome } from "../../../../utils/healthRecordPrograms";

const PREVIEW_COUNT = 3;

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

const OUTCOME_TEXT = {
  Referred: "text-amber-700",
  "Follow-up": "text-red-600",
  Routine: "text-slate-500",
};

const CHIP = "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
const ROW_BUTTON =
  "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40";

function ConditionsSection({ background }) {
  const diseases = Array.isArray(background?.currentDiseases) ? background.currentDiseases : [];
  return (
    <OverviewCard id="overview-conditions" title="Current Conditions" meta={diseases.length ? diseases.length : null}>
      {diseases.length === 0 ? (
        <OverviewNote>No documented conditions yet.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {diseases.map((disease, index) => {
            const meta = [
              disease.firstRecorded && `First noted ${formatShortDate(disease.firstRecorded)}`,
              disease.lastConfirmed && `Confirmed ${formatShortDate(disease.lastConfirmed)}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={`${disease.name}-${index}`} className="py-1.5 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{disease.name}</span>
                  {disease.status && (
                    <span className={`${CHIP} ${CONDITION_STATUS_TONE[disease.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {disease.status}
                    </span>
                  )}
                </div>
                {meta && <p className="mt-0.5 truncate text-[11px] text-slate-500">{meta}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}

function CareTrackingSection({ entries, programLabels, onViewAll }) {
  return (
    <OverviewCard
      id="overview-care-tracking"
      title="Care Tracking & Monitoring"
      action={entries.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
    >
      {programLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {programLabels.map((label) => (
            <span key={label} className="rounded-sm border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700">
              {label}
            </span>
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        <OverviewNote>No applicable care programs for this patient yet.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-3 py-1.5 first:pt-0">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{entry.label}</span>
                <span className="block text-[11px] text-slate-500">
                  {entry.nextVisit
                    ? `Next visit ${formatShortDate(entry.nextVisit)}`
                    : entry.lastVisit
                      ? `Last visit ${formatShortDate(entry.lastVisit)}`
                      : "No record yet"}
                </span>
              </span>
              <span className={`${CHIP} ${CARE_STATUS_TONE[entry.statusTone] || CARE_STATUS_TONE.neutral}`}>
                {entry.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

function ReferralsPreview({ referrals, isLoading, isError, onViewAll, onView }) {
  const visible = referrals.slice(0, PREVIEW_COUNT);
  return (
    <OverviewCard
      id="overview-referrals"
      title="Referrals"
      action={referrals.length > 0 ? <TextAction onClick={onViewAll}>View all ({referrals.length})</TextAction> : null}
    >
      {isLoading && referrals.length === 0 ? (
        <OverviewNote role="status">Loading referrals...</OverviewNote>
      ) : isError && referrals.length === 0 ? (
        <OverviewNote>Unable to load referral history right now.</OverviewNote>
      ) : visible.length === 0 ? (
        <OverviewNote>No referral history found for this patient.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((referral) => {
            const trackingId = referral.trackingId || referral.id;
            return (
              <li key={trackingId}>
                <button
                  type="button"
                  onClick={() => onView(trackingId)}
                  aria-label={`View referral ${trackingId}`}
                  className={ROW_BUTTON}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">
                      {formatDisplayValue(getReferralDestination(referral), "Destination not recorded")}
                    </span>
                    <span className="block truncate text-[11px] tabular-nums text-slate-500">
                      {getReferralDate(referral)} · {trackingId}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={referral.status} />
                    <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}

function FollowUpsPreview({ followUps, onViewAll, onView }) {
  const visible = followUps.slice(0, PREVIEW_COUNT);
  return (
    <OverviewCard
      id="overview-follow-ups"
      title="Upcoming Follow-ups"
      meta={followUps.length ? `${followUps.length} active` : null}
      action={followUps.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
    >
      {visible.length === 0 ? (
        <OverviewNote>No active or pending follow-ups.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onView(task.id)}
                aria-label={`View follow-up ${task.id}`}
                className={ROW_BUTTON}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-900">
                  <CalendarClock size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="truncate tabular-nums">
                    {formatDate(task.dueDate, "Not recorded")}
                    {task.dueTime ? ` · ${task.dueTime}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FollowUpStateBadge state={task.effectiveState} />
                  <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

function RecentVisitsPreview({ records, isLoading, onViewAll, onView }) {
  const visible = records.slice(0, PREVIEW_COUNT);
  return (
    <OverviewCard
      id="overview-recent-visits"
      title="Recent Visits"
      action={records.length > 0 ? <TextAction onClick={onViewAll}>View all ({records.length})</TextAction> : null}
    >
      {isLoading && records.length === 0 ? (
        <OverviewNote role="status">Loading health records...</OverviewNote>
      ) : visible.length === 0 ? (
        <OverviewNote>No health records recorded for this patient yet.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((record) => {
            const recordId = getRecordId(record);
            const outcome = getRecordOutcome(record);
            const summary = [record.category, record.chiefComplaint].map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
            return (
              <li key={recordId}>
                <button type="button" onClick={() => onView(recordId)} className={ROW_BUTTON}>
                  <span className="min-w-0">
                    <span className="block text-[11px] tabular-nums text-slate-500">
                      {formatShortDate(getRecordDateValue(record))}
                    </span>
                    <span className="block truncate text-sm text-slate-900">
                      {formatDisplayValue(summary, "No complaint recorded")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                    {outcome && <span className={OUTCOME_TEXT[outcome] || "text-slate-500"}>{outcome}</span>}
                    <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}

/**
 * Right column of the Overview board: documented conditions, care tracking,
 * latest referrals, the next follow-ups and the most recent visits - each a
 * compact card linking to its full tab. Only rendered for roles that may
 * view clinical history.
 */
export default function ClinicalOverviewColumn({
  patient,
  careTracking = [],
  programLabels = [],
  referrals = [],
  referralsLoading = false,
  referralsError = false,
  activeFollowUps = [],
  records = [],
  recordsLoading = false,
  onViewPrograms,
  onViewReferrals,
  onViewReferral,
  onViewFollowUps,
  onViewFollowUp,
  onViewRecords,
  onViewRecord,
}) {
  return (
    <div className="space-y-2">
      <ConditionsSection background={patient.medicalBackground} />
      <CareTrackingSection entries={careTracking} programLabels={programLabels} onViewAll={onViewPrograms} />
      <ReferralsPreview
        referrals={referrals}
        isLoading={referralsLoading}
        isError={referralsError}
        onViewAll={onViewReferrals}
        onView={onViewReferral}
      />
      <FollowUpsPreview followUps={activeFollowUps} onViewAll={onViewFollowUps} onView={onViewFollowUp} />
      <RecentVisitsPreview records={records} isLoading={recordsLoading} onViewAll={onViewRecords} onView={onViewRecord} />
    </div>
  );
}
