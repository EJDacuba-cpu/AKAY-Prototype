import { Eye, FileText } from "lucide-react";
import { Link } from "react-router";

import SectionCard from "../cards/SectionCard";
import StatusBadge from "../badges/StatusBadge";

export default function RecentHealthRecordsTable({ records, delay = 0 }) {
  return (
    <SectionCard
      title="Recent Health Records"
      subtitle="Latest BHC patient visits and monitoring entries."
      count={records.length}
      linkTo="/bhc/health-records"
      icon={<FileText size={14} />}
      delay={delay}
    >
      <div
        className="
    overflow-x-auto

    px-1 pb-3

    scroll-smooth

    [&::-webkit-scrollbar]:h-2

    [&::-webkit-scrollbar-track]:rounded-full
    [&::-webkit-scrollbar-track]:bg-[#F8FAFC]

    [&::-webkit-scrollbar-thumb]:rounded-full
    [&::-webkit-scrollbar-thumb]:bg-[#D6DEE8]

    [&::-webkit-scrollbar-thumb]:border
    [&::-webkit-scrollbar-thumb]:border-[#F8FAFC]

    hover:[&::-webkit-scrollbar-thumb]:bg-[#B8C4D3]

    transition-all duration-300
  "
      >
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="px-6 py-3">Patient</th>
              <th className="px-4 py-3">Visit Type</th>
              <th className="px-4 py-3">Chief Complaint</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F8FAFC]">
            {records.map((record) => (
              <tr
                key={`${record.patient}-${record.visitType}`}
                className="group transition-colors duration-150 hover:bg-[#FAFBFD]"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold text-[#1A1A1A]">
                      {record.patient}
                    </span>
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#6B7280]">
                  {record.visitType}
                </td>

                <td className="px-4 py-4 text-[13px] text-[#6B7280]">
                  {record.concern}
                </td>

                <td className="whitespace-nowrap px-4 py-4">
                  <StatusBadge status={record.status} />
                </td>

                <td className="whitespace-nowrap px-4 py-4 text-[13px] text-[#9CA3AF]">
                  {record.date}
                </td>

                <td className="whitespace-nowrap px-4 py-4 text-right">
                  <Link
                    to="/bhc/health-records"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#0B2E59] transition-all duration-200 hover:bg-[#0B2E59]/[0.06] active:scale-[0.96]"
                  >
                    <Eye size={13} />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
