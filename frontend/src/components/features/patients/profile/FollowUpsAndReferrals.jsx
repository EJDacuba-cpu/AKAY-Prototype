import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { RefreshingIndicator, SoftLoadingArea } from "../../../common";
import { ProfileChip, ProfileStatusChip, followUpTone } from "./ProfileChip";
import { getStateConfig } from "../../followups/followUpStatusStyles.jsx";
import { EmptyNote, ProfileSection, TextAction } from "./ProfileSection";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { referralListKey, referralMatches } from "../../../../utils/referralSlipView";

const INITIAL_VISIBLE = 3;

/** Status chip in the profile palette: red is due or missed, outlined ink is upcoming, gray is settled. */
export function FollowUpStateBadge({ state, date }) {
  const config = getStateConfig(state);
  const dateText = date ? formatDate(date, "") : "";
  return <ProfileChip tone={followUpTone(state)} dot>{dateText ? `${config.label} · ${dateText}` : config.label}</ProfileChip>;
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

function ExpandableList({ items, noun, selectedKey, children }) {
  const [showAll, setShowAll] = useState(false);
  const selectedIndex = items.findIndex((item) => referralMatches(item, selectedKey));
  const expanded = showAll || selectedIndex >= INITIAL_VISIBLE;
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  return (
    <>
      <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
        {visible.map(children)}
      </ul>
      {items.length > INITIAL_VISIBLE && selectedIndex < INITIAL_VISIBLE && (
        <div className="pt-3">
          <TextAction onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show less" : `Show all ${items.length} ${noun}`}
          </TextAction>
        </div>
      )}
    </>
  );
}

export function ReferralsSection({
  referrals = [],
  isLoading = false,
  isFetching = false,
  isError = false,
  selectedKey = "",
  onView,
  onSelect,
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
        <ExpandableList items={referrals} noun="referrals" selectedKey={selectedKey}>
          {(referral) => {
            const trackingId = referral.trackingId || referral.id;
            const key = referralListKey(referral);
            const selected = Boolean(selectedKey) && referralMatches(referral, selectedKey);
            const hasReturnSlip = Boolean(referral.feedback || referral.returnSlip);
            const title = onSelect
              ? formatDisplayValue(
                  referral.referringHci || getReferralDestination(referral),
                  "Referring facility not recorded",
                )
              : formatDisplayValue(getReferralDestination(referral), "Destination not recorded");
            return (
              <li key={key || trackingId}>
                <button
                  type="button"
                  onClick={() => (onSelect ? onSelect(referral) : onView?.(trackingId))}
                  aria-label={onSelect ? `Review BHC referral slip ${trackingId}` : `View referral ${trackingId}`}
                  aria-current={selected ? "true" : undefined}
                  className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 ${
                    selected ? "bg-neutral-50" : "hover:bg-neutral-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-900">{title}</span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      <span className="tabular-nums">{getReferralDate(referral)}</span>
                      {" · "}
                      {trackingId}
                      {" · "}
                      {hasReturnSlip ? "Return slip available" : "Awaiting feedback"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <ProfileStatusChip status={referral.status} />
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
