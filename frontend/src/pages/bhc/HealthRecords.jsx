import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  Search,
  FileText,
  CheckCircle2,
  Activity,
  ClipboardList,
  RotateCcw,
  ArrowRightLeft,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { getHealthRecords } from "../../services/healthRecordService";

const STATUS_TABS = [
  { key: "", label: "All Records", icon: ClipboardList },
  { key: "Routine Monitoring", label: "Monitoring", icon: Activity },
  { key: "Follow-Up", label: "Follow-Up", icon: RotateCcw },
  { key: "For-Referral", label: "Referral", icon: ArrowRightLeft },
  { key: "Completed", label: "Completed", icon: CheckCircle2 },
];

export default function HealthRecords() {
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    classification: "",
    date: "",
  });

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchRecords() {
      try {
        setLoading(true);
        const data = await getHealthRecords();
        const rawData = Array.isArray(data) ? data : [];

        const normalizedRecords = rawData.map((record) => ({
          ...record,
          id:
            record.id ||
            record.trackingId ||
            Math.random().toString(36).substr(2, 9),
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
        }));

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

  // ── Filtering Logic ──────────────────────────────────────────────
  const baseFiltered = records.filter((record) => {
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
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;
    const matchesDate =
      !filters.date || (record.date && record.date.includes(filters.date));
    return matchesSearch && matchesClassification && matchesDate;
  });

  const tabCounts = STATUS_TABS.reduce((acc, tab) => {
    acc[tab.key] =
      tab.key === ""
        ? baseFiltered.length
        : baseFiltered.filter((r) => r.status === tab.key).length;
    return acc;
  }, {});

  const filteredRecords = baseFiltered.filter(
    (record) => !filters.status || record.status === filters.status,
  );

  const stats = {
    total: filteredRecords.length,
    monitoring: filteredRecords.filter((r) => r.status === "Follow-Up").length,
    referral: filteredRecords.filter((r) => r.status === "Routine Monitoring")
      .length,
    completed: filteredRecords.filter((r) => r.status === "Completed").length,
    immunization: filteredRecords.filter(
      (r) => r.classification?.toLowerCase() === "immunization",
    ).length,
  };

  const activeFilters = [
    filters.search && { key: "search", label: filters.search },
    filters.classification && {
      key: "classification",
      label: filters.classification,
    },
    filters.status && { key: "status", label: filters.status },
    filters.date && { key: "date", label: filters.date },
  ].filter(Boolean);

  const hasActiveFilters = activeFilters.length > 0;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleTabChange = (statusKey) => {
    setFilters((prev) => ({ ...prev, status: statusKey }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "", classification: "", date: "" });
    setCurrentPage(1);
  };

  const removeFilter = (key) => {
    handleFilterChange(key, "");
  };

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Records">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#0B2E59]" />
            <p className="text-[12px] font-medium text-slate-400">
              Loading health records…
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Search Patient / Record ID / Consultation
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
              />
              <input
                type="text"
                placeholder="Search patient, record ID, or consultation..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
              />
            </div>
          </div>

          <div className="w-full xl:w-[190px]">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Classification
            </label>
            <select
              value={filters.classification}
              onChange={(e) =>
                handleFilterChange("classification", e.target.value)
              }
              className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
            >
              <option value="">All Classifications</option>
              <option value="Maternal">Maternal</option>
              <option value="Immunization">Immunization</option>
              <option value="Senior Citizen">Senior Citizen</option>
            </select>
          </div>

          <div className="w-full xl:w-[170px]">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Date
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => handleFilterChange("date", e.target.value)}
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
            />
          </div>

          <Link
            to="/bhc/health-records/add"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Consultation
          </Link>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => removeFilter(filter.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
              >
                {filter.label}
                <X size={10} />
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#0B2E59]"
              >
                <RotateCcw size={11} />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1">
        {STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filters.status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
                isActive
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Icon size={13} className={isActive ? "text-[#0B2E59]" : ""} />
              {tab.label}
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                  isActive
                    ? "bg-[#0B2E59]/10 text-[#0B2E59]"
                    : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        {filteredRecords.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-24 text-center shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9] mx-auto">
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
