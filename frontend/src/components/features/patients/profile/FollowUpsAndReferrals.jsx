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
import { isActiveFollowUpState } from "../../../../utils/patientProfile";

const INITIAL_VISIBLE = 3;

/** Flat status chip; colours come from the shared follow-up state palette. */
export function FollowUpStateBadge({ state, date }) {
  const config = getStateConfig(state);
  const dateText = date ? formatDate(date, "") : "";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${config.badge}`}>
      {dateText ? `${config.label} · ${dateText}` : config.label}
    </span>
  );
}

function getReferralDate(referral = {}) {
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

function getReferralDestination(referral = {}) {
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
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
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

export function FollowUpsSection({ followUps = [], onViewFollowUp }) {
  return (
    <ProfileSection
      id="follow-ups"
      title="Follow-ups"
      meta={followUps.length ? `${followUps.length} total` : null}
    >
      {followUps.length === 0 ? (
        <EmptyNote>No follow-ups scheduled for this patient yet.</EmptyNote>
      ) : (
        <ExpandableList items={followUps} noun="follow-ups">
          {(task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-slate-900">
                  <CalendarClock size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="tabular-nums">
                    {formatDate(task.dueDate, "Not recorded")}
                    {task.dueTime ? ` · ${task.dueTime}` : ""}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Task #{task.id} · from record #{formatDisplayValue(task.healthRecordId, "-")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <FollowUpStateBadge state={task.effectiveState} />
                {isActiveFollowUpState(task.effectiveState) && (
                  <Link
                    to={buildRecordFollowUpVisitPath(task)}
                    className="rounded-md bg-[#B91C1C] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
                  >
                    Record Visit
                  </Link>
                )}
                <TextAction onClick={() => onViewFollowUp?.(task.id)}>Details</TextAction>
              </div>
            </li>
          )}
        </ExpandableList>
      )}
    </ProfileSection>
  );
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
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-900">
                      {formatDisplayValue(getReferralDestination(referral), "Destination not recorded")}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      <span className="tabular-nums">{getReferralDate(referral)}</span>
                      {" · "}
                      {trackingId}
                      {" · "}
                      {hasReturnSlip ? "Return slip available" : "Awaiting feedback"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={referral.status} />
                    <ChevronRight size={14} className="text-slate-300 transition group-hover:text-slate-600" aria-hidden="true" />
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
