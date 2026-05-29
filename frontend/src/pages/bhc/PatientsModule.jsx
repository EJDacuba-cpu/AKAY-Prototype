import { Link } from "react-router";
import { Plus, Users, UserCheck, HeartPulse, Syringe } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import PatientFilters from "../../components/features/patients/PatientFilters";
import PatientsTable from "../../components/features/patients/PatientsTable";
import usePatients from "../../hooks/usePatients";

const PATIENT_TABS = [
  { key: "All Patients", label: "All Patients", icon: Users },
  { key: "Senior Citizen", label: "Senior Citizens", icon: UserCheck },
  { key: "Maternal", label: "Maternal", icon: HeartPulse },
  { key: "Immunization", label: "Immunization", icon: Syringe },
];

export default function PatientsModule() {
  const {
    patients,
    paginatedPatients,
    loading,
    filters,
    setFilters,
    stats,
    currentPage,
    setCurrentPage,
    totalPages,
  } = usePatients();

  const tabCounts = {
    "All Patients": patients.length,
    "Senior Citizen": stats.seniorCitizens,
    Maternal: stats.pregnantPatients,
    Immunization: stats.children,
  };

  const handleTabChange = (typeKey) => {
    setFilters((prev) => ({ ...prev, type: typeKey }));
  };

  return (
    <DashboardLayout role="bhc" title="Patients">
      <PatientFilters
        filters={filters}
        setFilters={setFilters}
        action={
          <Link
            to="/bhc/patients/add"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Patient
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1">
          {PATIENT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = filters.type === tab.key;
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
                  {(tabCounts[tab.key] || 0).toLocaleString()}
                </span>
              </button>
            );
          })}
      </div>

      <div className="min-w-0">
          {paginatedPatients.length === 0 && !loading ? (
            <div className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-24 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                <Users size={20} className="text-[#94A3B8]" />
              </div>
              <p className="text-[13px] font-semibold text-[#334155]">
                No Matching Patients
              </p>
              <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                Try adjusting your search or filter criteria.
              </p>
              <button
                onClick={() =>
                  setFilters({ search: "", sex: "All", type: "All Patients" })
                }
                className="mt-4 text-[11px] font-semibold text-[#0B2E59] hover:underline"
              >
                Clear current filters
              </button>
            </div>
            </div>
          ) : (
            <PatientsTable
              patients={paginatedPatients}
              loading={loading}
              currentPage={currentPage}
              totalPages={totalPages}
              setCurrentPage={setCurrentPage}
            />
          )}
      </div>
    </DashboardLayout>
  );
}
