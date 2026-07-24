import { FileText } from "lucide-react";

import TablePagination from "../../common/pagination/TablePagination";
import ActionMenu from "../../common/tables/ActionMenu";
import DataTableEmptyState from "../../common/tables/DataTableEmptyState";
import RefreshingIndicator from "../../common/loading/RefreshingIndicator";
import { stagger } from "../../../utils/animation";
import {
  formatDate,
  formatDisplayValue,
  formatPatientName,
} from "../../../utils/formatters";
import {
  getRecordDateValue,
  getRecordId,
  getRecordIdLabel,
  getServiceTypeLabel,
} from "../../../utils/healthRecordPrograms";

const ITEMS_PER_PAGE = 5;

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

  const computedTotalPages =
    totalPages || Math.ceil(records.length / ITEMS_PER_PAGE);
  const currentRecords = records.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div
      className="anim-fade-up relative z-0 flex min-h-[420px] flex-col overflow-visible rounded-xl border border-[#E5E7EB] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Recent Health Records
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Saved patient visits grouped by health service.
          </p>
        </div>
        {refreshing && <RefreshingIndicator label="Updating health records..." />}
      </div>

      <div className="grid gap-3 p-3 md:hidden">
        {currentRecords.length === 0 ? (
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
            const recordId = getRecordId(record);
            const patientName = formatPatientName(
              record.patientName || record.patient,
              "Unnamed Patient",
            );
            const patientId = formatDisplayValue(
              record.patientId ||
                record.patient_id ||
                record.patient?.patientId ||
                record.patient?.id,
              "Not linked",
            );
            const referralTarget =
              record.linkedReferralTrackingId || record.linkedReferralId;

            return (
              <article
                key={recordId}
                className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-[#0F172A]">
                      {patientName}
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">
                      Patient ID #{patientId}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#B91C1C]">
                    {getRecordIdLabel(record)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-[12px]">
                  <MobileRecordField
                    label="Date of Visit"
                    value={formatDate(
                      getRecordDateValue(record),
                      "Not recorded",
                    )}
                  />
                  <MobileRecordField
                    label="Service Type"
                    value={getServiceTypeLabel(record)}
                  />
                </div>

                <div className="mt-4 flex justify-end border-t border-[#F1F5F9] pt-3">
                  <ActionMenu
                    title={patientName}
                    subtitle={`#${recordId}`}
                    viewLink={`/bhc/health-records/${recordId}`}
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

      <div className="hidden min-h-[280px] w-full flex-1 overflow-x-auto overflow-y-visible px-1 pb-2 md:block">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="whitespace-nowrap px-4 py-3">Record ID</th>
              <th className="whitespace-nowrap px-4 py-3">Date of Visit</th>
              <th className="whitespace-nowrap px-4 py-3">Patient</th>
              <th className="whitespace-nowrap px-4 py-3">Service Type</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F8FAFC]">
            {currentRecords.length === 0 ? (
              <DataTableEmptyState
                colSpan={5}
                icon={<FileText size={20} className="text-[#94A3B8]" />}
                title="No Matching Records"
                description="Try adjusting your search or filter criteria."
              />
            ) : (
              currentRecords.map((record) => {
                const recordId = getRecordId(record);
                const patientName = formatPatientName(
                  record.patientName || record.patient,
                  "Unnamed Patient",
                );
                const patientId = formatDisplayValue(
                  record.patientId ||
                    record.patient_id ||
                    record.patient?.patientId ||
                    record.patient?.id,
                  "Not linked",
                );
                const referralTarget =
                  record.linkedReferralTrackingId || record.linkedReferralId;

                return (
                  <tr
                    key={recordId}
                    className="transition-colors duration-150 hover:bg-[#FAFBFD]"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-bold text-[#B91C1C]">
                      {getRecordIdLabel(record)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[13px] font-semibold text-[#475569]">
                      {formatDate(
                        getRecordDateValue(record),
                        "Not recorded",
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="text-[13px] font-semibold text-[#111827]">
                        {patientName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
                        Patient ID #{patientId}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[13px] font-semibold text-[#475569]">
                      {getServiceTypeLabel(record)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <div className="relative flex justify-end">
                        <ActionMenu
                          title={patientName}
                          subtitle={`#${recordId}`}
                          viewLink={`/bhc/health-records/${recordId}`}
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

      <TablePagination
        currentPage={currentPage}
        totalPages={computedTotalPages}
        onPageChange={setCurrentPage}
      />
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
