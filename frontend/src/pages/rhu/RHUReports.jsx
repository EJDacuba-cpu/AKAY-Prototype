import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  HeartPulse,
  Users,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function RHUReports() {
  const barangayReports = [
    { barangay: "Pitpitan", referrals: 12, completed: 8, monitoring: 3 },
    { barangay: "Taliptip", referrals: 9, completed: 5, monitoring: 2 },
    { barangay: "San Jose", referrals: 7, completed: 4, monitoring: 1 },
    { barangay: "Bagumbayan", referrals: 6, completed: 3, monitoring: 2 },
    { barangay: "Bambang", referrals: 5, completed: 3, monitoring: 1 },
  ];

  const categoryReports = [
    { category: "A1", label: "Emergency", count: 6, priority: "High" },
    { category: "A2", label: "Urgent", count: 4, priority: "High" },
    { category: "B1", label: "Routine", count: 12, priority: "Medium" },
    { category: "B2", label: "Standard", count: 5, priority: "Medium" },
    { category: "C1", label: "Follow-up", count: 3, priority: "Normal" },
    { category: "C2", label: "Non-urgent", count: 8, priority: "Normal" },
  ];

  const serviceSummary = [
    { label: "Incoming Referrals", value: 39, percent: 78 },
    { label: "Walk-in Patients", value: 26, percent: 52 },
    { label: "For Monitoring", value: 11, percent: 35 },
    { label: "Completed Cases", value: 23, percent: 65 },
  ];

  const medicineAlerts = [
    { item: "Amoxicillin", status: "Low Stock", quantity: "15 pcs" },
    { item: "Tetanus Vaccine", status: "Unavailable", quantity: "0 vials" },
    { item: "Syringe", status: "Low Stock", quantity: "20 pcs" },
  ];

  return (
    <DashboardLayout role="rhu" title="Reports">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <BarChart3 size={20} />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            RHU Reports
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            View referral, walk-in, monitoring, barangay, and medicine
            availability summaries.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Referrals"
          value="39"
          icon={<ClipboardList size={17} />}
          color="navy"
        />
        <StatCard
          title="Walk-in Patients"
          value="26"
          icon={<Users size={17} />}
          color="blue"
        />
        <StatCard
          title="For Monitoring"
          value="11"
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="Medicine Alerts"
          value="3"
          icon={<AlertTriangle size={17} />}
          color="red"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Service Summary
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Overall RHU activity based on referrals, walk-ins, monitoring, and
              completed cases.
            </p>
          </div>

          <div className="space-y-5">
            {serviceSummary.map((item) => (
              <ProgressItem key={item.label} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <Boxes size={18} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Medicine Alerts
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Low stock and unavailable resources.
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="border-b border-[#E8ECF0] px-6 py-4">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Referrals per Barangay
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Summary of referrals received from Barangay Health Centers.
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
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

        <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="border-b border-[#E8ECF0] px-6 py-4">
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Referrals by Category
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Referral category distribution for RHU prioritization.
            </p>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2">
            {categoryReports.map((item) => (
              <CategoryCard key={item.category} item={item} />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span> RHU
          reports help summarize referral volume, patient monitoring, walk-in
          activity, and medicine availability. These reports support
          coordination and decision-making, not final medical diagnosis.
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

function CategoryCard({ item }) {
  const priorityMap = {
    High: "bg-red-50 text-red-700 border-red-100",
    Medium: "bg-amber-50 text-amber-700 border-amber-100",
    Normal: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };

  return (
    <div className={`rounded-xl border p-4 ${priorityMap[item.priority]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-[#0B2E59]">
            {item.category}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#4B5563]">
            {item.label}
          </p>
        </div>

        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold">
          {item.priority}
        </span>
      </div>

      <p className="mt-4 text-lg font-bold text-[#0B2E59]">
        {item.count} cases
      </p>
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
