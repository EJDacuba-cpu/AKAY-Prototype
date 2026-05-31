import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  HeartPulse,
  Users,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function AdminReports() {
  const barangayReports = [
    { barangay: "Pitpitan", referrals: 12, completed: 8, monitoring: 3 },
    { barangay: "Taliptip", referrals: 9, completed: 5, monitoring: 2 },
    { barangay: "San Jose", referrals: 7, completed: 4, monitoring: 1 },
    { barangay: "Bagumbayan", referrals: 6, completed: 3, monitoring: 2 },
    { barangay: "Bambang", referrals: 5, completed: 3, monitoring: 1 },
  ];

  const systemSummary = [
    { label: "BHC Referrals", value: 124, percent: 82 },
    { label: "RHU Walk-in Patients", value: 47, percent: 55 },
    { label: "Patients for Monitoring", value: 18, percent: 42 },
    { label: "Completed RHU Feedback", value: 89, percent: 74 },
  ];

  const facilitySummary = [
    { label: "Active BHCs", value: 13 },
    { label: "Active RHU", value: 1 },
    { label: "Total Users", value: 38 },
    { label: "Doctor Records", value: 4 },
  ];

  const medicineAlerts = [
    { item: "Amoxicillin", status: "Low Stock", quantity: "15 pcs" },
    { item: "Tetanus Vaccine", status: "Unavailable", quantity: "0 vials" },
    { item: "Syringe", status: "Low Stock", quantity: "20 pcs" },
  ];

  return (
    <DashboardLayout role="admin" title="Reports">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <BarChart3 size={20} />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Admin Reports
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            System-wide summary for referrals, facilities, monitoring, users,
            doctor availability, and inventory alerts.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Referrals"
          value="124"
          icon={<ClipboardList size={17} />}
          color="navy"
        />
        <StatCard
          title="Active Facilities"
          value="14"
          icon={<Building2 size={17} />}
          color="blue"
        />
        <StatCard
          title="Patients Monitoring"
          value="18"
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="Inventory Alerts"
          value="3"
          icon={<AlertTriangle size={17} />}
          color="red"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              System Activity Summary
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Overall AKAY activity across BHC, RHU, and MHO/Admin modules.
            </p>
          </div>

          <div className="space-y-5">
            {systemSummary.map((item) => (
              <ProgressItem key={item.label} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
              <Users size={18} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Facility and User Summary
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Current system coverage overview.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {facilitySummary.map((item) => (
              <SummaryItem
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="border-b border-[#E8ECF0] px-6 py-4">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Referrals per Barangay
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              System-wide BHC referral activity grouped by barangay.
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <th className="px-6 py-3">Barangay</th>
                  <th className="px-4 py-3">Referrals</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Monitoring</th>
                  <th className="px-4 py-3">Distribution</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F3F4F6]">
                {barangayReports.map((item) => (
                  <tr key={item.barangay} className="hover:bg-[#F9FAFB]">
                    <td className="px-6 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                      {item.barangay}
                    </td>

                    <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                      {item.referrals}
                    </td>

                    <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                      {item.completed}
                    </td>

                    <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                      {item.monitoring}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8ECF0]">
                        <div
                          className="h-full rounded-full bg-[#0B2E59]"
                          style={{ width: `${item.referrals * 7}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <Boxes size={18} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Medicine and Resource Alerts
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Low stock and unavailable items from RHU.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {medicineAlerts.map((item) => (
              <MedicineAlert key={item.item} item={item} />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span> Admin
          reports provide system-wide monitoring for the MHO. These reports
          support decision-making and coordination, but they do not replace RHU
          clinical assessment.
        </p>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    blue: "border-t-blue-500 text-blue-700 bg-blue-50",
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`flex-shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

function ProgressItem({ item }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#4B5563]">{item.label}</p>
        <p className="text-xs font-bold text-[#0B2E59]">{item.value}</p>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-[#E8ECF0]">
        <div
          className="h-full rounded-full bg-[#0B2E59]"
          style={{ width: `${item.percent}%` }}
        />
      </div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-3">
      <p className="text-xs font-semibold text-[#4B5563]">{label}</p>
      <span className="rounded-md bg-[#0B2E59]/[0.06] px-2 py-0.5 text-[10px] font-semibold text-[#0B2E59]">
        {value}
      </span>
    </div>
  );
}

function MedicineAlert({ item }) {
  const color =
    item.status === "Unavailable"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";

  return (
    <div className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0B2E59]">{item.item}</p>
          <p className="mt-1 text-xs text-[#9CA3AF]">{item.quantity}</p>
        </div>

        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${color}`}
        >
          {item.status}
        </span>
      </div>
    </div>
  );
}

