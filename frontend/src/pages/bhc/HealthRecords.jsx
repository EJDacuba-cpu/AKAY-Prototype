import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ModuleToolbar, SoftLoadingArea } from "../../components/common";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { getHealthRecords } from "../../services/healthRecordService";
import { getReferrals } from "../../services/referrals";
import {
  formatPatientName,
  normalizeHealthRecordStatus,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const DEFAULT_FILTERS = {
  search: "",
  status: "",
  referral: "",
  classification: "",
  dateRange: "",
  date: "",
};

function getDateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getTodayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function isThisWeek(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date(getTodayValue());
  const firstDay = new Date(today);
  firstDay.setDate(today.getDate() - today.getDay());
  const lastDay = new Date(firstDay);
  lastDay.setDate(firstDay.getDate() + 6);

  return date >= firstDay && date <= lastDay;
}

function isThisMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date(getTodayValue());

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  );
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function normalizeOfficialStatus(status) {
  const normalized = normalizeHealthRecordStatus(status);
  if (normalized === "Follow-up Required") return "Follow-up Required";
  if (normalized === "Completed") return "Completed";
  return "Routine Monitoring";
}

function normalizeVisitType(record = {}) {
  const value = String(record.visitType || record.visit_type || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (
    value === "follow up visit" ||
    value === "follow up" ||
    record.isFollowUp ||
    record.is_follow_up ||
    record.parentHealthRecordId ||
    record.parent_health_record_id ||
    record.previousRecordId ||
    record.previous_record_id
  ) {
    return "follow_up_visit";
  }

  return "initial_consultation";
}

function formatVisitDateFilterLabel(value, customDate) {
  const labels = {
    today: "Visit Date: Today",
    this_week: "Visit Date: This Week",
    this_month: "Visit Date: This Month",
    custom_visit_date: customDate ? `Visit Date: ${customDate}` : "Custom Visit Date",
  };

  return labels[value] || value;
}

function formatReferralFilterLabel(value) {
  const labels = {
    with_referral: "With referral",
    without_referral: "Without referral",
  };

  return labels[value] || value;
}

function getLinkedReferral(record, recordId, referrals) {
  return referrals.find((referral) => {
    const linkedRecordIds = [
      referral.healthRecordId,
      referral.health_record_id,
      referral.recordId,
      referral.record_id,
      referral.sourceRecordId,
      referral.source_record_id,
      referral.consultationRecordId,
      referral.consultation_record_id,
    ].filter(Boolean);

    if (linkedRecordIds.some((id) => sameId(id, recordId))) return true;

    const linkedTrackingId =
      record.linkedTrackingId ||
      record.linked_tracking_id ||
      record.referralTrackingId ||
      record.referral_tracking_id;
    return linkedTrackingId && sameId(linkedTrackingId, referral.trackingId || referral.id);
  });
}

export default function HealthRecords() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: recordsData = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecords("bhc"),
    queryFn: async () => {
      const [data, referrals] = await Promise.all([
          getHealthRecords(),
          getReferrals(),
      ]);
      const rawData = Array.isArray(data) ? data : [];

      return rawData
        .map((record) => {
        const recordId =
          record.id ||
          record.trackingId ||
          Math.random().toString(36).substr(2, 9);
        const linkedReferral = getLinkedReferral(record, recordId, referrals);
        const visitType = normalizeVisitType(record);
        const fallbackReferralTrackingId =
          visitType !== "follow_up_visit"
            ? record.linkedTrackingId ||
              record.linked_tracking_id ||
              record.referralTrackingId ||
              record.referral_tracking_id
            : "";
        const linkedReferralTrackingId =
          linkedReferral?.trackingId || fallbackReferralTrackingId || "";
        const hasLinkedReferral = Boolean(linkedReferral || linkedReferralTrackingId);
        const referralStatus = hasLinkedReferral ? "Referred" : "No Referral";
        return {
          ...record,
          id: recordId,
          trackingId: record.trackingId || record.id || "No Tracking ID",
          patientName: formatPatientName(record.patientName || record.patient || record, "Unnamed Patient"),
          visitType,
          visit_type: visitType,
          parentHealthRecordId:
            record.parentHealthRecordId ||
            record.parent_health_record_id ||
            record.previousRecordId ||
            "",
          classification:
            record.patientClassification ||
            record.classification ||
            record.category ||
            (record.vaccineType
              ? "Immunization"
              : record.aog || record.expectedDeliveryDate
                ? "Maternal"
                : "General Consultation"),
          concern:
            record.chiefComplaint ||
            (record.vaccineType
              ? `${record.vaccineType} - ${record.doseNumber || ""}`
              : "General Consultation"),
          status: normalizeOfficialStatus(
            record.followUpStatus || record.status || "Completed",
          ),
	          date:
	            record.dateOfVisit ||
	            record.date_of_visit ||
	            record.dateRecorded ||
	            record.date_recorded ||
	            record.visitDate ||
	            record.date ||
	            record.createdAt ||
	            record.created_at ||
	            "",
          hasLinkedReferral,
          linkedReferralTrackingId,
          linkedReferralId: linkedReferral?.id || "",
          referralStatus,
          referralDestination:
            linkedReferral?.receivingFacility ||
            linkedReferral?.destinationFacility ||
            linkedReferral?.ruralHealthUnit ||
            linkedReferral?.rural_health_unit ||
            "",
          referralDate:
            linkedReferral?.createdAt ||
            linkedReferral?.dateSubmitted ||
            linkedReferral?.dateOfReferral ||
            linkedReferral?.referralDate ||
            "",
        };
      })
        .reverse();
    },
  });

  const records = useMemo(
    () => (Array.isArray(recordsData) ? recordsData : []),
    [recordsData],
  );
  const loading = isLoading && records.length === 0;

  const filteredRecords = records.filter((record) => {
    const searchLower = filters.search.toLowerCase();
    const patientWords = record.patientName?.toLowerCase().split(" ") || [];
    const matchesPatientName = patientWords.some((word) =>
      word.startsWith(searchLower),
    );

    const matchesSearch =
      !filters.search ||
      matchesPatientName ||
      record.trackingId?.toLowerCase().includes(searchLower) ||
      record.classification?.toLowerCase().includes(searchLower) ||
      record.concern?.toLowerCase().includes(searchLower);
    const visitDate = getDateValue(record.date);
    const today = getTodayValue();
    const matchesStatus = !filters.status || record.status === filters.status;
    const matchesReferral =
      !filters.referral ||
      (filters.referral === "with_referral" && record.hasLinkedReferral) ||
      (filters.referral === "without_referral" && !record.hasLinkedReferral);
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;
    const matchesVisitDate =
      !filters.dateRange ||
      (filters.dateRange === "today" && visitDate === today) ||
      (filters.dateRange === "this_week" && isThisWeek(visitDate)) ||
      (filters.dateRange === "this_month" && isThisMonth(visitDate)) ||
      (filters.dateRange === "custom_visit_date" &&
        Boolean(filters.date) &&
        visitDate === filters.date);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesReferral &&
      matchesClassification &&
      matchesVisitDate
    );
  });

  const activeFilters = [
    filters.dateRange && {
      key: "dateRange",
      label: formatVisitDateFilterLabel(filters.dateRange, filters.date),
    },
    filters.referral && {
      key: "referral",
      label: formatReferralFilterLabel(filters.referral),
    },
    filters.status && { key: "status", label: filters.status },
    filters.classification && {
      key: "classification",
      label: filters.classification,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const dropdownFilters = [
    {
      key: "dateRange",
      label: "Date of Visit",
      value: filters.dateRange,
      type: "datePreset",
      customDateKey: "date",
      customDateValue: "custom_visit_date",
      customDateCurrentValue: filters.date,
      options: [
        { value: "", label: "All dates" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "this_month", label: "This month" },
        { value: "custom_visit_date", label: "Custom date" },
      ],
    },
    {
      key: "referral",
      label: "Referral",
      value: filters.referral,
      type: "referral",
      options: [
        { value: "", label: "All records" },
        { value: "with_referral", label: "With referral" },
        { value: "without_referral", label: "Without referral" },
      ],
    },
    {
      key: "status",
      label: "Status",
      value: filters.status,
      type: "pills",
      options: [
        { value: "", label: "All Status" },
        { value: "Routine Monitoring", label: "Routine Monitoring" },
        { value: "Follow-up Required", label: "Follow-up Required" },
        { value: "Completed", label: "Completed" },
      ],
    },
    {
      key: "classification",
      label: "Classification",
      value: filters.classification,
      type: "select",
      options: [
        { value: "", label: "All Classifications" },
        { value: "General Consultation", label: "General Consultation" },
        { value: "Maternal", label: "Maternal" },
        { value: "Immunization", label: "Immunization" },
        { value: "Senior Citizen", label: "Senior Citizen" },
      ],
    },
  ];

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
    setCurrentPage(1);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  }

  function removeFilter(key) {
    if (key === "dateRange") {
      setFilters((prev) => ({ ...prev, dateRange: "", date: "" }));
      setCurrentPage(1);
      return;
    }

    updateFilter(key, "");
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      <SoftLoadingArea
        isLoading={loading || (isFetching && records.length > 0)}
        message={loading ? "Loading records..." : "Refreshing records..."}
        scope="page"
      >
        {!loading && (
          <ModuleToolbar
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter("search", value)}
            searchPlaceholder="Search by patient or classification..."
            filters={dropdownFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={applyDropdownFilters}
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            filterDescription="Narrow the health records list."
            primaryActionTo="/bhc/health-records/add"
            primaryActionLabel="Add Health Record"
            primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
            disabled={loading || (isFetching && records.length > 0)}
          />
        )}

        {loading ? null : (
          <HealthRecordsTable
            records={filteredRecords}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            refreshing={isFetching && records.length > 0}
          />
        )}
      </SoftLoadingArea>
    </DashboardLayout>
  );
}
