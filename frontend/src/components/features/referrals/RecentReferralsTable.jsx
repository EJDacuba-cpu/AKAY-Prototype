import ActionMenu from "../../common/tables/ActionMenu";
import StatusBadge from "../../common/badges/StatusBadge";
import TablePagination from "../../common/pagination/TablePagination";
import { TableSkeleton } from "../../common/loading/SkeletonLoaders";

import { stagger } from "../../../utils/animation";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../../utils/formatters";

export default function HealthRecordsTable({
  records = [],
  loading,
  currentPage = 1,
  totalPages,
  setCurrentPage = () => {},
  delay = 0,
}) {
  const ITEMS_PER_PAGE = 5;
  const computedTotalPages =
    totalPages || Math.ceil(records.length / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentRecords = records.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div
      className="
        anim-fade-up
        relative
        z-0
        flex min-h-[420px] flex-col
        overflow-visible
        rounded-xl
        border border-[#E5E7EB]
        bg-white
        shadow-sm
      "
      style={stagger(delay)}
    >
      {/* Header */}
      <div
        className="
          flex items-center justify-between
          border-b border-[#F3F4F6]
          px-4 py-3
        "
      >
        <div>
          <div className="flex items-center gap-2">
            <h2
              className="
                text-sm
                font-semibold
                text-[#0F172A]
              "
            >
              Recent Health Records
            </h2>

          </div>

          <p
            className="
              mt-1
              text-xs
              text-[#9CA3AF]
            "
          >
            Patient visits, monitoring, consultations, and referral follow-ups.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="px-3 py-4">
          <TableSkeleton
            message="Loading health records..."
            rows={5}
            columns={8}
          />
        </div>
      ) : (
        <>
          {/* Table Container */}
          <div
            className="
              w-full
              flex-1
              min-h-[280px]
              overflow-x-auto
              overflow-y-visible
              scroll-smooth
              px-1 pb-2
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
            <table
              className="
                w-full min-w-[1250px]
                text-left
                border-separate
                border-spacing-0
              "
            >
              <thead>
                <tr
                  className="
                    border-b border-[#F3F4F6]
                    bg-[#F8FAFC]
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wider
                    text-[#9CA3AF]
                  "
                >
                  <th className="px-4 py-2.5 whitespace-nowrap">Record</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Patient</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">
                    Classification
                  </th>
                  <th className="px-4 py-2.5 whitespace-nowrap">
                    Chief Complaint
                  </th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Follow-up</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F8FAFC]">
                {/* Dito binabasa ang naka-slice na dataset para mag-work ang page dynamic rows */}
                {currentRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="
                        px-4 py-12
                        text-center
                        text-sm
                        text-[#9CA3AF]
                      "
                    >
                      No health records found.
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((record) => {
                    const recordId = formatDisplayValue(record.id, "");
                    const patientName = formatPatientName(
                      record.patientName || record.patient,
                      "Unnamed Patient",
                    );
                    const patientId = formatDisplayValue(
                      record.patientId || record.patient?.id,
                      "Not linked",
                    );
                    const classification = formatDisplayValue(
                      record.classification,
                      "General Consultation",
                    );
                    const concern = formatDisplayValue(
                      record.concern,
                      "Not recorded",
                    );
                    const followUp = formatDisplayValue(
                      record.followUp,
                      "No Follow-up",
                    );
                    const date = formatDisplayValue(record.date, "No Date");

                    return (
                    <tr
                      key={record.id}
                      className="
                        group
                        transition-colors duration-150
                        hover:bg-[#FAFBFD]
                      "
                    >
                      {/* Record ID */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className="
                            rounded-lg
                            border border-[#FEE2E2]
                            bg-[#FEF2F2]
                            px-2.5 py-1.5
                            font-mono text-[11px]
                            font-semibold
                            text-[#B91C1C]
                            transition-colors duration-200
                            group-hover:border-red-200
                            group-hover:bg-red-50
                          "
                        >
                          {recordId}
                        </span>
                      </td>

                      {/* Patient Details */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          <p
                            className="
                              text-[13px]
                              font-semibold
                              text-[#111827]
                            "
                          >
                            {patientName}
                          </p>
                          <p
                            className="
                              mt-0.5
                              text-[11px]
                              text-[#9CA3AF]
                            "
                          >
                            {patientId}
                          </p>
                        </div>
                      </td>

                      {/* Visit Type / Classification */}
                      <td className="px-4 py-3 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {classification}
                      </td>

                      {/* Chief Complaint / Concern */}
                      <td className="px-4 py-3 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {concern}
                      </td>

                      {/* Status Badge */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={record.status} />
                      </td>

                      {/* Follow-up Info */}
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#9CA3AF]">
                        {followUp}
                      </td>

                      {/* Date of Visit */}
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#9CA3AF]">
                        {date}
                      </td>

                      {/* Actions ActionMenu Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="relative flex justify-end">
                          <ActionMenu
                            title={patientName}
                            subtitle={recordId}
                            viewLink={`/bhc/health-records/${record.id}`}
                            editLink="/bhc/health-records/add"
                            referralLink="/rhu/feedback/create"
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controller Component */}
          <TablePagination
            currentPage={currentPage}
            totalPages={computedTotalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
