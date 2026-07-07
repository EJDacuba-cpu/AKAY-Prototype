import ActionMenu from "../../common/tables/ActionMenu";
import DataTableEmptyState from "../../common/tables/DataTableEmptyState";
import TablePagination from "../../common/pagination/TablePagination";
import { FileText } from "lucide-react";

import { stagger } from "../../../utils/animation";
import {
  formatDate,
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
  refreshing = false,
}) {
  if (loading) return null;

  void refreshing;

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
          </div>

          <p
            className="
              mt-1
              text-xs
              text-[#9CA3AF]
            "
          >
            Patient visit history, consultations, monitoring, and referral status.
          </p>
        </div>
      </div>

      <>
          <div className="grid gap-3 p-3 md:hidden">
            {records.length === 0 ? (
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white">
                  <FileText size={18} className="text-[#94A3B8]" />
                </div>
                <p className="text-[13px] font-semibold text-[#334155]">
                  No Matching Records
                </p>
                <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                  Try adjusting your search or filter criteria.
                </p>
              </div>
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
                const date = formatDate(record.date, "Not recorded");
                const practitioner = formatDisplayValue(
                  record.practitioner || record.provider || record.attendingStaff,
                  "Not recorded",
                );
                const nextFollowUp = formatNextFollowUp(record);
                const referralTarget =
                  record.linkedReferralTrackingId || record.linkedReferralId;

                return (
                  <article
                    key={record.id}
                    className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm"
                  >
                    <div className="border-b border-[#F1F5F9] pb-3">
                      <div className="min-w-0">
                        <span className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#B91C1C]">
                          {recordId}
                        </span>
                        <h3 className="mt-2 truncate text-sm font-bold text-[#0F172A]">
                          {patientName}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">
                          {patientId}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-[12px]">
                      <MobileRecordField label="Record Type" value={classification} />
                      <MobileRecordField label="Chief Complaint" value={concern} />
                      <MobileRecordField label="Date" value={date} />
                      <MobileRecordField label="Practitioner" value={practitioner} />
                      <MobileRecordField label="Next Follow-up" value={nextFollowUp} />
                    </div>

                    <div className="mt-4 flex justify-end border-t border-[#F1F5F9] pt-3">
                      <ActionMenu
                        title={patientName}
                        subtitle={recordId}
                        viewLink={`/bhc/health-records/${record.id}`}
                        editLink={`/bhc/health-records/${record.id}`}
                        editLabel="Edit Record"
                        referralLink={
                          referralTarget
                            ? `/bhc/referrals/${referralTarget}`
                            : undefined
                        }
                        referralLabel="View Referral"
                      />
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Table Container */}
          <div
            className="
              hidden
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
              md:block
            "
          >
            <table
              className="
                w-full min-w-[980px]
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
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Patient</th>
                  <th className="px-4 py-3 whitespace-nowrap">Record Type</th>
                  <th className="px-4 py-3 whitespace-nowrap">Practitioner</th>
                  <th className="px-4 py-3 whitespace-nowrap">Next Follow-up</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F8FAFC]">
                {currentRecords.length === 0 ? (
                  <DataTableEmptyState
                    colSpan={6}
                    icon={<FileText size={20} className="text-[#94A3B8]" />}
                    title="No Matching Records"
                    description="Try adjusting your search or filter criteria."
                  />
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
                    const date = formatDate(record.date, "Not recorded");
                    const practitioner = formatDisplayValue(
                      record.practitioner ||
                        record.provider ||
                        record.attendingStaff,
                      "Not recorded",
                    );
                    const nextFollowUp = formatNextFollowUp(record);
                    const referralTarget =
                      record.linkedReferralTrackingId || record.linkedReferralId;

                    return (
                    <tr
                      key={record.id}
                      className="
                        group
                        transition-colors duration-150
                        hover:bg-[#FAFBFD]
                      "
                    >
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div>
                          <p className="text-[13px] font-semibold text-[#475569]">
                            {date}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
                            #{recordId}
                          </p>
                        </div>
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

                      <td className="px-4 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {classification}
                      </td>

                      <td className="max-w-[180px] truncate px-4 py-3.5 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {practitioner}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {nextFollowUp}
                      </td>

                      {/* Actions ActionMenu Button */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="relative flex justify-end">
                          <ActionMenu
                            title={patientName}
                            subtitle={recordId}
                            viewLink={`/bhc/health-records/${record.id}`}
                            editLink={`/bhc/health-records/${record.id}`}
                            editLabel="Edit Record"
                            referralLink={
                              referralTarget
                                ? `/bhc/referrals/${referralTarget}`
                                : undefined
                            }
                            referralLabel="View Referral"
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
    </div>
  );
}

function MobileRecordField({ label, value }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-semibold text-[#475569]">
        {value}
      </span>
    </div>
  );
}

function formatNextFollowUp(record = {}) {
  const value =
    record.nextFollowUpDate ||
    record.followUpDate ||
    record.follow_up_date ||
    record.monitoringData?.followUpDate ||
    record.monitoring_data?.followUpDate ||
    record.monitoring_data?.follow_up_date ||
    "";

  return value ? `Next: ${formatDate(value, value)}` : "—";
}
