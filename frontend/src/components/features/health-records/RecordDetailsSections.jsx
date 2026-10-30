import { Link } from "react-router";
import { formatLongDate } from "../../../utils/formatters";
import { formatDisplayTime, getRecordDateValue, getRecordVisitTypeValue } from "./recordDetailsHelpers";
import { recordDetailsPresentation, relatedVisitSummary } from "./recordDetailsPresentation";

export function ReportingCategories({ groups, print = false }) {
  const items = groups || [];
  if (!items.length) return null;
  return <div className={print ? "bhc-print-grid bhc-print-grid-3" : "grid gap-4 sm:grid-cols-3"}>
    {items.map(({ label, names }) => <div key={label}>
      <h3 className={print ? "bhc-print-k" : "mb-1 text-sm font-semibold text-neutral-900"}>{label}</h3>
      {names.length ? <ul className={print ? "bhc-print-list" : "space-y-1 text-sm text-neutral-800"}>{names.map((name) => <li key={name}>{name}</li>)}</ul>
        : <p className={print ? "bhc-print-muted" : "text-sm text-neutral-500"}>No entries recorded.</p>}
    </div>)}
  </div>;
}

function factClass(print) {
  return {
    grid: print ? "bhc-print-grid bhc-print-grid-2" : "grid gap-x-6 gap-y-3 sm:grid-cols-2",
    label: print ? "bhc-print-k" : "text-[10px] font-bold uppercase tracking-wide text-neutral-500",
    value: print ? "bhc-print-v" : "mt-1 text-sm font-medium text-neutral-900",
    heading: print ? "bhc-print-k" : "text-sm font-semibold text-neutral-900",
    prose: print ? "bhc-print-prose" : "mt-1.5 max-w-[75ch] whitespace-pre-wrap text-sm leading-relaxed text-neutral-800",
    muted: print ? "bhc-print-muted" : "text-sm text-neutral-500",
  };
}

function FactPair({ items, print = false }) {
  const visible = (items || []).filter((item) => item?.value);
  if (!visible.length) return null;
  const styles = factClass(print);
  return <dl className={styles.grid}>
    {visible.map((item) => <div key={item.label}>
      <dt className={styles.label}>{item.label}</dt>
      <dd className={styles.value}>{item.value}</dd>
    </div>)}
  </dl>;
}

function FullWidthFact({ label, value, print = false }) {
  if (!value) return null;
  const styles = factClass(print);
  return <div>
    <p className={styles.label}>{label}</p>
    <p className={styles.prose}>{value}</p>
  </div>;
}

function FollowUpFacts({ schedule, print = false }) {
  return <div className={print ? "space-y-2" : "space-y-3"}>
    <FactPair print={print} items={[
      { label: "Scheduled date", value: formatLongDate(schedule.date, "Date not recorded") },
      { label: "Scheduled time", value: schedule.time ? formatDisplayTime(schedule.time, schedule.time) : "" },
    ]} />
    <FullWidthFact label="Follow-up purpose" value={schedule.reason} print={print} />
  </div>;
}

function ReferralFacts({ referral, print = false }) {
  if (!referral) return null;
  return <div className={print ? "space-y-2" : "space-y-3"}>
    <FactPair print={print} items={[
      { label: "Receiving facility", value: referral.facility },
      { label: "Urgency", value: referral.urgency },
      { label: "Tracking reference", value: referral.trackingId },
    ]} />
    <FullWidthFact label="Reason for referral" value={referral.reason} print={print} />
  </div>;
}

function ModuleLinks({ referralHref, followUpHref, print = false }) {
  if (print || (!referralHref && !followUpHref)) return null;
  return <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
    {referralHref ? <Link className="font-medium text-neutral-900 underline underline-offset-4 focus-visible:outline-2" to={referralHref}>View in Referrals</Link> : null}
    {followUpHref ? <Link className="font-medium text-neutral-900 underline underline-offset-4 focus-visible:outline-2" to={followUpHref}>View in Follow-ups</Link> : null}
  </p>;
}

export function HealthConcernsAndCareOutcomes({
  record,
  linkedReferral = null,
  monitoringNotes = "",
  nextAppointmentDate = "",
  print = false,
}) {
  const {
    concerns,
    unmappedReporting,
    visitFollowUps,
    visitReferral,
    referralHref,
    followUpHref,
    schedules,
    legacy,
  } = recordDetailsPresentation(record, linkedReferral);
  const styles = factClass(print);
  const visitAppointment = !schedules.length && nextAppointmentDate
    ? { id: "next-appointment", date: nextAppointmentDate, time: "", reason: "" }
    : null;
  const unlabeledFollowUps = visitAppointment ? [...visitFollowUps, visitAppointment] : visitFollowUps;
  const hasVisitLevel = unlabeledFollowUps.length || visitReferral || legacy.length || unmappedReporting.length
    || monitoringNotes || referralHref || followUpHref;
  if (!concerns.length && !hasVisitLevel) {
    return <p className={styles.muted}>No health concerns or reporting recorded.</p>;
  }
  return <div className={print ? "space-y-4" : "space-y-5"}>
    {concerns.length > 0 && <p className={print ? "bhc-print-muted" : "text-xs text-neutral-500"}>Health concerns recorded during this visit. They are not RHU-confirmed diagnoses.</p>}
    {concerns.length > 0 && <ul className={print ? "bhc-print-list space-y-4" : "divide-y divide-neutral-100"}>
      {concerns.map((item) => <li key={item.key} className={print ? "space-y-2" : "space-y-3 py-3 first:pt-0 last:pb-0"}>
        <p className={print ? undefined : "text-sm font-medium text-neutral-900"}>{item.name}</p>
        <FactPair print={print} items={[
          { label: "Care outcome", value: item.outcome },
          { label: "Reporting", value: item.reporting },
        ]} />
        {item.referral && <div className={print ? "space-y-2" : "space-y-3"}>
          <h3 className={styles.heading}>Referral</h3>
          <ReferralFacts referral={item.referral} print={print} />
        </div>}
        {item.followUps.map((schedule) => <div key={schedule.id} className={print ? "space-y-2" : "space-y-3"}>
          <h3 className={styles.heading}>Follow-up</h3>
          <FollowUpFacts schedule={schedule} print={print} />
        </div>)}
      </li>)}
    </ul>}
    {unlabeledFollowUps.length > 0 && <section aria-label="Visit-level follow-up" className={print ? "space-y-2" : "space-y-3"}>
      <h3 className={styles.heading}>Visit-level follow-up</h3>
      <p className={print ? "bhc-print-muted" : "text-xs text-neutral-500"}>Recorded for this visit and not linked to an individual health concern.</p>
      {unlabeledFollowUps.map((schedule) => <FollowUpFacts key={schedule.id} schedule={schedule} print={print} />)}
    </section>}
    {visitReferral && <section aria-label={visitReferral.urgency || visitReferral.facility || visitReferral.reason ? "Visit-level referral" : "Referral tracking"} className={print ? "space-y-2" : "space-y-3"}>
      <h3 className={styles.heading}>{visitReferral.urgency || visitReferral.facility || visitReferral.reason ? "Visit-level referral" : "Referral tracking"}</h3>
      {visitReferral.urgency || visitReferral.facility || visitReferral.reason
        ? <p className={print ? "bhc-print-muted" : "text-xs text-neutral-500"}>Recorded for this visit and not linked to an individual health concern.</p>
        : null}
      <ReferralFacts referral={visitReferral} print={print} />
    </section>}
    {monitoringNotes ? <FullWidthFact label="Monitoring notes" value={monitoringNotes} print={print} /> : null}
    {legacy.length > 0 && <section aria-label="Legacy Recorded Information">
      <h3 className={styles.heading}>Legacy Recorded Information</h3>
      <p className={styles.muted}>Historical values only; these do not indicate a current outcome or active task.</p>
      <dl className={print ? "bhc-print-grid bhc-print-grid-2" : "mt-2 grid gap-2 text-sm sm:grid-cols-2"}>
        {legacy.map((item) => <div key={item.label}><dt className={styles.muted}>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>
    </section>}
    {unmappedReporting.length > 0 && <section aria-label="Recorded reporting">
      <h3 className={styles.heading}>Recorded reporting</h3>
      <p className={print ? "bhc-print-muted" : "text-xs text-neutral-500"}>Saved at record level and not mapped to an individual health concern.</p>
      <ReportingCategories groups={unmappedReporting} print={print} />
    </section>}
    <ModuleLinks referralHref={referralHref} followUpHref={followUpHref} print={print} />
  </div>;
}

export function RelatedConsultationHistory({ record, linkedReferral, print = false }) {
  const { related } = recordDetailsPresentation(record, linkedReferral);
  if (!related.length) return null;
  return <ol className={print ? "bhc-print-list" : "divide-y divide-neutral-100 text-sm"}>
    {related.map((row) => <li key={row.id} className={print ? undefined : "py-2"}>
      {print ? `Record #${row.id}` : <Link className="font-medium text-neutral-900 underline underline-offset-4 focus-visible:outline-2" to={`/bhc/health-records/${row.id}`}>Record #{row.id}</Link>}
      {" · "}{row.relationshipOnly ? "Related consultation" : getRecordVisitTypeValue(row) === "follow_up_visit" ? "Follow-up Visit" : "Initial Consultation"}
      {" · "}{formatLongDate(getRecordDateValue(row), "Date not recorded")}
      {relatedVisitSummary(row) ? ` · ${relatedVisitSummary(row)}` : ""}
    </li>)}
  </ol>;
}
