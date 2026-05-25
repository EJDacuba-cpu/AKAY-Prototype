import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  ClipboardList,
  FileText,
  HeartPulse,
  Clock,
  CheckCircle2,
  Activity,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import StatCard from "../../components/common/cards/StatsCard";
import HealthRecordsTable from "../../components/features/records/HealthRecordsTable";
import { stagger } from "../../utils/animation";
import { getHealthRecords } from "../../services/healthRecordService";
import FilterSelect from "../../components/common/forms/FilterSelect";
import SearchInput from "../../components/common/forms/SearchInput";

export default function HealthRecords() {
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    classification: "",
  });

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. STATE PARA SA PAGINATION NI-SETUP PARA MACLICK ANG PAGE 2
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchRecords() {
      try {
        setLoading(true);
        const data = await getHealthRecords();

        // Siguraduhin na array ang data at i-normalize
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
              ? "Referred"
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

  const filteredRecords = records.filter((record) => {
    const searchLower = filters.search.toLowerCase();

    const patientWords = record.patientName?.toLowerCase().split(" ") || [];

    const matchesPatientName = patientWords.some((word) =>
      word.startsWith(searchLower),
    );

    const matchesSearch =
      matchesPatientName ||
      record.trackingId?.toLowerCase().includes(searchLower) ||
      record.classification?.toLowerCase().includes(searchLower) ||
      record.concern?.toLowerCase().includes(searchLower);

    const matchesStatus = !filters.status || record.status === filters.status;
    const matchesClassification =
      !filters.classification ||
      record.classification === filters.classification;

    return matchesSearch && matchesStatus && matchesClassification;
  });

  const stats = {
    total: filteredRecords.length,

    monitoring: filteredRecords.filter((r) => r.status === "Under Monitoring")
      .length,

    referral: filteredRecords.filter((r) => r.status === "Referred").length,

    completed: filteredRecords.filter((r) => r.status === "Completed").length,

    immunization: filteredRecords.filter(
      (r) => r.classification?.toLowerCase() === "immunization",
    ).length,
  };

  // Helper function para ibalik sa Page 1 ang view tuwing magta-type o magpapalit ng filter options
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Records">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading health records...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Health Records">
      {/* Header */}
      <div
        className="mb-8 flex items-start justify-between gap-4"
        style={stagger(0)}
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06]">
            <ClipboardList size={20} className="text-[#0B2E59]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0B2E59]">Health Records</h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              Accurate patient monitoring and consultation encounters.
            </p>
          </div>
        </div>
        <Link
          to="/bhc/health-records/add"
          className="flex items-center gap-2 rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-[#092347]"
        >
          <Plus size={15} /> Add Consultation
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Visible Records"
          value={String(stats.total)}
          icon={<FileText size={16} />}
          color="navy"
        />
        <StatCard
          title="Under Monitoring"
          value={String(stats.monitoring)}
          icon={<HeartPulse size={16} />}
          color="amber"
        />
        <StatCard
          title="Referred Cases"
          value={String(stats.referral)}
          icon={<Clock size={16} />}
          color="slate"
        />
        <StatCard
          title="Completed"
          value={String(stats.completed)}
          icon={<CheckCircle2 size={16} />}
          color="blue"
        />
        <StatCard
          title="Immunization Visits"
          value={String(stats.immunization)}
          icon={<Activity size={16} />}
          color="emerald"
        />
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchInput
            placeholder="Search patient or Tracking ID..."
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
          />
          <FilterSelect
            label="Classification"
            value={filters.classification}
            onChange={(e) =>
              handleFilterChange("classification", e.target.value)
            }
          >
            <option value="">All Classifications</option>
            <option value="Maternal">Maternal</option>
            <option value="Immunization">Immunization</option>
            <option value="Senior Citizen">Senior Citizen</option>
          </FilterSelect>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="">All Status</option>
            <option value="Referred">Referred</option>
            <option value="Under Monitoring">Under Monitoring</option>
            <option value="Completed">Completed</option>
          </FilterSelect>
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DCE3EA] bg-white px-6 py-16 text-center">
          <h3 className="text-sm font-semibold text-[#0B2E59]">
            No Matching Records
          </h3>
        </div>
      ) : (
        // 2. MAHALAGA: Dito na natin ipinasa ang props papunta sa table component
        <HealthRecordsTable
          records={filteredRecords}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />
      )}
    </DashboardLayout>
  );
}



