import { Eye, FileText } from "lucide-react";
import { Link } from "react-router";

import SectionCard from "../../common/cards/SectionCard";
import StatusBadge from "../../common/badges/StatusBadge";

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
        className="akay-scrollbar overflow-x-auto px-1 pb-2 scroll-smooth"
      >
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              <th className="px-4 py-3">Patient</th>
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
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#0F172A]">
                      {record.patient}
                    </span>
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#6B7280]">
                  {record.visitType}
                </td>

                <td className="px-4 py-3.5 text-[13px] text-[#6B7280]">
                  {record.concern}
                </td>

                <td className="whitespace-nowrap px-4 py-3.5">
                  <StatusBadge status={record.status} />
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                  {record.date}
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  <Link
                    to="/bhc/health-records"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#B91C1C] transition-all duration-200 hover:bg-[#FEF2F2] active:scale-[0.96]"
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

