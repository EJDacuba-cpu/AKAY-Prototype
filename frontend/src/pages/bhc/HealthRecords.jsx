import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ModuleToolbar, SoftLoadingArea } from "../../components/common";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { getHealthRecords } from "../../services/healthRecordService";
import { getReferrals } from "../../services/referrals";
import { formatPatientName } from "../../utils/formatters";
import {
  createActiveFilterChips,
  isDateInPreset,
} from "../../utils/filterUtils";
import { formatServiceType, getRecordId } from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const DEFAULT_FILTERS = {
  search: "",
  classification: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
};

function sameId(a, b) {
  return String(a || "") === String(b || "");
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
        const recordId = getRecordId(record);
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
      formatServiceType(record.classification, "").toLowerCase().includes(searchLower) ||
      record.concern?.toLowerCase().includes(searchLower);
    const matchesClassification =
      !filters.classification ||
      formatServiceType(record.classification, "") === filters.classification;
    const matchesVisitDate = isDateInPreset(record.date, filters.dateRange, {
      from: filters.dateFrom,
      to: filters.dateTo,
    });

    return (
      matchesSearch &&
      matchesClassification &&
      matchesVisitDate
    );
  });

  const dropdownFilters = [
    {
      key: "dateRange",
      label: "Date of Visit",
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
      key: "classification",
      label: "Service Type",
      value: filters.classification,
      resetValue: "",
      type: "select",
      placeholder: "All Service Types",
      options: [
        { value: "General Consultation", label: "General Consultation" },
        { value: "Maternal / Prenatal", label: "Maternal / Prenatal" },
        { value: "Child Health / EPI", label: "Child Health / EPI" },
        { value: "NCD Monitoring", label: "NCD Monitoring" },
        { value: "Family Planning", label: "Family Planning" },
        { value: "TB DOTS / TB Monitoring", label: "TB DOTS / TB Monitoring" },
      ],
    },
  ];
  const activeFilters = createActiveFilterChips(filters, dropdownFilters);
  const activeFilterCount = activeFilters.length;

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
      setFilters((prev) => ({
        ...prev,
        dateRange: "all",
        dateFrom: "",
        dateTo: "",
      }));
      setCurrentPage(1);
      return;
    }

    updateFilter(key, "");
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      <SoftLoadingArea
        isLoading={loading}
        message="Loading records..."
        scope="area"
        className="space-y-4"
      >
        {!loading && (
          <ModuleToolbar
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter("search", value)}
            searchPlaceholder="Search by patient or service type..."
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
          />
        )}

        {!loading && (
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
