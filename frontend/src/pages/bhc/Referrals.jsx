import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ActionMenu,
  ConnectionErrorState,
  DataTableEmptyState,
  ModuleToolbar,
  ModuleTableCard,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import { isConnectionError } from "../../services/apiClient";
import { getReferrals } from "../../services/referrals";
import {
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

const DEFAULT_FILTERS = {
  search: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  status: "All",
  urgency: "All Urgency",
  receivingFacility: "",
};

const ITEMS_PER_PAGE = 5;

function getReferralClassification(referral) {
  return formatDisplayValue(
    referral.classification || referral.referralCategory || referral.category,
    "General Consultation",
  );
}

function getReferralUrgency(referral) {
  const raw =
    referral.urgency ||
    referral.priorityLevel ||
    referral.priority ||
    "Non-Urgent";

  const mapLegacyToNew = {
    High: "Emergency",
    Medium: "Urgent",
    Normal: "Non-Urgent",
  };

  return formatDisplayValue(mapLegacyToNew[raw] || raw, "Non-Urgent");
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
  if (selectedStatus === "For Monitoring") {
    return (
      referralStatus === "For Monitoring" ||
      referralStatus === "Under Assessment"
    );
  }
  if (selectedStatus === "Done") {
    return referralStatus === "Completed" || referralStatus === "Done";
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

export default function Referrals() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

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

  const referrals = useMemo(
    () => (Array.isArray(referralsData) ? referralsData : []),
    [referralsData],
  );
  const loading = isLoading && referrals.length === 0;
  const hasLoadError = Boolean(loadError) && !loading;

  const receivingFacilityOptions = useMemo(
    () =>
      Array.from(
        new Set(referrals.map(getReferralDestination).filter(Boolean)),
      ).sort(),
    [referrals],
  );

  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      const searchTerm = filters.search.toLowerCase();
      const patientName = getReferralPatientName(referral).toLowerCase();
      const matchesSearch =
        !filters.search ||
        patientName.includes(searchTerm) ||
        referral.trackingId?.toLowerCase().includes(searchTerm) ||
        referral.chiefComplaint?.toLowerCase().includes(searchTerm) ||
        referral.concern?.toLowerCase().includes(searchTerm);

      const matchesStatus = matchesReferralStatus(
        referral.status,
        filters.status,
      );
      const matchesUrgency =
        filters.urgency === "All Urgency" ||
        getReferralUrgency(referral) === filters.urgency;
      const matchesFacility =
        !filters.receivingFacility ||
        getReferralDestination(referral) === filters.receivingFacility;
      const matchesDate = isDateInPreset(
        getSubmittedDate(referral),
        filters.dateRange,
        {
          from: filters.dateFrom,
          to: filters.dateTo,
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
  }, [referrals, filters]);

  const totalPages = Math.ceil(filteredReferrals.length / ITEMS_PER_PAGE);
  const paginatedReferrals = filteredReferrals.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const dropdownFilters = [
    {
      key: "dateRange",
      label: "Referral Date",
      value: filters.dateRange,
      dateFromValue: filters.dateFrom,
      dateToValue: filters.dateTo,
      resetValue: "all",
      type: "datePresets",
      presets: [
        { value: "all", label: "All dates" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "this_month", label: "This month" },
        { value: "custom", label: "Custom date" },
      ],
    },
    {
      key: "status",
      label: "Status",
      value: filters.status,
      resetValue: "All",
      type: "select",
      options: [
        "All",
        "Pending",
        "Received",
        "For Monitoring",
        "Done",
        "No-Show",
      ],
    },
    {
      key: "urgency",
      label: "Urgency",
      value: filters.urgency,
      resetValue: "All Urgency",
      type: "select",
      options: ["All Urgency", "Non-Urgent", "Urgent", "Emergency"],
    },
    {
      key: "receivingFacility",
      label: "Receiving Facility",
      value: filters.receivingFacility,
      resetValue: "",
      type: "select",
      placeholder: "All Facilities",
      options: receivingFacilityOptions,
    },
  ];
  const activeFilters = createActiveFilterChips(filters, dropdownFilters);
  const activeFilterCount = activeFilters.length;

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      dateRange: "all",
      dateFrom: "",
      dateTo: "",
      status: "All",
      urgency: "All Urgency",
      receivingFacility: "",
    };
    if (key === "dateRange") {
      setFilters((prev) => ({
        ...prev,
        dateRange: "all",
        dateFrom: "",
        dateTo: "",
      }));
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  if (hasLoadError) {
    return (
      <DashboardLayout role="bhc" title="Referrals">
        <ConnectionErrorState
          fullPage
          title={isConnectionError(loadError) ? "Connection Lost" : "Unable to Load Data"}
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={loadError?.isTimeout ? "timeout" : isConnectionError(loadError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Referrals">
      <SoftLoadingArea
        isLoading={loading}
        message="Loading referrals..."
        scope="area"
      >
        {!loading ? (
          <ModuleToolbar
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter("search", value)}
            searchPlaceholder="Search by patient, ID, or complaint..."
            filters={dropdownFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={(nextFilters) =>
              setFilters((prev) => ({ ...prev, ...nextFilters }))
            }
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            filterDescription="Narrow the referrals list."
          />
        ) : null}

        {loading ? null : (
        <ModuleTableCard
          title="Referrals"
          count={filteredReferrals.length}
          subtitle="Track sent referrals and RHU updates."
          minWidth="min-w-[1100px]"
          refreshing={isFetching && referrals.length > 0}
          footer={
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          }
        >
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="whitespace-nowrap px-4 py-3">ID</th>
                <th className="whitespace-nowrap px-4 py-3">Patient</th>
                <th className="whitespace-nowrap px-4 py-3">RHU</th>
                <th className="whitespace-nowrap px-4 py-3">Classification</th>
                <th className="whitespace-nowrap px-4 py-3">Urgency</th>
                <th className="whitespace-nowrap px-4 py-3">Date</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F8FAFC]">
              {filteredReferrals.length > 0 ? (
                paginatedReferrals.map((referral) => {
                  const patientName = getReferralPatientName(referral);
                  const destinationFacility = getReferralDestination(referral);

                  return (
                  <tr
                    key={referral.trackingId || referral.id}
                    className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#B91C1C] transition-colors duration-200 group-hover:border-[#FECACA] group-hover:bg-[#FEF2F2]">
                        {referral.trackingId}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#111827]">
                          {patientName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {referral.ageSex}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-[13px] text-[#6B7280]">
                      {destinationFacility}
                    </td>

                    <td className="px-4 py-3.5">
                      <ClassificationBadge
                        classification={getReferralClassification(referral)}
                      />
                    </td>

                    <td className="px-4 py-3.5">
                      <UrgencyBadge urgency={getReferralUrgency(referral)} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                      {getSubmittedDate(referral) || "—"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusBadge status={referral.statusDisplay || referral.status} />
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <ActionMenu
                        title={patientName}
                        subtitle={referral.trackingId}
                        viewLink={`/bhc/referrals/${
                          referral.trackingId || referral.id
                        }`}
                        viewLabel="View Referral"
                      />
                    </td>
                  </tr>
                  );
                })
              ) : (
                <DataTableEmptyState
                  colSpan={8}
                  icon={<ClipboardList size={20} className="text-[#94A3B8]" />}
                  title="No referrals yet."
                  description="Tap Refer to start."
                />
              )}
            </tbody>
        </ModuleTableCard>
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
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Received by RHU": "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Under Assessment": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Done: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
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

function ClassificationBadge({ classification }) {
  const map = {
    "General Consultation": "bg-slate-100 text-slate-700",
    "Maternal Care": "bg-pink-50 text-pink-700",
    Maternal: "bg-pink-50 text-pink-700",
    Immunization: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[classification] || "bg-slate-100 text-slate-700"
      }`}
    >
      {classification}
    </span>
  );
}

function UrgencyBadge({ urgency }) {
  const map = {
    Emergency: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    Urgent: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Non-Urgent": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
        map[urgency] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {urgency}
    </span>
  );
}
