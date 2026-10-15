import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import FixedTable from "../../common/tables/FixedTable";
import TablePagination from "../../common/pagination/TablePagination";
import { formatDate, formatDisplayValue } from "../../../utils/formatters";
import { getRecordDateValue, getRecordId, getRecordIdLabel, getRecordVisitTypeLabel } from "../../../utils/healthRecordPrograms";

/** The BHC patient's encounter table; identity is already shown in the profile header. */
export default function HealthRecordsTable({ records = [], currentPage = 1, totalPages = 1, onPageChange, detailsState, emptyTitle = "No health records yet" }) {
  function viewLink(record) {
    return (
      <Button asChild variant="ghost" size="icon" className="size-8 rounded-md border border-slate-200 text-slate-900">
        <Link to={`/bhc/health-records/${getRecordId(record)}`} state={detailsState} aria-label={`View health record ${getRecordIdLabel(record)}`}><ChevronRight size={15} /></Link>
      </Button>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg">
      <div className="md:hidden">
        {records.length === 0 ? <p className="p-10 text-center text-sm text-slate-600">{emptyTitle}</p> : (
          <ul className="divide-y divide-slate-100">
            {records.map(record => (
              <li key={getRecordId(record)} className="space-y-2 p-4 text-sm text-slate-900">
                <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs">{getRecordIdLabel(record)}</span>{viewLink(record)}</div>
                <p>{formatDisplayValue(record.chiefComplaint, "Not recorded")}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-slate-600">Date of Visit</dt><dd className="text-right">{formatDate(getRecordDateValue(record), "Not recorded")}</dd>
                  <dt className="text-slate-600">Visit Type</dt><dd className="text-right">{getRecordVisitTypeLabel(record)}</dd>
                  <dt className="text-slate-600">Outcome</dt><dd className="text-right">{record.outcomeText}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hidden md:block">
        <FixedTable minWidth="min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
              {["Record ID", "Date of Visit", "Chief Complaint", "Visit Type", "Outcome", "View"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-900">
            {records.length === 0 ? (
              <tr><td colSpan={6} style={{ height: "var(--akay-empty-h)" }} className="px-4 text-center text-slate-600">{emptyTitle}</td></tr>
            ) : records.map(record => (
              <tr key={getRecordId(record)} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{getRecordIdLabel(record)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(getRecordDateValue(record), "Not recorded")}</td>
                <td className="max-w-[240px] truncate px-4 py-3">{formatDisplayValue(record.chiefComplaint, "Not recorded")}</td>
                <td className="whitespace-nowrap px-4 py-3">{getRecordVisitTypeLabel(record)}</td>
                <td className="px-4 py-3">{record.outcomeText}</td>
                <td className="px-4 py-3">{viewLink(record)}</td>
              </tr>
            ))}
          </tbody>
        </FixedTable>
      </div>
      <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </Card>
  );
}
