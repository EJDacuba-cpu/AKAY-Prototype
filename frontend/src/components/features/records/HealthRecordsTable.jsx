import ActionMenu from "../../common/tables/ActionMenu";
import StatusBadge from "../../common/badges/StatusBadge";
import TablePagination from "../../common/pagination/TablePagination";

import { stagger } from "../../../utils/animation";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../../utils/formatters";

export default function HealthRecordsTable({
  records = [],
  loading,
  currentPage = 1, // Default sa page 1 kung walang ipinasang value
  totalPages, // Ginagamit kung ang kabuuang pahina ay galing sa backend api
  setCurrentPage = () => {}, // Safe fallback function para iwas sa "onPageChange is not a function" error
  delay = 0,
}) {
  // 1. MAGSET NG MAXIMUM ITEMS BAWAT PAHINA (Max 5 records lang kada table layout)
  const ITEMS_PER_PAGE = 5;

  // 2. AWTOMATIKONG UTUKIN ANG TOTAL PAGES KUNG HINDI ITO IPINASA MULA SA BACKEND/PARENT
  const computedTotalPages =
    totalPages || Math.ceil(records.length / ITEMS_PER_PAGE);

  // 3. I-SLICE ANG RECORDS ARRAY PARA KUNG ANONG PAHINA LANG ANG AKTIBO, YUN LANG ANG IPAPAKITA
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentRecords = records.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div
      className="
        anim-fade-up
        relative
        z-0
        overflow-visible
        rounded-xl
        border border-[#E5E7EB]
        bg-white
        shadow-sm
        shadow-black/[0.02]
      "
      style={stagger(delay)}
    >
      {/* Header */}
      <div
        className="
          flex items-center justify-between
          border-b border-[#F1F5F9]
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

            {!loading && (
              <span
                className="
                  rounded-md
                  border border-[#E5E7EB]
                  bg-[#F8FAFC]
                  px-2 py-1
                  text-[10px]
                  font-semibold
                  text-[#64748B]
                "
              >
                {records.length}
              </span>
            )}
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
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-[#9CA3AF]">Loading health records...</p>
        </div>
      ) : (
        <>
          {/* Table Container */}
          <div
            className="
              w-full
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
                    border-b border-[#F1F5F9]
                    bg-[#F8FAFC]
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wider
                    text-[#9CA3AF]
                  "
                >
                  <th className="px-4 py-3 whitespace-nowrap">Record</th>
                  <th className="px-4 py-3 whitespace-nowrap">Patient</th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    Classification
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    Chief Complaint
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Follow-up</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
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
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className="
                            rounded-lg
                            border border-[#E5E7EB]
                            bg-[#F8FAFC]
                            px-2.5 py-1.5
                            font-mono text-[11px]
                            font-semibold
                            text-[#B91C1C]
                            transition-colors duration-200
                            group-hover:border-[#FECACA]
                            group-hover:bg-[#FEF2F2]
                          "
                        >
                          {recordId}
                        </span>
                      </td>

                      {/* Patient Details */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
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
                      <td className="px-4 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {classification}
                      </td>

                      {/* Chief Complaint / Concern */}
                      <td className="px-4 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {concern}
                      </td>

                      {/* Status Badge */}
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <StatusBadge status={record.status} />
                      </td>

                      {/* Follow-up Info */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                        {followUp}
                      </td>

                      {/* Date of Visit */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                        {date}
                      </td>

                      {/* Actions ActionMenu Button */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="relative flex justify-end">
                          <ActionMenu
                            title={patientName}
                            subtitle={recordId}
                            viewLink={`/bhc/health-records/${record.id}`}
                            editLink={`/bhc/health-records/add?recordId=${record.id}&mode=edit`}
                            editLabel="Edit Record"
                            referralLink={
                              record.linkedReferralTrackingId
                                ? `/bhc/referrals/${record.linkedReferralTrackingId}`
                                : `/bhc/referrals/create?recordId=${record.id}`
                            }
                            referralLabel={
                              record.linkedReferralTrackingId
                                ? "View Referral"
                                : "Submit Referral"
                            }
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
