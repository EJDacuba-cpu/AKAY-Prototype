import { Eye, FileText } from "lucide-react";
import { Link } from "react-router";

import SectionCard from "../../common/cards/SectionCard";
import FixedTable from "../../common/tables/FixedTable";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../../utils/formatters";

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
      <FixedTable minWidth="min-w-[760px]" lockHeight={false}>
        <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
          <tr>
            <th className="px-4">Patient</th>
            <th className="px-3">Record Type</th>
            <th className="px-3">Chief Complaint</th>
            <th className="px-3">Date</th>
            <th className="px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {records.map((record) => {
            const patientName = formatPatientName(
              record.patientName || record.patient,
              "Unnamed Patient",
            );
            const visitType = formatDisplayValue(
              record.visitType,
              "General Consultation",
            );
            const concern = formatDisplayValue(record.concern, "Not recorded");
            const date = formatDisplayValue(record.date, "No Date");

            return (
              <tr
                key={`${patientName}-${visitType}`}
                className="h-14 transition-colors hover:bg-neutral-50"
              >
                <td className="px-4 text-[13px] font-semibold text-ink-800">
                  {patientName}
                </td>
                <td className="px-3 text-[13px] text-neutral-600">{visitType}</td>
                <td className="max-w-[240px] px-3 text-[13px] text-neutral-600" title={concern}>
                  {concern}
                </td>
                <td className="px-3 text-[13px] text-neutral-500">{date}</td>
                <td className="px-3 text-right">
                  <Link
                    to="/bhc/health-records"
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    <Eye size={13} />
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </FixedTable>
    </SectionCard>
  );
}
