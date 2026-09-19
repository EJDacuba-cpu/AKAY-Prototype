import { Link } from "react-router";
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  Stethoscope,
} from "lucide-react";

import {
  formatDisplayValue,
  formatLongDate,
} from "../../../utils/formatters";
import {
  getRecordDateValue,
  getRecordIdLabel,
  getServiceTypeLabel,
  isFollowUpVisitRecord,
} from "../../../utils/healthRecordPrograms";
import RecordOutcomeBadge from "../records/RecordOutcomeBadge";

const RECENT_VISIT_LIMIT = 3;

function OverviewCard({ title, icon, action, children, className = "" }) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-[#0F172A]">
          {icon}
          {title}
        </h3>
        {action}
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </section>
  );
}

function EmptyLine({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-5 text-center text-[11.5px] text-slate-400">
      {children}
    </p>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-[12px] font-semibold text-slate-700">
        {value}
      </span>
    </div>
  );
}

/**
 * Patient Profile → Overview: the clinical read of a patient, as opposed to
 * the General tab's registration details.
 *
 * Every card here is derived from data the profile page already loads
 * (records, referrals, follow-up tasks, the patient row) - this tab adds no
 * queries of its own.
 */
export default function PatientOverviewTab({
  patient,
  records = [],
  referrals = [],
  activeFollowUp = null,
  basePath = "/bhc",
  onViewRecord,
  onViewReferral,
  onViewAllRecords,
}) {
  const recentVisits = records.slice(0, RECENT_VISIT_LIMIT);
  const latestReferral = referrals[0] || null;
  const background = patient?.medicalBackground || {};
  const currentDiseases = Array.isArray(background.currentDiseases)
    ? background.currentDiseases
    : [];
  const dispensedMedicines = records
    .flatMap((record) =>
      Array.isArray(record.dispensedMedicines)
        ? record.dispensedMedicines.map((medicine) => ({
            ...medicine,
            recordDate: getRecordDateValue(record),
          }))
        : [],
    )
    .slice(0, 4);

  const careStatus = activeFollowUp
    ? {
        label: "Follow-up scheduled",
        detail: `${formatLongDate(activeFollowUp.dueDate, "Date not recorded")}${
          activeFollowUp.dueTime ? ` · ${activeFollowUp.dueTime}` : ""
        }`,
        tone: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
      }
    : latestReferral && !latestReferral.completedAt
      ? {
          label: "Referral in progress",
          detail: formatDisplayValue(
            latestReferral.status || latestReferral.referralStatus,
            "Awaiting update",
          ),
          tone: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
        }
      : {
          label: "No active care task",
          detail: records.length
            ? "Routine monitoring - nothing scheduled."
            : "No visits recorded yet.",
          tone: "border-slate-200 bg-slate-50 text-slate-600",
        };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <OverviewCard
        title="Recent Clinical Visits"
        icon={<Stethoscope size={14} className="text-[#B91C1C]" />}
        className="xl:col-span-2"
        action={
          records.length > 0 && (
            <button
              type="button"
              onClick={onViewAllRecords}
              className="text-[11px] font-bold text-[#B91C1C] transition hover:text-[#991B1B]"
            >
              View All ({records.length})
            </button>
          )
        }
      >
        {recentVisits.length === 0 ? (
          <EmptyLine>No clinical visits recorded yet.</EmptyLine>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentVisits.map((record) => {
              const recordId = record.id || record._id;
              return (
                <li
                  key={recordId}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-[#0F172A]">
                      {formatDisplayValue(record.chiefComplaint, "No complaint recorded")}
                      {isFollowUpVisitRecord(record) && (
                        <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1D4ED8]">
                          Follow-up
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatLongDate(getRecordDateValue(record), "Not recorded")}
                      {" · "}
                      {getServiceTypeLabel(record)}
                      {" · "}
                      <span className="font-mono">{getRecordIdLabel(record)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RecordOutcomeBadge record={record} align="end" />
                    <button
                      type="button"
                      onClick={() => onViewRecord?.(recordId)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
                    >
                      View Record
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </OverviewCard>

      <OverviewCard
        title="Care Status"
        icon={<CalendarClock size={14} className="text-[#B91C1C]" />}
      >
        <div
          className={`rounded-lg border px-3 py-2.5 text-[12px] font-bold ${careStatus.tone}`}
        >
          {careStatus.label}
          <p className="mt-0.5 text-[11px] font-semibold opacity-80">
            {careStatus.detail}
          </p>
        </div>
        {activeFollowUp && (
          <Link
            to={`${basePath}/follow-ups/${activeFollowUp.id}`}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#B91C1C] transition hover:text-[#991B1B]"
          >
            View Follow-up Details
            <ChevronRight size={13} />
          </Link>
        )}
      </OverviewCard>

      <OverviewCard
        title="Referral Snapshot"
        icon={<ClipboardList size={14} className="text-[#B91C1C]" />}
      >
        {!latestReferral ? (
          <EmptyLine>No active referrals.</EmptyLine>
        ) : (
          <div>
            <SummaryRow
              label="Date Referred"
              value={formatLongDate(
                latestReferral.dateReferred ||
                  latestReferral.referralDate ||
                  latestReferral.createdAt,
                "Not recorded",
              )}
            />
            <SummaryRow
              label="Facility"
              value={formatDisplayValue(
                latestReferral.receivingFacility ||
                  latestReferral.ruralHealthUnit?.name ||
                  latestReferral.facility,
                "Not recorded",
              )}
            />
            <SummaryRow
              label="Reason"
              value={formatDisplayValue(
                latestReferral.reasonForReferral || latestReferral.reason,
                "Not recorded",
              )}
            />
            <SummaryRow
              label="Status"
              value={formatDisplayValue(latestReferral.status, "Pending")}
            />
            <button
              type="button"
              onClick={() =>
                onViewReferral?.(
                  latestReferral.trackingId || latestReferral.id,
                )
              }
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#B91C1C] transition hover:text-[#991B1B]"
            >
              View Referral Details
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </OverviewCard>

      <OverviewCard
        title="Patient Background"
        icon={<HeartPulse size={14} className="text-[#B91C1C]" />}
      >
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Current Diseases
          </p>
          {currentDiseases.length === 0 ? (
            <p className="mt-1 text-[12px] text-slate-400">None reported</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {currentDiseases.map((disease) => (
                <span
                  key={disease.name}
                  className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-semibold text-[#B91C1C]"
                >
                  {disease.name}
                  {disease.status ? ` · ${disease.status}` : ""}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3">
            <SummaryRow
              label="Allergies"
              value={formatDisplayValue(background.allergies, "None reported")}
            />
            <SummaryRow
              label="Occupation"
              value={formatDisplayValue(patient?.occupation, "Not recorded")}
            />
            <SummaryRow
              label="Civil Status"
              value={formatDisplayValue(patient?.civilStatus, "Not recorded")}
            />
          </div>
        </div>
      </OverviewCard>

      <OverviewCard
        title="Recent Medicines Dispensed"
        icon={<Pill size={14} className="text-[#B91C1C]" />}
      >
        {dispensedMedicines.length === 0 ? (
          <EmptyLine>No medicines dispensed yet.</EmptyLine>
        ) : (
          <ul className="space-y-2">
            {dispensedMedicines.map((medicine, index) => (
              <li
                key={`${medicine.medicineId || medicine.name || "medicine"}-${index}`}
                className="flex items-start justify-between gap-3"
              >
                <span className="min-w-0 text-[12px] font-semibold text-slate-700">
                  {formatDisplayValue(
                    medicine.medicineName || medicine.name,
                    "Medicine",
                  )}
                  <span className="ml-1 font-normal text-slate-400">
                    x{formatDisplayValue(medicine.quantity, "1")}
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] text-slate-400">
                  {formatLongDate(medicine.recordDate, "")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </OverviewCard>

      <OverviewCard
        title="Visit Summary"
        icon={<FileText size={14} className="text-[#B91C1C]" />}
      >
        <SummaryRow label="Total Visits" value={String(records.length)} />
        <SummaryRow
          label="Last Visit"
          value={
            records.length
              ? formatLongDate(getRecordDateValue(records[0]), "Not recorded")
              : "No visits yet"
          }
        />
        <SummaryRow label="Referrals" value={String(referrals.length)} />
      </OverviewCard>
    </div>
  );
}
