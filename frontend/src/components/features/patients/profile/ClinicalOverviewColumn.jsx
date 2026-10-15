import { ArrowRight, CalendarClock, ChevronRight } from "lucide-react";

import { StatusBadge } from "../../../common";
import { FollowUpStateBadge, getReferralDate, getReferralDestination } from "./FollowUpsAndReferrals";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { TextAction } from "./ProfileSection";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { formatShortDate } from "../../../../utils/patientProfile";
import { summarizeBackground } from "../../../../utils/backgroundSummary";
import { getRecordId } from "../../../../utils/bodyFindingsSummary";
import { getRecordDateValue, getRecordOutcome } from "../../../../utils/healthRecordPrograms";

const PREVIEW_COUNT = 3;

const CARE_STATUS_TONE = {
  info: "bg-info-50 text-info-700 ring-info-100",
  success: "bg-success-50 text-success-700 ring-success-100",
  warning: "bg-warning-50 text-warning-700 ring-warning-100",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

const OUTCOME_TEXT = {
  Referred: "text-warning-700",
  "Follow-up": "text-info-700",
  Routine: "text-neutral-500",
};

const CHIP = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";
const ROW_BUTTON =
  "group -mx-1.5 grid w-[calc(100%+0.75rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50";

/** Read-only background summary; View opens the Patient Background tab. */
function BackgroundSummaryCard({ background, onView }) {
  return (
    <OverviewCard
      id="overview-background"
      title="Patient background"
      share={2.5}
      action={
        <TextAction onClick={onView} className="inline-flex items-center gap-1">
          View
          <ArrowRight size={13} aria-hidden="true" />
        </TextAction>
      }
    >
      <dl className="space-y-1 text-[13px]">
        {summarizeBackground(background).map(({ key, label, text }) => (
          <div key={key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2">
            <dt className="text-neutral-500">{label}</dt>
            <dd className={`m-0 line-clamp-2 min-w-0 flow:line-clamp-none break-words ${text ? "text-neutral-900" : "text-neutral-500"}`} title={text || undefined}>
              {text || "Not recorded"}
            </dd>
          </div>
        ))}
      </dl>
    </OverviewCard>
  );
}

function CareTrackingSection({ entries, programLabels, onViewAll }) {
  return (
    <OverviewCard
      id="overview-care-tracking"
      share={2.5}
      title="Care programs"
      action={entries.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
    >
      {programLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {programLabels.map((label) => (
            <span key={label} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
              {label}
            </span>
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        <OverviewNote>No applicable care programs for this patient yet.</OverviewNote>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-3 py-1.5 first:pt-0">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-neutral-900">{entry.label}</span>
                <span className="block text-xs text-neutral-500">
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
      share={2}
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
        <ul className="divide-y divide-neutral-100">
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
                    <span className="block truncate text-[13px] font-medium text-neutral-900">
                      {formatDisplayValue(getReferralDestination(referral), "Destination not recorded")}
                    </span>
                    <span className="block truncate text-xs tabular-nums text-neutral-500">
                      {getReferralDate(referral)} · {trackingId}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={referral.status} />
                    <ChevronRight size={14} className="text-neutral-300 transition-colors group-hover:text-neutral-600" aria-hidden="true" />
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
      share={2}
      title="Upcoming follow-ups"
      meta={followUps.length ? `${followUps.length} active` : null}
      action={followUps.length > 0 ? <TextAction onClick={onViewAll}>View all</TextAction> : null}
    >
      {visible.length === 0 ? (
        <OverviewNote>No active or pending follow-ups.</OverviewNote>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {visible.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onView(task.id)}
                aria-label={`View follow-up ${task.id}`}
                className={ROW_BUTTON}
              >
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-neutral-900">
                  <CalendarClock size={14} className="shrink-0 text-neutral-400" aria-hidden="true" />
                  <span className="truncate tabular-nums">
                    {formatDate(task.dueDate, "Not recorded")}
                    {task.dueTime ? ` · ${task.dueTime}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FollowUpStateBadge state={task.effectiveState} />
                  <ChevronRight size={14} className="text-neutral-300 transition-colors group-hover:text-neutral-600" aria-hidden="true" />
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
      share={2}
      title="Recent visits"
      action={records.length > 0 ? <TextAction onClick={onViewAll}>View all ({records.length})</TextAction> : null}
    >
      {isLoading && records.length === 0 ? (
        <OverviewNote role="status">Loading health records...</OverviewNote>
      ) : visible.length === 0 ? (
        <OverviewNote>No health records recorded for this patient yet.</OverviewNote>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {visible.map((record) => {
            const recordId = getRecordId(record);
            const outcome = getRecordOutcome(record);
            const summary = [record.category, record.chiefComplaint].map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
            return (
              <li key={recordId}>
                <button type="button" onClick={() => onView(recordId)} className={ROW_BUTTON}>
                  <span className="min-w-0">
                    <span className="block text-xs tabular-nums text-neutral-500">
                      {formatShortDate(getRecordDateValue(record))}
                    </span>
                    <span className="block truncate text-[13px] font-medium text-neutral-900">
                      {formatDisplayValue(summary, "No complaint recorded")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium">
                    {outcome && <span className={OUTCOME_TEXT[outcome] || "text-neutral-500"}>{outcome}</span>}
                    <ChevronRight size={14} className="text-neutral-300 transition-colors group-hover:text-neutral-600" aria-hidden="true" />
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
 * Right column of the Overview board, top to bottom: the background summary,
 * latest referrals, the next follow-ups, care programs and the most recent
 * visits - each a compact card linking to its full tab, splitting the column
 * height by card share. Only rendered for roles that may view clinical
 * history.
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
  onViewBackground,
  onViewPrograms,
  onViewReferrals,
  onViewReferral,
  onViewFollowUps,
  onViewFollowUp,
  onViewRecords,
  onViewRecord,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BackgroundSummaryCard background={patient.medicalBackground} onView={onViewBackground} />
      <ReferralsPreview
        referrals={referrals}
        isLoading={referralsLoading}
        isError={referralsError}
        onViewAll={onViewReferrals}
        onView={onViewReferral}
      />
      <FollowUpsPreview followUps={activeFollowUps} onViewAll={onViewFollowUps} onView={onViewFollowUp} />
      <CareTrackingSection entries={careTracking} programLabels={programLabels} onViewAll={onViewPrograms} />
      <RecentVisitsPreview records={records} isLoading={recordsLoading} onViewAll={onViewRecords} onView={onViewRecord} />
    </div>
  );
}
