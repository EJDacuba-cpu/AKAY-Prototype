import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, Plus } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { getHealthRecords } from "../../services/healthRecordService";
import { getReferrals } from "../../services/referrals";

const DEFAULT_FILTERS = {
  search: "",
  status: "",
  classification: "",
  date: "",
};

export default function HealthRecords() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchRecords() {
      try {
        setLoading(true);
        const [data, referrals] = await Promise.all([
          getHealthRecords(),
          getReferrals(),
        ]);
        const rawData = Array.isArray(data) ? data : [];

        const normalizedRecords = rawData.map((record) => {
          const recordId =
            record.id ||
            record.trackingId ||
            Math.random().toString(36).substr(2, 9);
          const linkedReferral = referrals.find((referral) =>
            [
              referral.healthRecordId,
              referral.recordId,
              referral.sourceRecordId,
              referral.consultationRecordId,
            ]
              .filter(Boolean)
              .includes(recordId),
          );

          return {
            ...record,
            id: recordId,
            trackingId: record.trackingId || record.id || "No Tracking ID",
            patientName:
              record.patientName ||
              `${record.firstName || ""} ${record.lastName || ""}`.trim(),
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
            status:
              record.status ||
              (record.needsReferral === "yes"
                ? "Routine Monitoring"
                : record.followUpStatus || "Completed"),
            followUp: record.followUpDate || "No Follow-up",
            date: record.dateOfVisit || record.date || "No Date",
            linkedReferralTrackingId:
              linkedReferral?.trackingId ||
              (!record.isFollowUp
                ? record.linkedTrackingId || record.referralTrackingId
                : "") ||
              "",
          };
        });

        setRecords(normalizedRecords.reverse());
      } catch (error) {
        console.error("Failed to fetch records:", error);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    fetchRecords();
  }, []);

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
    const matchesStatus = !filters.status || record.status === filters.status;
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;
    const matchesDate =
      !filters.date || (record.date && record.date.includes(filters.date));

    return (
      matchesSearch && matchesStatus && matchesClassification && matchesDate
    );
  });

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.status && { key: "status", label: filters.status },
    filters.classification && {
      key: "classification",
      label: filters.classification,
    },
    filters.date && { key: "date", label: filters.date },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const dropdownFilters = [
    {
      key: "status",
      label: "Record Type / Status",
      value: filters.status,
      options: [
        { value: "", label: "All Status" },
        { value: "Routine Monitoring", label: "Monitoring" },
        { value: "Follow-Up", label: "Follow-Up" },
        { value: "For-Referral", label: "Referral" },
        { value: "Completed", label: "Completed" },
      ],
    },
    {
      key: "classification",
      label: "Patient Classification",
      value: filters.classification,
      options: [
        { value: "", label: "All Classifications" },
        { value: "General Consultation", label: "General Consultation" },
        { value: "Maternal", label: "Maternal" },
        { value: "Immunization", label: "Immunization" },
        { value: "Senior Citizen", label: "Senior Citizen" },
      ],
    },
    {
      key: "date",
      label: "Date of Visit",
      value: filters.date,
      type: "date",
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
    updateFilter(key, "");
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Records">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#0B2E59]" />
            <p className="text-[12px] font-medium text-slate-400">
              Loading health records...
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) => updateFilter("search", value)}
        searchPlaceholder="Search by patient name or record type..."
        chip={`● ${filteredRecords.length.toLocaleString()} Records`}
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={applyDropdownFilters}
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
        actions={
          <Link
            to="/bhc/health-records/add"
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Health Record
          </Link>
        }
      />

      <div className="min-w-0">
        {filteredRecords.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-24 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
              <FileText size={20} className="text-[#94A3B8]" />
            </div>
            <p className="text-[13px] font-semibold text-[#334155]">
              No Matching Records
            </p>
            <p className="mt-1 text-[11.5px] text-[#94A3B8]">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          <HealthRecordsTable
            records={filteredRecords}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
