import { CalendarClock, ChevronRight } from "lucide-react";

import { ProfileChip, ProfileStatusChip } from "./ProfileChip";
import { FollowUpStateBadge, getReferralDate, getReferralDestination } from "./FollowUpsAndReferrals";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { TextAction } from "./ProfileSection";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { formatShortDate } from "../../../../utils/patientProfile";
import { getRecordId } from "../../../../utils/bodyFindingsSummary";
import { getRecordDateValue, getRecordOutcome } from "../../../../utils/healthRecordPrograms";

const PREVIEW_COUNT = 3;

// Care program statuses use the profile palette: red needs attention, outlined ink is in progress.
const CARE_STATUS_TONE = { info: "active", success: "quiet", warning: "attention", neutral: "quiet" };

const OUTCOME_TONE = { Referred: "attention", "Follow-up": "active", Routine: "quiet" };

const ROW_BUTTON =
  "group -mx-1.5 grid w-[calc(100%+0.75rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50";

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
              <ProfileChip tone={CARE_STATUS_TONE[entry.statusTone] || "quiet"}>{entry.status}</ProfileChip>
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
                    <ProfileStatusChip status={referral.status} />
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

function FollowUpsPreview({ followUps, onView }) {
  const visible = followUps.slice(0, PREVIEW_COUNT);
  return (
    <OverviewCard
      id="overview-follow-ups"
      share={2}
      title="Upcoming follow-ups"
      meta={followUps.length ? `${followUps.length} active` : null}
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
                aria-label={`Open follow-ups for ${formatDate(task.dueDate, "scheduled visit")}`}
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
                    {outcome && <ProfileChip tone={OUTCOME_TONE[outcome] || "quiet"}>{outcome}</ProfileChip>}
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
 * Right column of the Overview board, top to bottom: latest referrals,
 * the next follow-ups, care programs and the most recent
 * visits - compact cards with record links, splitting the column
 * height by card share. Only rendered for roles that may view clinical
 * history.
 */
export default function ClinicalOverviewColumn({
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
  onViewFollowUp,
  onViewRecords,
  onViewRecord,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ReferralsPreview
        referrals={referrals}
        isLoading={referralsLoading}
        isError={referralsError}
        onViewAll={onViewReferrals}
        onView={onViewReferral}
      />
      {typeof onViewFollowUp === "function" && (
        <FollowUpsPreview followUps={activeFollowUps} onView={onViewFollowUp} />
      )}
      <CareTrackingSection entries={careTracking} programLabels={programLabels} onViewAll={onViewPrograms} />
      <RecentVisitsPreview records={records} isLoading={recordsLoading} onViewAll={onViewRecords} onView={onViewRecord} />
    </div>
  );
}
