/**
 * BHCDashboard - Refactored Version
 *
 * Enterprise-grade example of clean architecture:
 * - Uses custom hooks for data fetching
 * - Services handle all business logic
 * - Components are pure presentational
 * - Pages are orchestration-only
 */

import {
  Activity,
  ArrowRight,
  Baby,
  ClipboardList,
  FileText,
  HeartPulse,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { useFetch } from "../../hooks";
import DashboardLayout from "../../layouts/DashboardLayout";
import { StatCard } from "../../components/organisms";
import { LoadingSpinner, Card } from "../../components/atoms";
import { EmptyState } from "../../components/molecules";
import PatientDetailItem from "../../components/patients/PatientDetailItem";
import RecentHealthRecordsTable from "../../components/tables/RecentHealthRecordsTable";
import RecentReferralsTable from "../../components/tables/RecentReferralsTable";
import WorkflowPanel from "../../components/workflow/WorkflowPanel";
import PatientVolumeCard from "../../components/volume/PatientVolumeCard";
import * as dashboardService from "../../services/dashboard";
import { stagger } from "../../utils/animations";

/**
 * BHCDashboard Component
 * Orchestrates dashboard data and presents it using reusable components
 */
export default function BHCDashboard() {
  // Fetch all dashboard data in parallel using custom hook
  const {
    data: dashboardData,
    loading,
    error,
  } = useFetch(async () => {
    const [stats, records, referrals, medicineAlerts, categories] =
      await Promise.all([
        dashboardService.getDashboardStats(),
        dashboardService.fetchRecentHealthRecords(),
        dashboardService.fetchRecentReferrals(),
        dashboardService.fetchMedicineAlerts(),
        dashboardService.fetchPatientCategories(),
      ]);

    return { stats, records, referrals, medicineAlerts, categories };
  }, []);

  // Loading state
  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" label="Loading dashboard..." />
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <EmptyState
          icon={<AlertCircle size={48} />}
          title="Failed to load dashboard"
          description={error}
        />
      </DashboardLayout>
    );
  }

  // No data state
  if (!dashboardData) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <EmptyState
          icon={<Activity size={48} />}
          title="No data available"
          description="Dashboard data is not available at this time"
        />
      </DashboardLayout>
    );
  }

  const { stats, records, referrals, medicineAlerts, categories } =
    dashboardData;

  return (
    <DashboardLayout role="bhc" title="Dashboard">
      {/* Header */}
      <div
        className="anim-fade-up mb-8 flex items-start justify-between gap-4"
        style={stagger(0)}
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06]">
            <Activity size={20} className="text-[#0B2E59]" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        </div>
      </div>

      {/* Statistics Cards Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Patients"
          value={stats.totalPatients}
          subtitle="Active records"
          icon={<Users size={20} />}
          color="navy"
          delay={0}
        />
        <StatCard
          title="Health Records"
          value={stats.activeRecords}
          subtitle="This month"
          icon={<FileText size={20} />}
          color="blue"
          delay={1}
        />
        <StatCard
          title="Pending Referrals"
          value={stats.pendingReferrals}
          subtitle="Awaiting response"
          icon={<ArrowRight size={20} />}
          color="amber"
          delay={2}
        />
        <StatCard
          title="Monitoring"
          value={stats.monitoringPatients}
          subtitle="Under observation"
          icon={<HeartPulse size={20} />}
          color="red"
          delay={3}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recent Health Records */}
          <RecentHealthRecordsTable records={records} />

          {/* Recent Referrals */}
          <RecentReferralsTable referrals={referrals} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Medicine Alerts */}
          {medicineAlerts && medicineAlerts.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-slate-900">
                Medicine Alerts
              </h3>
              <div className="space-y-3">
                {medicineAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                  >
                    <p className="text-sm font-medium text-amber-900">
                      {alert.medicine}
                    </p>
                    <p className="text-xs text-amber-700">
                      Stock: {alert.stock} / {alert.threshold}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Patient Categories */}
          {categories && categories.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-slate-900">
                Patient Categories
              </h3>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-slate-600">
                      {cat.category}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {cat.count}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="mb-4 font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                to="/bhc/patients/add"
                className="block rounded-lg bg-[#0B2E59] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#082147]"
              >
                + Add Patient
              </Link>
              <Link
                to="/bhc/health-records/add"
                className="block rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                + New Record
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
