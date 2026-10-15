import { useState } from "react";
import { Link } from "react-router";
import { CalendarClock, ChevronRight } from "lucide-react";

import { RefreshingIndicator, SoftLoadingArea, StatusBadge } from "../../../common";
import {
  buildRecordFollowUpVisitPath,
  getStateConfig,
} from "../../followups/followUpStatusStyles.jsx";
import { EmptyNote, ProfileSection, TextAction } from "./ProfileSection";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { groupFollowUpsByStatus, isActiveFollowUpState } from "../../../../utils/patientProfile";

const INITIAL_VISIBLE = 3;

/** Flat status chip; colours come from the shared follow-up state palette. */
export function FollowUpStateBadge({ state, date }) {
  const config = getStateConfig(state);
  const dateText = date ? formatDate(date, "") : "";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${config.badge}`}>
      {dateText ? `${config.label} · ${dateText}` : config.label}
    </span>
  );
}

export function getReferralDate(referral = {}) {
  return formatDate(
    referral.dateOfReferral ||
      referral.date_of_referral ||
      referral.referralDate ||
      referral.referral_datetime ||
      referral.dateSubmitted ||
      referral.createdAt ||
      referral.created_at ||
      referral.date,
    "Not recorded",
  );
}

export function getReferralDestination(referral = {}) {
  return (
    referral.receivingFacility ||
    referral.destinationFacility ||
    referral.referredFacility ||
    referral.rural_health_unit?.name ||
    referral.ruralHealthUnit?.name ||
    ""
  );
}

function ExpandableList({ items, noun, children }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  return (
    <>
      <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
        {visible.map(children)}
      </ul>
      {items.length > INITIAL_VISIBLE && (
        <div className="pt-3">
          <TextAction onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show less" : `Show all ${items.length} ${noun}`}
          </TextAction>
        </div>
      )}
    </>
  );
}

function FollowUpRow({ task, onViewFollowUp }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm text-neutral-900">
          <CalendarClock size={13} className="shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="tabular-nums">
            {formatDate(task.dueDate, "Not recorded")}
            {task.dueTime ? ` · ${task.dueTime}` : ""}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Task #{task.id} · from record #{formatDisplayValue(task.healthRecordId, "-")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <FollowUpStateBadge state={task.effectiveState} />
        {isActiveFollowUpState(task.effectiveState) && (
          <Link
            to={buildRecordFollowUpVisitPath(task)}
            className="rounded-lg bg-ink-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600"
          >
            Record Visit
          </Link>
        )}
        <TextAction onClick={() => onViewFollowUp?.(task.id)}>Details</TextAction>
      </div>
    </li>
  );
}

/**
 * Follow-ups tab: the patient's tasks as separate Overdue / Pending /
 * Completed cards (and Cancelled, only when there are any), each its own
 * ProfileSection card. Expects tasks already carrying `effectiveState` and
 * ordered by `orderFollowUps`.
 */
export function FollowUpsByStatus({ followUps = [], onViewFollowUp }) {
  if (followUps.length === 0) {
    return (
      <ProfileSection id="follow-ups" title="Follow-ups">
        <EmptyNote>No follow-ups scheduled for this patient yet.</EmptyNote>
      </ProfileSection>
    );
  }

  const groups = groupFollowUpsByStatus(followUps).filter(
    (group) => group.key !== "cancelled" || group.items.length > 0,
  );

  return groups.map((group) => (
    <ProfileSection
      key={group.key}
      id={`follow-ups-${group.key}`}
      title={group.label}
      meta={`${group.items.length}`}
    >
      {group.items.length === 0 ? (
        <EmptyNote>{group.empty}</EmptyNote>
      ) : (
        <ExpandableList items={group.items} noun={`${group.label.toLowerCase()} follow-ups`}>
          {(task) => <FollowUpRow key={task.id} task={task} onViewFollowUp={onViewFollowUp} />}
        </ExpandableList>
      )}
    </ProfileSection>
  ));
}

export function ReferralsSection({
  referrals = [],
  isLoading = false,
  isFetching = false,
  isError = false,
  onView,
}) {
  return (
    <ProfileSection
      id="referrals"
      title="Referrals"
      meta={referrals.length ? `${referrals.length} total` : null}
      actions={isFetching && referrals.length > 0 ? <RefreshingIndicator label="Updating referrals..." /> : null}
    >
      {isLoading && referrals.length === 0 ? (
        <SoftLoadingArea isLoading message="Loading referrals..." minHeight="min-h-[96px]">
          <div className="min-h-[96px]" />
        </SoftLoadingArea>
      ) : isError && referrals.length === 0 ? (
        <EmptyNote>Unable to load referral history right now.</EmptyNote>
      ) : referrals.length === 0 ? (
        <EmptyNote>No referral history found for this patient.</EmptyNote>
      ) : (
        <ExpandableList items={referrals} noun="referrals">
          {(referral) => {
            const trackingId = referral.trackingId || referral.id;
            const hasReturnSlip = Boolean(referral.feedback || referral.returnSlip);
            return (
              <li key={trackingId}>
                <button
                  type="button"
                  onClick={() => onView(trackingId)}
                  aria-label={`View referral ${trackingId}`}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-900">
                      {formatDisplayValue(getReferralDestination(referral), "Destination not recorded")}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      <span className="tabular-nums">{getReferralDate(referral)}</span>
                      {" · "}
                      {trackingId}
                      {" · "}
                      {hasReturnSlip ? "Return slip available" : "Awaiting feedback"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={referral.status} />
                    <ChevronRight size={14} className="text-neutral-300 transition group-hover:text-neutral-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          }}
        </ExpandableList>
      )}
    </ProfileSection>
  );
}
