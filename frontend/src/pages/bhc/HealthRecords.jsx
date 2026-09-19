import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router";
import ModalShell, { ModalButton } from "../../components/common/modals/ModalShell";
import { listHealthRecordDrafts, discardHealthRecordDraft } from "../../services/healthRecordDraftService";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  ModuleToolbar,
  SoftLoadingArea,
} from "../../components/common";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { isConnectionError } from "../../services/apiClient";
import { getHealthRecords } from "../../services/healthRecordService";
import { getReferrals } from "../../services/referrals";
import { formatPatientName } from "../../utils/formatters";
import {
  createActiveFilterChips,
  isDateInPreset,
} from "../../utils/filterUtils";
import {
  formatServiceType,
  getRecordId,
  getRecordParentId,
  isFollowUpVisitRecord,
} from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const DEFAULT_FILTERS = {
  search: "",
  classification: "",
  visitType: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
};

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function normalizeVisitType(record = {}) {
  return isFollowUpVisitRecord(record)
    ? "follow_up_visit"
    : "initial_consultation";
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
  const navigate = useNavigate();
  const [unfinishedDraft, setUnfinishedDraft] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState("");

  async function startRecord() {
    if (draftBusy) return;
    setDraftBusy(true);
    setDraftError("");
    try {
      const drafts = await listHealthRecordDrafts();
      const latest = [...drafts].sort((a, b) => new Date(b.lastSavedAt) - new Date(a.lastSavedAt))[0];
      if (latest) setUnfinishedDraft(latest);
      else navigate("/bhc/health-records/add");
    } catch {
      setDraftError("Unable to check unfinished consultations. Please try Add Health Record again.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function discardAndStart() {
    setDraftBusy(true);
    setDraftError("");
    try {
      await discardHealthRecordDraft(unfinishedDraft.id);
      navigate("/bhc/health-records/add");
    } catch {
      setDraftError("Unable to discard this draft. Please try again.");
    } finally {
      setDraftBusy(false);
    }
  }
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: recordsData = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
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
          parentHealthRecordId: getRecordParentId(record),
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
        .reverse()
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    },
    retry: false,
  });

  const records = useMemo(
    () => (Array.isArray(recordsData) ? recordsData : []),
    [recordsData],
  );
  const loading = isLoading && records.length === 0;
  const hasLoadError = Boolean(loadError) && !loading;

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
    const matchesVisitType =
      !filters.visitType || record.visitType === filters.visitType;
    const matchesVisitDate = isDateInPreset(record.date, filters.dateRange, {
      from: filters.dateFrom,
      to: filters.dateTo,
    });

    return (
      matchesSearch &&
      matchesClassification &&
      matchesVisitType &&
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
        {
          value: "Hypertension / Diabetic Monitoring",
          label: "Hypertension / Diabetic Monitoring",
        },
        { value: "Family Planning", label: "Family Planning" },
        { value: "TB DOTS / TB Monitoring", label: "TB DOTS / TB Monitoring" },
      ],
    },
    {
      key: "visitType",
      label: "Visit Type",
      value: filters.visitType,
      resetValue: "",
      type: "select",
      placeholder: "All Visit Types",
      options: [
        { value: "initial_consultation", label: "Initial Consultation" },
        { value: "follow_up_visit", label: "Follow-up Visit" },
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

  if (hasLoadError) {
    return (
      <DashboardLayout role="bhc" title="Health Records">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={loadError?.isTimeout ? "timeout" : isConnectionError(loadError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      <SoftLoadingArea
        isLoading={loading}
        message="Loading health records..."
        scope="area"
        className="space-y-4"
      >
        {!loading ? (
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
            onPrimaryAction={startRecord}
            disabled={draftBusy}
            primaryActionLabel={draftBusy ? "Checking drafts..." : "Add Health Record"}
            primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
          />
        ) : null}

        {!loading && (
          <HealthRecordsTable
            records={filteredRecords}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            refreshing={isFetching && records.length > 0}
          />
        )}
      </SoftLoadingArea>
      {draftError && !unfinishedDraft && <p role="alert" className="mt-3 text-sm text-red-700">{draftError}</p>}
      <ModalShell open={Boolean(unfinishedDraft)} title="Unfinished Consultation" size="sm"
        onClose={() => { setUnfinishedDraft(null); setDraftError(""); }} closeDisabled={draftBusy}
        footer={<>
          <ModalButton disabled={draftBusy} onClick={() => { setUnfinishedDraft(null); setDraftError(""); }}>Cancel</ModalButton>
          <ModalButton disabled={draftBusy} onClick={discardAndStart}>Discard &amp; Start New</ModalButton>
          <ModalButton variant="primary" primary disabled={draftBusy} onClick={() => navigate(`/bhc/health-records/add?draftId=${encodeURIComponent(unfinishedDraft.id)}`)}>Continue Draft</ModalButton>
        </>}>
        <div className="space-y-2 text-[13px] text-slate-600">
          <p>You have an unfinished consultation:</p>
          <p className="font-semibold text-slate-900">{unfinishedDraft?.patient.label} · #{unfinishedDraft?.patient.id}</p>
          <p className="text-xs text-slate-400">Last edited: {unfinishedDraft?.lastSavedAt ? new Date(unfinishedDraft.lastSavedAt).toLocaleString("en-PH") : "Not recorded"}</p>
          <p>Would you like to continue this draft or discard it and start a new health record?</p>
          {draftError && <p role="alert" className="text-red-700">{draftError}</p>}
        </div>
      </ModalShell>
    </DashboardLayout>
  );
}
