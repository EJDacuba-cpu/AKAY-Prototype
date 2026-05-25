import { Link } from "react-router";
import { Plus, Users, HeartPulse, Baby } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import StatCard from "../../components/common/cards/StatsCard";
import PatientFilters from "../../components/features/patients/PatientFilters";
import PatientsTable from "../../components/features/patients/PatientsTable";
import usePatients from "../../hooks/usePatients";
import { stagger } from "../../utils/animation";

export default function PatientsModule() {
  /* Patients Hook */
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

  return (
    <DashboardLayout role="bhc" title="Patients">
      {/* Header */}
      <div
        className="anim-fade-up mb-8 flex items-start justify-between gap-4"
        style={stagger(0)}
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06]">
            <Users size={20} className="text-[#0B2E59]" />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
              Patients
            </h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              Manage patient profiles registered in the Barangay Health Center.
            </p>
          </div>
        </div>

        {/* Add Button */}
        <Link
          to="/bhc/patients/add"
          className="
            group flex items-center gap-2
            rounded-xl
            bg-[#0B2E59]
            px-5 py-2.5
            text-xs font-semibold text-white
            shadow-md shadow-[#0B2E59]/15
            transition-all duration-300
            hover:-translate-y-0.5 hover:bg-[#092347] hover:shadow-lg hover:shadow-[#0B2E59]/25
            active:scale-[0.98]
          "
          style={stagger(1)}
        >
          <Plus
            size={15}
            className="transition-transform duration-300 group-hover:rotate-90"
          />
          Add Patient
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Registered Patients"
          value={String(patients.length)} // Pinalitan ng total patients imbis na filtered paginated length
          icon={<Users size={16} />}
          color="navy"
          delay={2}
        />

        <StatCard
          title="Senior Citizens"
          value={String(stats.seniorCitizens)}
          icon={<Users size={16} />}
          color="amber"
          delay={3}
        />

        <StatCard
          title="Immunization"
          value={String(stats.children)}
          icon={<Baby size={16} />}
          color="slate"
          delay={4}
        />

        <StatCard
          title="Maternal"
          value={String(stats.pregnantPatients)}
          icon={<HeartPulse size={16} />}
          color="blue"
          delay={5}
        />
      </div>

      {/* Filters Area */}
      <div className="anim-fade-up" style={stagger(6)}>
        <PatientFilters filters={filters} setFilters={setFilters} />
      </div>

      {/* Table & Pagination Blocks (Palaging visible para hindi maglaho ang pagination controls) */}
      <div className="anim-fade-up mt-6" style={stagger(7)}>
        <PatientsTable
          patients={paginatedPatients}
          loading={loading}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />
      </div>

      {/* Optional: Clear Filters helper link sa ilalim kung walang lumabas na resulta */}
      {paginatedPatients.length === 0 && !loading && (
        <div className="text-center mt-4 anim-fade-up">
          <button
            onClick={() =>
              setFilters({
                search: "",
                sex: "All",
                type: "All Patients",
              })
            }
            className="text-xs font-semibold text-[#2563EB] hover:underline"
          >
            Clear current filters to view records
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}



