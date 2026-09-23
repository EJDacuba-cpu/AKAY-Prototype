import { Link } from "react-router";
import {
  Activity,
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
import { Card, CardContent } from "../../ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";

const RECENT_VISIT_LIMIT = 3;

function OverviewCard({ title, icon, action, children, className = "" }) {
  return (
    <Card
      className={`flex min-w-0 flex-col bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h3 className="flex items-center gap-2 font-sans! text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </h3>
        {action}
      </header>
      <CardContent className="min-w-0 flex-1 p-5">{children}</CardContent>
    </Card>
  );
}

function EmptyLine({ children }) {
  return (
    <p className="rounded-2xl border border-slate-100 bg-white px-3 py-5 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </p>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-sm text-slate-500">
        {label}
      </span>
      <span className="min-w-0 break-words text-sm font-semibold text-slate-900">
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
  activePrograms = [],
  basePath = "/bhc",
  onViewRecord,
  onViewReferral,
  onViewAllRecords,
}) {
  const recentVisits = records.slice(0, RECENT_VISIT_LIMIT);
  const latestReferral = referrals[0] || null;
  const background = patient?.medicalBackground || {};
  const familyHistory = background.familyHistory || {};
  const personalSocial = background.personalSocial || {};
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
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
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
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-slate-900">
                      {formatDisplayValue(record.chiefComplaint, "No complaint recorded")}
                      {isFollowUpVisitRecord(record) && (
                        <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-[#1D4ED8]">
                          Follow-up
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {formatLongDate(getRecordDateValue(record), "Not recorded")}
                      {" · "}
                      {getServiceTypeLabel(record)}
                      {" · "}
                      <span className="font-sans">{getRecordIdLabel(record)}</span>
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
        <div className="mt-3">
          <SummaryRow
            label="Active Program"
            value={
              activePrograms.length
                ? activePrograms.join(", ")
                : "No Active Program"
            }
          />
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
        title="Medical History"
        icon={<HeartPulse size={14} className="text-[#B91C1C]" />}
        className="xl:col-span-2"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <section className="min-w-0" aria-label="Personal medical history">
            <h4 className="font-sans! text-xs font-semibold text-slate-700">Current Diseases</h4>
            {currentDiseases.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None reported</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {currentDiseases.map((disease) => (
                  <span key={disease.name} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                    {disease.name}{disease.status ? " · " + disease.status : ""}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3">
              <SummaryRow label="Allergies" value={formatDisplayValue(background.allergies, "Not yet recorded")} />
              <SummaryRow label="Hospitalizations" value={formatDisplayValue(background.hospitalizations, "Not yet recorded")} />
              <SummaryRow label="Surgeries" value={formatDisplayValue(background.surgeries, "Not yet recorded")} />
            </div>
          </section>
          <section className="min-w-0 border-t border-slate-200 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5" aria-label="Family medical history">
            <h4 className="mb-2 font-sans! text-xs font-semibold text-slate-700">Family History</h4>
            <SummaryRow label="Similar Illness" value={formatDisplayValue(familyHistory.similarIllness, "Not yet recorded")} />
            <SummaryRow label="Chronic Illness" value={formatDisplayValue(familyHistory.chronicIllness, "Not yet recorded")} />
            <SummaryRow label="Hereditary Illness" value={formatDisplayValue(familyHistory.hereditaryIllness, "Not yet recorded")} />
          </section>
        </div>
      </OverviewCard>

      <Card className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Accordion type="single" collapsible>
          <AccordionItem value="personal-social">
            <AccordionTrigger>
              <span className="flex items-center gap-2"><Activity size={14} className="text-slate-500" aria-hidden="true" />Personal &amp; Social</span>
            </AccordionTrigger>
            <AccordionContent>
              <SummaryRow label="Occupation" value={formatDisplayValue(patient?.occupation, "Not recorded")} />
              <SummaryRow label="Dietary History" value={formatDisplayValue(personalSocial.diet, "Not yet recorded")} />
              <SummaryRow label="Smoking" value={formatDisplayValue(personalSocial.smoking, "Not yet recorded")} />
              <SummaryRow label="Alcohol" value={formatDisplayValue(personalSocial.alcohol, "Not yet recorded")} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="medicines">
            <AccordionTrigger>
              <span className="flex items-center gap-2"><Pill size={14} className="text-slate-500" aria-hidden="true" />Recent Medicines Dispensed</span>
            </AccordionTrigger>
            <AccordionContent>
              {dispensedMedicines.length === 0 ? (
                <EmptyLine>No medicines dispensed yet.</EmptyLine>
              ) : (
                <ul className="space-y-2">
                  {dispensedMedicines.map((medicine, index) => (
                    <li key={(medicine.medicineId || medicine.name || "medicine") + "-" + index} className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0 text-sm font-medium text-slate-700">
                        {formatDisplayValue(medicine.medicineName || medicine.name, "Medicine")}
                        <span className="ml-1 font-normal text-slate-500">x{formatDisplayValue(medicine.quantity, "1")}</span>
                      </span>
                      <span className="shrink-0 text-sm text-slate-500">{formatLongDate(medicine.recordDate, "")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

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
