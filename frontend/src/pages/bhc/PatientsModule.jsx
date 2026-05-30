import { Link } from "react-router";
import { Plus, Users } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";
import PatientsTable from "../../components/features/patients/PatientsTable";
import usePatients from "../../hooks/usePatients";

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  type: "All Patients",
  barangay: "All Barangays",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};

function uniqueOptions(items, selectors, fallback) {
  const values = items
    .flatMap((item) => selectors.map((selector) => selector(item)))
    .filter(Boolean);

  return [fallback, ...new Set(values)];
}

export default function PatientsModule() {
  const {
    patients,
    filteredPatients,
    paginatedPatients,
    loading,
    filters,
    setFilters,
    currentPage,
    setCurrentPage,
    totalPages,
  } = usePatients();

  const barangayOptions = uniqueOptions(
    patients,
    [(patient) => patient.barangay],
    "All Barangays",
  );

  const civilStatusOptions = uniqueOptions(
    patients,
    [(patient) => patient.civilStatus],
    "All Civil Status",
  );

  const dropdownFilters = [
    {
      key: "barangay",
      label: "Barangay",
      value: filters.barangay,
      options: barangayOptions,
    },
    {
      key: "sex",
      label: "Sex",
      value: filters.sex,
      options: ["All", "Male", "Female"],
    },
    {
      key: "ageGroup",
      label: "Age Group",
      value: filters.ageGroup,
      options: ["All Age Groups", "Child", "Adult", "Senior"],
    },
    {
      key: "civilStatus",
      label: "Civil Status",
      value: filters.civilStatus,
      options: civilStatusOptions,
    },
    {
      key: "dateRegistered",
      label: "Date Registered",
      value: filters.dateRegistered,
      type: "date",
    },
  ];

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.barangay !== "All Barangays" && {
      key: "barangay",
      label: filters.barangay,
    },
    filters.sex !== "All" && { key: "sex", label: filters.sex },
    filters.ageGroup !== "All Age Groups" && {
      key: "ageGroup",
      label: filters.ageGroup,
    },
    filters.civilStatus !== "All Civil Status" && {
      key: "civilStatus",
      label: filters.civilStatus,
    },
    filters.dateRegistered && {
      key: "dateRegistered",
      label: filters.dateRegistered,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      barangay: "All Barangays",
      sex: "All",
      ageGroup: "All Age Groups",
      civilStatus: "All Civil Status",
      dateRegistered: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  return (
    <DashboardLayout role="bhc" title="Patients">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) =>
          setFilters((prev) => ({ ...prev, search: value }))
        }
        searchPlaceholder="Search by name, ID, or barangay..."
        chip={`● ${filteredPatients.length.toLocaleString()} Patients`}
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={applyDropdownFilters}
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
        actions={
          <Link
            to="/bhc/patients/add"
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Patient
          </Link>
        }
      />

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
                type="button"
                onClick={clearFilters}
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
