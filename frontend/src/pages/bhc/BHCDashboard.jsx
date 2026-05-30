import {
  Activity,
  ArrowRight,
  ClipboardList,
  FileText,
  HeartPulse,
  Stethoscope,
  Users,
} from "lucide-react";

import { Link } from "react-router";

import { useEffect, useState } from "react";

/* Layout */
import DashboardLayout from "../../components/layout/DashboardLayout";

/* Cards */
import StatCard from "../../components/common/cards/StatsCard";
import SideCard from "../../components/common/cards/SideCard";
import MedicineAlert from "../../components/common/cards/MedicineAlert";

/* Tables */
import RecentHealthRecordsTable from "../../components/features/records/RecentHealthRecordsTable";
import RecentReferralsTable from "../../components/features/referrals/RecentReferralsTable";

/* Dashboard Components */
import WorkflowPanel from "../../components/features/workflow/WorkflowPanel";
import PatientVolumeCard from "../../components/features/volume/PatientVolumeCard";

/* Services */
import {
  getDashboardStats,
  getMedicineAlerts,
  getRecentHealthRecords,
  getRecentReferrals,
} from "../../services/dashboardService";
import {
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";

/* Reusable Animation */
const stagger = (i) => ({
  animationDelay: `${i * 65}ms`,
});

export default function BHCDashboard() {
  const [stats, setStats] = useState(null);

  const [records, setRecords] = useState([]);

  const [referrals, setReferrals] = useState([]);

  const [medicineAlerts, setMedicineAlerts] = useState([]);
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );

  const [loading, setLoading] = useState(true);

  /* Fetch Dashboard Data */
  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);

        const [statsData, recordsData, referralsData, medicineData] =
          await Promise.all([
            getDashboardStats(),

            getRecentHealthRecords(),

            getRecentReferrals(),

            getMedicineAlerts(),
          ]);

        setStats(statsData);

        setRecords(recordsData);

        setReferrals(referralsData);

        setMedicineAlerts(medicineData);
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  /* Loading */
  if (loading || !stats) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <div
          className="
            flex min-h-[60vh]
            items-center justify-center
          "
        >
          <p className="text-sm text-[#6B7280]">Loading dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Dashboard">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Header */}
        <div
          className="
            anim-fade-up
            mb-7
            flex items-start gap-4
          "
          style={stagger(0)}
        >
          <div
            className="
              flex h-10 w-10
              items-center justify-center

              rounded-xl

              bg-[#0B2E59]/[0.06]

              text-[#0B2E59]
            "
          >
            <Activity size={20} />
          </div>

          <div>
            <h1
              className="
                text-xl
                font-bold
                tracking-tight
                text-[#0B2E59]
              "
            >
              WELCOME USER
            </h1>

            <p
              className="
                mt-1.5
                max-w-2xl
                text-sm
                leading-relaxed
                text-[#6B7280]
              "
            >
              Summary of patient records, health visits, referrals, and RHU
              coordination.
            </p>
          </div>
        </div>

        {/* Analytics */}
        <div
          className="
            mb-6
            grid gap-5
            md:grid-cols-2
            xl:grid-cols-4
          "
        >
          <StatCard
            title="Total Patients"
            value={stats.totalPatients}
            subtitle="Registered BHC patients"
            icon={<Users size={17} />}
            color="navy"
            delay={1}
          />

          <StatCard
            title="Health Records This Week"
            value={stats.healthRecords}
            subtitle="New visit records"
            icon={<FileText size={17} />}
            color="blue"
            delay={2}
          />

          <StatCard
            title="Pending Referrals"
            value={stats.pendingReferrals}
            subtitle="Awaiting RHU check-in"
            icon={<ClipboardList size={17} />}
            color="slate"
            delay={3}
          />

          <StatCard
            title="For Monitoring"
            value={stats.monitoringPatients}
            subtitle="Patients needing follow-up"
            icon={<HeartPulse size={17} />}
            color="amber"
            delay={4}
          />
        </div>

        {/* Main Layout */}
        <div
          className="
            grid gap-6

            xl:grid-cols-[minmax(0,1fr)_340px]
          "
        >
          {/* Left */}
          <div className="min-w-0 space-y-6">
            <PatientVolumeCard delay={5} />

            <RecentHealthRecordsTable records={records} delay={6} />

            <RecentReferralsTable referrals={referrals} delay={7} />
          </div>

          {/* Sidebar */}
          <aside
            className="
              space-y-6

              2xl:sticky
              2xl:top-24
              2xl:self-start
            "
          >
            <DoctorAvailabilityCard availability={doctorAvailability} />

            <WorkflowPanel delay={8} />

            {/* Medicine */}
            <SideCard
              title="Medicine Availability"
              badge="3 alerts"
              badgeType="danger"
              delay={13}
            >
              <p
                className="
                  mb-4
                  text-xs
                  text-[#9CA3AF]
                "
              >
                Items requiring attention from RHU inventory updates.
              </p>

              <div className="space-y-2.5">
                {medicineAlerts.map((medicine) => (
                  <MedicineAlert
                    key={medicine.name}
                    name={medicine.name}
                    status={medicine.status}
                    qty={medicine.qty}
                  />
                ))}
              </div>

              <Link
                to="/bhc/medicine-availability"
                className="
                  mt-5
                  flex items-center
                  justify-center gap-2

                  rounded-xl

                  bg-[#0B2E59]

                  px-4 py-2.5

                  text-xs font-semibold
                  text-white

                  shadow-md
                  shadow-[#0B2E59]/15

                  transition-all duration-300

                  hover:-translate-y-0.5
                  hover:bg-[#092347]
                  hover:shadow-lg
                "
              >
                View Availability
                <ArrowRight size={13} />
              </Link>
            </SideCard>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DoctorAvailabilityCard({ availability }) {
  return (
    <SideCard title="RHU Doctor Availability" delay={8}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
          <Stethoscope size={17} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                availability.status === "Not Available"
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {availability.status}
            </span>
            <span className="text-[11px] font-semibold text-[#6B7280]">
              {availability.availableDoctorCount} of{" "}
              {availability.totalDoctorCount} available
            </span>
          </div>

          <p className="mt-2 text-xs font-semibold text-[#4B5563]">
            {formatDoctorAvailabilitySummary(availability)}.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            {availability.note}
          </p>
          <p className="mt-2 text-[10px] font-medium text-[#9CA3AF]">
            Updated by {availability.updatedBy || "RHU Staff"} ·{" "}
            {formatDoctorAvailabilityDate(availability.updatedAt)}
          </p>
        </div>
      </div>
    </SideCard>
  );
}
