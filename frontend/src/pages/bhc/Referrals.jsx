import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ActionMenu,
  ConnectionErrorState,
  DataTableEmptyState,
  ModuleTableCard,
  SearchField,
  SearchFilterCluster,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import ReferralListFilters from "../../components/features/referrals/ReferralListFilters";
import { getReferrals } from "../../services/referrals";
import { getReferralHolds } from "../../services/referralHolds";
import {
  VIEW_WAITING,
  WAITING_EMPTY_DESCRIPTION,
  WAITING_EMPTY_TITLE,
  normalizeReferralView,
  waitingHoldCard,
} from "../../utils/bhcReferralWorkspace";
import {
  formatDate,
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatReferralStatus,
} from "../../utils/formatters";
import {
  createActiveFilterChips,
  isDateInPreset,
} from "../../utils/filterUtils";
import { queryKeys } from "../../utils/queryKeys";
import usePagedRows from "../../hooks/usePagedRows";
import {
  ATTENTION_FILTER_ALL,
  ATTENTION_FILTER_OPTIONS,
  getAttentionBadgeClass,
  getReferralAttention,
  normalizeAttention,
} from "../../utils/referralAttention";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { copyText } from "../../utils/clipboard";

const SENT_DEFAULT_FILTERS = {
  search: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  status: "All",
  urgency: ATTENTION_FILTER_ALL,
  receivingFacility: "",
};

const WAITING_DEFAULT_FILTERS = {
  search: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  urgency: ATTENTION_FILTER_ALL,
  receivingFacility: "",
};

const DATE_PRESETS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom date" },
];

function getReferralClassification(referral) {
  return formatDisplayValue(
    referral.classification || referral.referralCategory || referral.category,
    "General Consultation",
  );
}

function getReferralUrgency(referral) {
  return getReferralAttention(referral);
}

function getReferralPatientName(referral) {
  return formatPatientName(
    referral.patientName || referral.patient || referral,
    "Unknown Patient",
  );
}

function getReferralDestination(referral) {
  return formatFacilityName(
    referral.receivingFacility ||
      referral.destinationFacility ||
      referral.rural_health_unit ||
      referral.ruralHealthUnit,
    "Unassigned RHU",
  );
}

function matchesReferralStatus(referralStatus, selectedStatus) {
  if (selectedStatus === "All") return true;
  if (selectedStatus === "Pending") {
    return (
      referralStatus === "Pending" || referralStatus === "Pending RHU Review"
    );
  }
  if (selectedStatus === "Received") {
    return (
      referralStatus === "Received" || referralStatus === "Received by RHU"
    );
  }
  if (selectedStatus === "Completed") {
    return referralStatus === "Completed";
  }

  return referralStatus === selectedStatus;
}

function getDateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getSubmittedDate(referral) {
  return getDateValue(
    referral.createdAt ||
      referral.dateSubmitted ||
      referral.dateOfReferral ||
      referral.referralDate,
  );
}

function getHoldDate(hold) {
  return getDateValue(hold.consultationDate || hold.createdAt);
}

function getHoldUrgency(hold) {
  return normalizeAttention(hold.urgencyLevel || hold.urgency);
}

export default function Referrals() {
  const [sentFilters, setSentFilters] = useState(SENT_DEFAULT_FILTERS);
  const [waitingFilters, setWaitingFilters] = useState(WAITING_DEFAULT_FILTERS);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = normalizeReferralView(searchParams);
  const isWaiting = activeView === VIEW_WAITING;
  const pageTitle = isWaiting ? "Waiting to Submit" : "Sent Referrals";

  useEffect(() => {
    if (searchParams.get("tab") !== VIEW_WAITING) return;
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    next.set("view", VIEW_WAITING);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    data: referralsData = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.referrals("bhc"),
    queryFn: getReferrals,
    retry: false,
  });

  const {
    data: referralHoldsData = [],
    isLoading: holdsLoading,
    isFetching: holdsFetching,
  } = useQuery({
    queryKey: queryKeys.referralHolds(),
    queryFn: getReferralHolds,
    retry: false,
  });
  const referralHolds = useMemo(
    () => (Array.isArray(referralHoldsData) ? referralHoldsData : []),
    [referralHoldsData],
  );

  const referrals = useMemo(
    () => (Array.isArray(referralsData) ? referralsData : []),
    [referralsData],
  );
  const loading =
    (isWaiting ? holdsLoading && referralHolds.length === 0 : isLoading && referrals.length === 0);
  const hasLoadError = Boolean(loadError) && !loading && !isWaiting;

  const sentFacilityOptions = useMemo(
    () =>
      Array.from(
        new Set(referrals.map(getReferralDestination).filter(Boolean)),
      ).sort(),
    [referrals],
  );

  const waitingFacilityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          referralHolds
            .map((hold) => hold.ruralHealthUnitName || waitingHoldCard(hold).receivingRhu)
            .filter(Boolean),
        ),
      ).sort(),
    [referralHolds],
  );

  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      const searchTerm = sentFilters.search.toLowerCase();
      const patientName = getReferralPatientName(referral).toLowerCase();
      const matchesSearch =
        !sentFilters.search ||
        patientName.includes(searchTerm) ||
        referral.trackingId?.toLowerCase().includes(searchTerm) ||
        referral.chiefComplaint?.toLowerCase().includes(searchTerm) ||
        referral.concern?.toLowerCase().includes(searchTerm);

      const matchesStatus = matchesReferralStatus(
        referral.status,
        sentFilters.status,
      );
      const matchesUrgency =
        sentFilters.urgency === ATTENTION_FILTER_ALL ||
        getReferralUrgency(referral) === sentFilters.urgency;
      const matchesFacility =
        !sentFilters.receivingFacility ||
        getReferralDestination(referral) === sentFilters.receivingFacility;
      const matchesDate = isDateInPreset(
        getSubmittedDate(referral),
        sentFilters.dateRange,
        {
          from: sentFilters.dateFrom,
          to: sentFilters.dateTo,
        },
      );

      return (
        matchesSearch &&
        matchesStatus &&
        matchesUrgency &&
        matchesFacility &&
        matchesDate
      );
    });
  }, [referrals, sentFilters]);

  const filteredHolds = useMemo(() => {
    return referralHolds.filter((hold) => {
      const card = waitingHoldCard(hold);
      const searchTerm = waitingFilters.search.toLowerCase();
      const matchesSearch =
        !waitingFilters.search ||
        card.patientName.toLowerCase().includes(searchTerm) ||
        card.reason.toLowerCase().includes(searchTerm) ||
        String(hold.chiefComplaint || "")
          .toLowerCase()
          .includes(searchTerm);

      const urgency = getHoldUrgency(hold);
      const matchesUrgency =
        waitingFilters.urgency === ATTENTION_FILTER_ALL ||
        urgency === waitingFilters.urgency;
      const matchesFacility =
        !waitingFilters.receivingFacility ||
        card.receivingRhu === waitingFilters.receivingFacility;
      const matchesDate = isDateInPreset(getHoldDate(hold), waitingFilters.dateRange, {
        from: waitingFilters.dateFrom,
        to: waitingFilters.dateTo,
      });

      return matchesSearch && matchesUrgency && matchesFacility && matchesDate;
    });
  }, [referralHolds, waitingFilters]);

  const {
    page: sentPage,
    setPage: setSentPage,
    totalPages: sentTotalPages,
    pageRows: paginatedReferrals,
  } = usePagedRows(filteredReferrals, sentFilters);

  const {
    page: waitingPage,
    setPage: setWaitingPage,
    totalPages: waitingTotalPages,
    pageRows: paginatedHolds,
  } = usePagedRows(filteredHolds, waitingFilters);

  const sentFilterFields = [
    {
      key: "dateRange",
      label: "Referral Date",
      resetValue: "all",
      type: "datePresets",
      presets: DATE_PRESETS,
      fullWidth: true,
    },
    {
      key: "status",
      label: "Status",
      resetValue: "All",
      options: ["All", "Pending", "Received", "Completed", "No-Show"],
    },
    {
      key: "urgency",
      label: "Urgency",
      resetValue: ATTENTION_FILTER_ALL,
      options: ATTENTION_FILTER_OPTIONS,
    },
    {
      key: "receivingFacility",
      label: "Receiving Facility",
      resetValue: "",
      placeholder: "All Facilities",
      options: sentFacilityOptions,
      fullWidth: true,
    },
  ];

  const waitingFilterFields = [
    {
      key: "dateRange",
      label: "Held Date",
      resetValue: "all",
      type: "datePresets",
      presets: DATE_PRESETS,
      fullWidth: true,
    },
    {
      key: "urgency",
      label: "Urgency",
      resetValue: ATTENTION_FILTER_ALL,
      options: ATTENTION_FILTER_OPTIONS,
    },
    {
      key: "receivingFacility",
      label: "Receiving Facility",
      resetValue: "",
      placeholder: "All Facilities",
      options: waitingFacilityOptions,
      fullWidth: true,
    },
  ];

  const activeFilters = createActiveFilterChips(
    isWaiting ? waitingFilters : sentFilters,
    (isWaiting ? waitingFilterFields : sentFilterFields).map((field) => ({
      ...field,
      value: (isWaiting ? waitingFilters : sentFilters)[field.key],
      dateFromValue: (isWaiting ? waitingFilters : sentFilters).dateFrom,
      dateToValue: (isWaiting ? waitingFilters : sentFilters).dateTo,
    })),
  );
  const activeFilterCount = activeFilters.length;
  const filters = isWaiting ? waitingFilters : sentFilters;
  const setFilters = isWaiting ? setWaitingFilters : setSentFilters;
  const defaults = isWaiting ? WAITING_DEFAULT_FILTERS : SENT_DEFAULT_FILTERS;
  const filterFields = isWaiting ? waitingFilterFields : sentFilterFields;

  function clearFilters() {
    setFilters(defaults);
  }

  function removeFilter(key) {
    const resetValues = {
      ...defaults,
    };
    if (key === "dateRange") {
      setFilters((prev) => ({
        ...prev,
        dateRange: defaults.dateRange,
        dateFrom: "",
        dateTo: "",
      }));
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  const narrowed = Boolean(filters.search.trim()) || activeFilterCount > 0;
  const resultCount = isWaiting ? filteredHolds.length : filteredReferrals.length;
  const totalCount = isWaiting ? referralHolds.length : referrals.length;

  if (hasLoadError) {
    return (
      <DashboardLayout role="bhc" title="Referrals">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(loadError)}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title={pageTitle}>
      <SoftLoadingArea
        skeleton="table"
        isLoading={loading}
        message={isWaiting ? "Loading waiting referrals..." : "Loading referrals..."}
        scope="area"
      >
        {!loading ? (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
                  {isWaiting ? "Waiting to Submit" : "Sent Referrals"}
                </h1>
                <p className="mt-1 text-[13px] text-neutral-600">
                  {isWaiting
                    ? "Unsent referrals waiting on RHU doctor availability."
                    : "Track submitted referrals and RHU updates."}
                </p>
              </div>
              <SearchFilterCluster
                search={
                  <SearchField
                    value={filters.search}
                    onChange={(search) =>
                      setFilters((current) => ({ ...current, search }))
                    }
                    placeholder={
                      isWaiting
                        ? "Search patient, reason, or complaint"
                        : "Search patient, ID, or complaint"
                    }
                    label={isWaiting ? "Search waiting referrals" : "Search referrals"}
                  />
                }
                filter={
                  <ReferralListFilters
                    fields={filterFields}
                    applied={filters}
                    activeCount={activeFilterCount}
                    activeFilters={activeFilters}
                    onApply={(next) =>
                      setFilters((current) => ({ ...current, ...next }))
                    }
                    onRemoveFilter={removeFilter}
                    onClearAll={clearFilters}
                  />
                }
              />
            </div>
          </div>
        ) : null}

        {isWaiting ? (
          loading ? null : (
            <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p aria-live="polite" className="text-xs tabular-nums text-neutral-600">
                {`${resultCount} of ${totalCount} waiting`}
              </p>
              {holdsFetching && referralHolds.length > 0 ? (
                <span className="text-xs text-neutral-500">Updating…</span>
              ) : null}
            </div>
            <ModuleTableCard
              minWidth="min-w-[1000px]"
              refreshing={holdsFetching && referralHolds.length > 0}
              footer={
                <TablePagination
                  currentPage={waitingPage}
                  totalPages={waitingTotalPages}
                  onPageChange={setWaitingPage}
                />
              }
            >
              <thead>
                <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <th className="whitespace-nowrap px-4 py-3">Patient</th>
                  <th className="whitespace-nowrap px-4 py-3">Consultation</th>
                  <th className="whitespace-nowrap px-4 py-3">RHU</th>
                  <th className="whitespace-nowrap px-4 py-3">Urgency</th>
                  <th className="whitespace-nowrap px-4 py-3">Reason</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8FAFC]">
                {filteredHolds.length > 0 ? (
                  paginatedHolds.map((hold) => {
                    const card = waitingHoldCard(hold);
                    return (
                      <tr
                        key={card.id}
                        className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <p className="truncate text-[13px] font-semibold text-[#111827]">
                            {card.patientName}
                          </p>
                          <p className="text-[11px] text-[#B54708]">{card.status}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[13px] text-[#9CA3AF]">
                          {formatDate(card.consultationDate, "—")}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-[13px] text-[#6B7280]">
                          {card.receivingRhu}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <UrgencyBadge urgency={getHoldUrgency(hold)} />
                        </td>
                        <td className="max-w-[240px] px-4 py-3.5 align-middle">
                          <p className="truncate text-[13px] text-[#374151]" title={card.reason}>
                            {card.reason}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <Button
                              asChild
                              variant="secondary"
                              size="compact"
                              className="rounded-full"
                            >
                              <Link to={card.detailsPath}>{card.viewLabel}</Link>
                            </Button>
                            <Button asChild variant="brand" size="compact">
                              <Link to={card.submitPath}>{card.submitLabel}</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <DataTableEmptyState
                    colSpan={6}
                    icon={<ClipboardList size={20} className="text-[#94A3B8]" />}
                    title={
                      narrowed
                        ? "No waiting referrals match"
                        : WAITING_EMPTY_TITLE
                    }
                    description={
                      narrowed
                        ? "Try a different search, or clear filters to see the full list again."
                        : WAITING_EMPTY_DESCRIPTION
                    }
                    action={
                      narrowed ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={clearFilters}
                        >
                          Clear search and filters
                        </Button>
                      ) : null
                    }
                  />
                )}
              </tbody>
            </ModuleTableCard>
            </>
          )
        ) : loading ? null : (
          <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-xs tabular-nums text-neutral-600">
              {`${resultCount} of ${totalCount} referrals`}
            </p>
            {isFetching && referrals.length > 0 ? (
              <span className="text-xs text-neutral-500">Updating…</span>
            ) : null}
          </div>
          <ModuleTableCard
            minWidth="min-w-[640px]"
            refreshing={isFetching && referrals.length > 0}
            footer={
              <TablePagination
                currentPage={sentPage}
                totalPages={sentTotalPages}
                onPageChange={setSentPage}
              />
            }
          >
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="whitespace-nowrap px-4 py-3">Referral No.</th>
                <th className="whitespace-nowrap px-4 py-3">Patient</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F8FAFC]">
              {filteredReferrals.length > 0 ? (
                paginatedReferrals.map((referral) => {
                  const patientName = getReferralPatientName(referral);
                  const destinationFacility = getReferralDestination(referral);
                  const service = getReferralClassification(referral);
                  const trackingId = referral.trackingId || referral.id || "";
                  const submittedDate = getSubmittedDate(referral);
                  const priority = normalizeAttention(getReferralUrgency(referral));

                  return (
                    <tr
                      key={trackingId || referral.id}
                      className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="min-w-0 py-0.5">
                          <p className="truncate font-mono text-[12px] font-semibold tabular-nums text-[#B91C1C]">
                            {trackingId || "—"}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-[#9CA3AF]">
                            {submittedDate
                              ? formatDate(submittedDate, submittedDate)
                              : "Date not recorded"}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <div className="min-w-0 py-0.5">
                          <p className="truncate text-[13px] font-semibold text-[#111827]">
                            {patientName}
                          </p>
                          <p className="mt-1 truncate text-[11px] leading-snug text-[#6B7280]">
                            {destinationFacility}
                            <span className="text-[#D0D5DD]"> · </span>
                            {service}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <div className="min-w-0 py-0.5">
                          <StatusBadge
                            status={referral.statusDisplay || referral.status}
                          />
                          <p className="mt-1 text-[11px] leading-snug text-[#9CA3AF]">
                            {priority} priority
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle text-right">
                        <div className="inline-flex items-center justify-end">
                          <ActionMenu
                            title={patientName}
                            subtitle={trackingId}
                            viewLink={`/bhc/referrals/${trackingId}`}
                            viewLabel="View Details"
                            actions={[
                              {
                                label: "Copy Referral No.",
                                disabled: !trackingId,
                                onClick: () => {
                                  if (trackingId) void copyText(String(trackingId));
                                },
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <DataTableEmptyState
                  colSpan={4}
                  icon={<ClipboardList size={20} className="text-[#94A3B8]" />}
                  title={
                    narrowed ? "No referrals match" : "No referrals yet."
                  }
                  description={
                    narrowed
                      ? "Try a different search, or clear filters to see the full list again."
                      : "Tap Refer to start."
                  }
                  action={
                    narrowed ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear search and filters
                      </Button>
                    ) : null
                  }
                />
              )}
            </tbody>
          </ModuleTableCard>
          </>
        )}
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function StatusBadge({ status }) {
  const displayStatus = formatReferralStatus(status);
  const map = {
    "Pending RHU Review": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Received by RHU": "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Under Assessment": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        map[displayStatus] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {displayStatus}
    </span>
  );
}

function UrgencyBadge({ urgency }) {
  const attention = normalizeAttention(urgency);

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${getAttentionBadgeClass(
        attention,
      )}`}
    >
      {attention}
    </span>
  );
}
