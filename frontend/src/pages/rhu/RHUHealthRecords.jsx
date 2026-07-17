import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  DataTableEmptyState,
  ListToolbar,
  ModuleTableCard,
  PageStateWrapper,
  TablePagination,
} from "../../components/common";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import {
  formatDisplayValue,
  formatDate,
  formatPatientName,
} from "../../utils/formatters";
import {
  getRecordDateValue,
  getRecordId,
  getRecordIdLabel,
  getServiceTypeLabel,
} from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const PER_PAGE = 8;

const DEFAULT_FILTERS = {
  search: "",
  classification: "",
  date: "",
};

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

export default function RHUHealthRecords() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  const {
    data: recordsData = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.healthRecords("rhu"),
    queryFn: async () => {
      const data = await getRhuHealthRecords();
      const rawData = Array.isArray(data) ? data : [];

      return rawData
        .map((record) => {
        const recordId = getRecordId(record);

        return {
          ...record,
          id: recordId,
          trackingId: record.trackingId || recordId,
          visitType: normalizeVisitType(record),
          parentHealthRecordId:
            record.parentHealthRecordId ||
            record.parent_health_record_id ||
            record.previousRecordId ||
            "",
          patientName: formatPatientName(
            record.patientName || record.patient || record,
            "Unnamed Patient",
          ),
          classification:
            record.patientClassification ||
            record.classification ||
            record.category ||
            inferClassification(record),
          concern: formatDisplayValue(
            record.chiefComplaint ||
              record.concern ||
              record.summaryOfPresentIllness ||
              record.diagnosis,
            "General Consultation",
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
        };
      })
        .reverse();
    },
    retry: false,
  });

  const records = Array.isArray(recordsData) ? recordsData : [];
  const loading = isLoading && records.length === 0;
  const refreshing = isFetching && records.length > 0;

  useEffect(() => {
    if (loading || refreshing) setOpenMenuId(null);
  }, [loading, refreshing]);

  useEffect(() => {
    function fetchRecords() {
      refetch();
    }

    window.addEventListener("akay:rhu-health-records-updated", fetchRecords);
    window.addEventListener("akay:health-records-updated", fetchRecords);

    return () => {
      window.removeEventListener(
        "akay:rhu-health-records-updated",
        fetchRecords,
      );
      window.removeEventListener("akay:health-records-updated", fetchRecords);
    };
  }, [refetch]);

  const filteredRecords = records.filter((record) => {
    const searchLower = filters.search.trim().toLowerCase();
    const patientWords = record.patientName?.toLowerCase().split(" ") || [];
    const matchesPatientName = patientWords.some((word) =>
      word.startsWith(searchLower),
    );

    const searchText = [
      record.id,
      record.trackingId,
      record.patientName,
      record.classification,
      record.concern,
      record.date,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !searchLower || matchesPatientName || searchText.includes(searchLower);
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;
    const matchesDate =
      !filters.date || normalizeDate(record.date) === filters.date;

    return (
      matchesSearch && matchesClassification && matchesDate
    );
  });

  const activeFilters = [
    filters.date && { key: "date", label: filters.date },
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
      key: "date",
      label: "Date of Visit",
      value: filters.date,
      type: "date",
    },
    {
      key: "classification",
      label: "Service Type",
      value: filters.classification,
      type: "select",
      options: [
        { value: "", label: "All Service Types" },
        { value: "General Consultation", label: "General Consultation" },
        { value: "Maternal", label: "Maternal" },
        { value: "Immunization", label: "Immunization" },
        { value: "Senior Citizen", label: "Senior Citizen" },
        { value: "Family Planning", label: "Family Planning" },
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
    updateFilter(key, "");
  }

  return (
    <DashboardLayout role="rhu" title="Health Records">
      <PageStateWrapper
        isLoading={loading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={records.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading health records..."
      >
        <div className="space-y-4">
        {!loading && (
          <ListToolbar
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter("search", value)}
            searchPlaceholder="Search by patient name or service type..."
            filters={dropdownFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={applyDropdownFilters}
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            actions={
              <Link
                to="/rhu/health-records/add"
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]"
              >
                <Plus size={14} strokeWidth={2.5} />
                Add Health Record
              </Link>
            }
          />
        )}

        {!loading && (
          <RHUHealthRecordsTable
            records={filteredRecords}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            refreshing={refreshing}
          />
        )}
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function RHUHealthRecordsTable({
  records,
  currentPage,
  setCurrentPage,
  openMenuId,
  setOpenMenuId,
  refreshing,
}) {
  const totalPages = Math.ceil(records.length / PER_PAGE);
  const paginatedRecords = records.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, setCurrentPage, totalPages]);

  return (
    <ModuleTableCard
      title="Recent Health Records"
      subtitle="Saved patient visits grouped by health service."
      minWidth="min-w-[760px]"
      refreshing={refreshing}
      footer={
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      }
    >
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Record ID</th>
              <th className="whitespace-nowrap px-4 py-3">Date of Visit</th>
              <th className="whitespace-nowrap px-4 py-3">Patient</th>
              <th className="whitespace-nowrap px-4 py-3">Service Type</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6]">
            {paginatedRecords.length === 0 ? (
              <DataTableEmptyState
                colSpan={5}
                icon={<FileText size={20} className="text-[#94A3B8]" />}
                title="No Matching Records"
                description="Try adjusting your search or filter criteria."
              />
            ) : (
            paginatedRecords.map((record) => (
              <tr
                key={record.id}
                className="transition-colors hover:bg-[#F9FAFB]"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-[#B91C1C]">
                  {getRecordIdLabel(record)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-[#475569]">
                  {formatDate(getRecordDateValue(record), "Not recorded")}
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <p className="font-medium text-[#1F2937]">
                    {formatPatientName(record.patientName, "Unnamed Patient")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
                    Patient ID #
                    {record.patientId ||
                      record.patient_id ||
                      record.patient?.patientId ||
                      record.patient?.id ||
                      "Not linked"}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                    {getServiceTypeLabel(record)}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <ActionMenu
                    record={record}
                    open={openMenuId === record.id}
                    onToggle={() =>
                      setOpenMenuId(openMenuId === record.id ? null : record.id)
                    }
                    onClose={() => setOpenMenuId(null)}
                  />
                </td>
              </tr>
            ))
            )}
          </tbody>
    </ModuleTableCard>
  );
}

function ActionMenu({ record, open, onToggle, onClose }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 112;
    const padding = 12;

    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;

    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }

    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - 8;
    }

    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return undefined;

    function handleMouseDown(event) {
      if (
        btnRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      onClose();
    }

    function handleWindowChange() {
      onClose();
    }

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open, onClose]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          onToggle();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#4B5563]"
        aria-label={`Open actions for ${record.patientName}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] w-48 origin-top-right overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
            style={{ top: position.top, left: position.left }}
          >
            <div className="py-1">
              <Link
                to={`/rhu/health-records/${record.id}`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                <Eye size={14} className="text-[#9CA3AF]" />
                View Details
              </Link>

              <Link
                to={`/rhu/health-records/${record.id}`}
                state={{ startInEditMode: true }}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                <Pencil size={14} className="text-[#9CA3AF]" />
                Edit Record
              </Link>

            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function inferClassification(record) {
  if (!record) return "General Consultation";

  const source = [
    record.patientClassification,
    record.classification,
    record.category,
    record.concern,
    record.chiefComplaint,
    record.summaryOfPresentIllness,
    record.diagnosis,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    source.includes("maternal") ||
    source.includes("prenatal") ||
    source.includes("pregnan")
  ) {
    return "Maternal";
  }

  if (
    source.includes("immunization") ||
    source.includes("vaccine") ||
    source.includes("vaccination")
  ) {
    return "Immunization";
  }

  if (
    source.includes("senior") ||
    source.includes("hypertension") ||
    source.includes("diabetes")
  ) {
    return "Senior Citizen";
  }

  return "General Consultation";
}

function normalizeDate(value) {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}
