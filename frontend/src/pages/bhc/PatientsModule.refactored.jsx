/**
 * PatientsModule - Refactored Version
 *
 * Enterprise-grade example of clean architecture:
 * - Uses custom hooks for data management
 * - Table logic handled by useDataTable hook
 * - Services provide data
 * - Components are purely presentational
 * - Pages orchestrate and pass data to components
 */

import { Link, Plus, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { useFetch, useDataTable, useNotification } from "../../hooks";
import DashboardLayout from "../../layouts/DashboardLayout";
import { StatCard, DataTable } from "../../components/organisms";
import { LoadingSpinner, Button, Badge } from "../../components/atoms";
import { EmptyState, FilterBar } from "../../components/molecules";
import { stagger } from "../../utils/animations";
import * as patientService from "../../services/patients";

/**
 * PatientsModule Component
 * Orchestrates patient list with filtering, pagination, and actions
 */
export default function PatientsModule() {
  const navigate = useNavigate();
  const notify = useNotification();

  // Fetch patients using custom hook
  const {
    data: patients = [],
    loading,
    error,
    refetch,
  } = useFetch(() => patientService.getPatients(), []);

  // Table logic (pagination, filtering) using custom hook
  const table = useDataTable(patients, {
    itemsPerPage: 10,
    initialFilters: { search: "", sex: "All", type: "All Patients" },
  });

  // Filter definitions for the filter bar
  const filterDefinitions = [
    {
      key: "search",
      label: "Search",
      type: "text",
      placeholder: "Name, contact...",
    },
    {
      key: "sex",
      label: "Gender",
      type: "select",
      options: [
        { value: "All", label: "All" },
        { value: "Male", label: "Male" },
        { value: "Female", label: "Female" },
      ],
    },
    {
      key: "type",
      label: "Category",
      type: "select",
      options: [
        { value: "All Patients", label: "All Patients" },
        { value: "Pregnant Patient", label: "Pregnant Patient" },
        { value: "Senior Citizen", label: "Senior Citizen" },
        { value: "General Consultation", label: "General Consultation" },
        { value: "Immunization", label: "Immunization" },
      ],
    },
  ];

  // Table columns configuration
  const columns = [
    { key: "name", label: "Patient Name" },
    { key: "ageSex", label: "Age/Sex" },
    { key: "contact", label: "Contact" },
    { key: "type", label: "Category" },
    { key: "lastVisit", label: "Last Visit" },
    { key: "status", label: "Status" },
  ];

  // Table actions (row-level actions)
  const tableActions = [
    {
      label: "View Details",
      onClick: (row) => {
        navigate(`/bhc/patients/${row.id}`);
      },
    },
    {
      label: "Edit",
      onClick: (row) => {
        navigate(`/bhc/patients/${row.id}/edit`);
      },
    },
    {
      label: "Add Record",
      onClick: (row) => {
        navigate(`/bhc/health-records/add?patientId=${row.id}`);
      },
    },
    {
      label: "Delete",
      onClick: (row) => {
        if (window.confirm("Are you sure?")) {
          patientService.deletePatient(row.id).then(() => {
            notify.success("Patient deleted");
            refetch();
          });
        }
      },
    },
  ];

  // Loading state
  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Patients">
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" label="Loading patients..." />
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout role="bhc" title="Patients">
        <EmptyState
          icon={<Users size={48} />}
          title="Failed to load patients"
          description={error}
          action={<Button onClick={refetch}>Retry</Button>}
        />
      </DashboardLayout>
    );
  }

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
            <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
            <p className="text-sm text-slate-500">
              Manage and monitor {table.totalCount} patient record
              {table.totalCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate("/bhc/patients/add")}
          className="flex items-center gap-2"
        >
          <Plus size={18} />
          Add Patient
        </Button>
      </div>

      {/* Statistics */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Patients"
          value={table.totalCount}
          subtitle="All records"
          color="navy"
          delay={0}
        />
        <StatCard
          title="Active This Month"
          value={table.filteredCount}
          subtitle="Matching filters"
          color="blue"
          delay={1}
        />
        <StatCard
          title="Search Results"
          value={table.filteredCount}
          subtitle={`of ${table.totalCount} total`}
          color="green"
          delay={2}
        />
      </div>

      {/* Filter Bar */}
      <div className="mb-6">
        <FilterBar
          filters={filterDefinitions}
          values={table.filters}
          onChange={table.setFilters}
          onReset={() =>
            table.setFilters({
              search: "",
              sex: "All",
              type: "All Patients",
            })
          }
        />
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={table.paginatedData}
        loading={loading}
        actions={tableActions}
        paginated={true}
        itemsPerPage={table.filteredCount > 0 ? 10 : 0}
      />

      {/* Empty State */}
      {table.filteredCount === 0 && !loading && (
        <EmptyState
          icon={<Users size={48} />}
          title="No patients found"
          description="Try adjusting your search or filters"
          action={
            <Button onClick={() => navigate("/bhc/patients/add")}>
              Add First Patient
            </Button>
          }
        />
      )}
    </DashboardLayout>
  );
}
