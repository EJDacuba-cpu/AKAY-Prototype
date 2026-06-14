import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import TableSkeleton from "../../components/common/loading/TableSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import {
  formatDisplayValue,
  formatPatientName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const PER_PAGE = 8;

const DEFAULT_FILTERS = {
  search: "",
  status: "",
  classification: "",
  date: "",
};

export default function RHUHealthRecords() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  const {
    data: recordsData = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.healthRecords("rhu"),
    queryFn: async () => {
      const data = await getRhuHealthRecords();
      const rawData = Array.isArray(data) ? data : [];

      return rawData
        .map((record) => {
        const recordId =
          record.id ||
          record.recordId ||
          record._id ||
          record.trackingId ||
          `RHU-HR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        return {
          ...record,
          id: recordId,
          trackingId: record.trackingId || recordId,
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
          status: normalizeHealthRecordStatus(
            record.followUpStatus || record.status || record.recordStatus,
          ),
          followUp: record.followUpDate || "No Follow-up",
          date:
            record.dateOfVisit ||
            record.visitDate ||
            record.date ||
            record.createdAt ||
            "No Date",
          provider: formatUserName(
            record.attendingStaff ||
              record.recordedBy ||
              record.createdBy ||
              record.created_by ||
              record.provider ||
              record.practitioner,
            "RHU Staff",
          ),
        };
      })
        .reverse();
    },
  });

  const records = Array.isArray(recordsData) ? recordsData : [];
  const loading = isLoading && records.length === 0;

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
      record.status,
      record.provider,
      record.date,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !searchLower || matchesPatientName || searchText.includes(searchLower);
    const matchesStatus = !filters.status || record.status === filters.status;
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;
    const matchesDate =
      !filters.date || normalizeDate(record.date) === filters.date;

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
        { value: "Routine Monitoring", label: "Routine Monitoring" },
        { value: "Follow-up Required", label: "Follow-up Required" },
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

  return (
    <DashboardLayout role="rhu" title="Health Records">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) => updateFilter("search", value)}
        searchPlaceholder="Search by patient name or record type..."
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

      <div className="min-w-0">
        <RefreshingIndicator
          show={isFetching && !loading}
          label="Refreshing health records..."
          className="mb-3"
        />
        {loading ? (
          <TableSkeleton columns={7} rows={8} label="Loading health records..." />
        ) : filteredRecords.length === 0 ? (
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
          <RHUHealthRecordsTable
            records={filteredRecords}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function RHUHealthRecordsTable({
  records,
  currentPage,
  setCurrentPage,
  openMenuId,
  setOpenMenuId,
}) {
  const totalPages = Math.max(1, Math.ceil(records.length / PER_PAGE));
  const startRecord =
    records.length === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1;
  const endRecord = Math.min(currentPage * PER_PAGE, records.length);
  const paginatedRecords = records.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, setCurrentPage, totalPages]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Record ID</th>
              <th className="whitespace-nowrap px-4 py-3">Patient</th>
              <th className="whitespace-nowrap px-4 py-3">Record Type</th>
              <th className="whitespace-nowrap px-4 py-3">Date of Visit</th>
              <th className="whitespace-nowrap px-4 py-3">Provider</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6]">
            {paginatedRecords.map((record) => (
              <tr
                key={record.id}
                className="transition-colors hover:bg-[#F9FAFB]"
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-mono text-[11px] font-semibold text-[#B91C1C]">
                    {record.trackingId || record.id}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-medium text-[#1F2937]">
                  <Link
                    to={`/rhu/health-records/${record.id}`}
                    className="transition-colors hover:text-[#B91C1C]"
                  >
                    {formatPatientName(record.patientName, "Unnamed Patient")}
                  </Link>
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                    {record.classification}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-[#6B7280]">
                  {formatDisplayDate(record.date)}
                </td>

                <td className="max-w-[190px] truncate px-4 py-3 text-[#6B7280]">
                  {record.provider || "RHU Staff"}
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={record.status} />
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
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">
            Showing{" "}
            <span className="font-medium text-[#0F172A]">{startRecord}</span> to{" "}
            <span className="font-medium text-[#0F172A]">{endRecord}</span> of{" "}
            <span className="font-medium text-[#0F172A]">{records.length}</span>{" "}
            records
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#94A3B8] transition hover:border-[#94A3B8] hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                    pageNumber === currentPage
                      ? "bg-[#B91C1C] text-white shadow-sm"
                      : "text-[#475569] hover:bg-white"
                  }`}
                >
                  {pageNumber}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#94A3B8] transition hover:border-[#94A3B8] hover:text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = normalizeHealthRecordStatus(status);
  const toneMap = {
    "Routine Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Follow-up Required": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
        toneMap[normalized] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {normalized}
    </span>
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
            className="fixed z-[9999] w-48 origin-top-right overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
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
                to={`/rhu/health-records/add?recordId=${record.id}&mode=follow-up`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                <FilePlus2 size={14} className="text-[#9CA3AF]" />
                Add Follow-up Record
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

function normalizeHealthRecordStatus(status) {
  const value = String(status || "").trim();

  if (!value) return "Routine Monitoring";

  if (["Follow-up", "Follow Up", "Follow-up Required"].includes(value)) {
    return "Follow-up Required";
  }

  if (["Completed", "Complete", "Recovered", "Closed"].includes(value)) {
    return "Completed";
  }

  if (
    ["For Monitoring", "Active", "Monitoring", "For Referral"].includes(value)
  ) {
    return "Routine Monitoring";
  }

  return value;
}

function normalizeDate(value) {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value || value === "No Date") return "No Date";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
