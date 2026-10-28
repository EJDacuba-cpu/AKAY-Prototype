import { useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { Button } from "../../ui/button";
import { Select } from "../../ui/select";
import { getHealthRecordsByPatient } from "../../../services/healthRecordService";
import { formatShortDate } from "../../../utils/patientProfile";
import { getBodyRegionLabel } from "../../../utils/bodyFindings";
import { BODY_FINDING_STATUS_LABELS, bodyFindingHistory, findingIdentity, recordReassessments, setFindingReassessment } from "../../../utils/bodyFindingsSummary";

export function ReassessmentChoices({ findings = [], decisions = [], onChange, readOnly = false }) {
  const instanceId = useId();
  return <ul className="divide-y divide-neutral-200">
    {findings.map((finding) => {
      const decision = decisions.find((item) => findingIdentity(item) === findingIdentity(finding));
      const stale = decision && decision.expectedRevision !== finding.revision;
      const limitReached = !decision && decisions.length >= 500;
      const controlId = `${instanceId}-reassess-${finding.sourceRecordId}-${finding.sourceFindingIndex}`;
      return <li key={finding.id} className="space-y-2 py-3">
        <label htmlFor={controlId} className="block break-words text-sm font-medium text-ink-900">
          {finding.regionLabel || getBodyRegionLabel(finding.region, finding.side)}{finding.location ? ` / ${finding.location}` : ""}: {finding.finding}
        </label>
        {finding.note && <p className="text-xs text-ink-600">{finding.note}</p>}
        <p className="text-xs text-ink-500">Record #{finding.sourceRecordId} · {formatShortDate(finding.visitDate, "Date not recorded")}</p>
        <p className="text-xs text-ink-600">Last documented status: {BODY_FINDING_STATUS_LABELS[finding.status]}</p>
        <Select id={controlId} aria-label={`Reassessment: ${finding.finding}, record ${finding.sourceRecordId}, finding ${finding.sourceFindingIndex + 1}`}
          value={decision?.status || "not_yet_reassessed"} disabled={readOnly || limitReached}
          aria-invalid={stale || undefined} aria-describedby={stale ? `${controlId}-error` : undefined}
          className="h-9 rounded-full border-neutral-300 text-ink-900"
          onChange={(event) => onChange(setFindingReassessment(decisions, finding, event.target.value))}>
          {Object.entries(BODY_FINDING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {stale && <p id={`${controlId}-error`} role="alert" className="text-xs text-red-700">Another consultation changed this finding. Select Not Yet Reassessed, then review it again.</p>}
        {limitReached && <p className="text-xs text-ink-600">This consultation has reached 500 reassessment choices.</p>}
      </li>;
    })}
  </ul>;
}

export function PreviousBodyFindings({ findings = [], decisions = [], onChange, loading, loadError, onRefresh, errors = {}, readOnly }) {
  const messages = Object.entries(errors).filter(([key]) => key.startsWith("monitoring_data.bodyFindingReassessments")).flatMap(([, value]) => value);
  const unavailable = decisions.some((item) => !findings.some((finding) => findingIdentity(item) === findingIdentity(finding)));
  return <section className="mt-4 border-t border-neutral-200 pt-4" aria-label="Previous body findings" data-field="monitoring_data.bodyFindingReassessments">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink-900">Previous body findings ({findings.length})</h3>
      <Button type="button" variant="secondary" size="sm" disabled={loading || readOnly} onClick={onRefresh}>Refresh</Button>
    </div>
    <p className="mt-2 text-xs text-ink-600">Historical observations, not confirmed conditions. Each finding starts as Not Yet Reassessed for this consultation. Choices take effect only after successful finalization.</p>
    {loading && <p role="status" className="mt-2 text-sm text-ink-600">Loading previous findings...</p>}
    {loadError && <p role="alert" className="mt-2 text-sm text-red-700">Previous findings could not be refreshed. Retry before reassessing them.</p>}
    {messages.map((message, index) => <p key={index} role="alert" className="mt-2 text-sm text-red-700">{message}</p>)}
    {unavailable && !loading && <div className="mt-2 text-sm text-red-700" role="alert">
      A selected finding is no longer available for reassessment. Clear the pending choices and review the refreshed findings.
      <Button type="button" variant="secondary" size="sm" disabled={readOnly} onClick={() => onChange([])}>Clear reassessment choices</Button>
    </div>}
    {!loading && !loadError && findings.length === 0 && <p className="mt-2 text-sm text-ink-600">No previous findings awaiting reassessment.</p>}
    <ReassessmentChoices findings={findings} decisions={decisions} onChange={onChange} readOnly={readOnly || loading || Boolean(loadError)} />
  </section>;
}

export function thisRecordBodyFindingHistory(record) {
  const originals = bodyFindingHistory([record]).filter((finding) => String(finding.sourceRecordId) === String(record?.id || record?._id));
  return { originals, events: recordReassessments(record) };
}

export function BodyFindingHistoryView({ originals = [], events = [], base = "/bhc", print = false, status = "", error = false, onRetry }) {
  const link = (id) => print
    ? `Record #${id}`
    : <Link className="underline underline-offset-4" to={`${base}/health-records/${id}`}>Record #{id}</Link>;
  if (!originals.length && !events.length && !status && !error) return null;
  return <section aria-label="Body findings and reassessment history" className={print ? undefined : "mt-5 text-sm text-ink-900"}>
    <h3 className={print ? "bhc-print-k" : "font-semibold"}>Body findings and reassessment history</h3>
    <p className={print ? "bhc-print-muted" : "mt-1 text-xs text-ink-600"}>Recorded observations only. Reassessment does not change diagnoses or care outcomes.</p>
    {status ? <p role="status" className={print ? "bhc-print-muted" : undefined}>{status}</p> : null}
    {error ? <p role="alert">Reassessment history could not be loaded. {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : null}</p> : null}
    {originals.map((finding) => <div key={finding.id} className={print ? "bhc-print-narrative" : "mt-3"}>
      <p className={print ? "bhc-print-prose" : "font-medium"}>{finding.regionLabel}{finding.location ? ` / ${finding.location}` : ""}: {finding.finding}</p>
      {finding.note && <p className={print ? "bhc-print-prose" : undefined}>{finding.note}</p>}
      <p className={print ? "bhc-print-muted" : "text-xs text-ink-600"}>Original observation · {formatShortDate(finding.visitDate, "Date not recorded")}</p>
      <p className={print ? "bhc-print-prose" : "text-xs"}>{BODY_FINDING_STATUS_LABELS[finding.status]}</p>
      <ol className={print ? "bhc-print-list" : "mt-1 space-y-1 text-xs"}>{finding.reassessments.map((event) => <li key={event.recordId}>
        {BODY_FINDING_STATUS_LABELS[event.status]} · {formatShortDate(event.visitDate, "Date not recorded")} · {link(event.recordId)}
      </li>)}</ol>
    </div>)}
    {events.length > 0 && <div className={print ? "bhc-print-narrative" : "mt-4"}><h4 className={print ? "bhc-print-k" : "font-medium"}>Reassessed during this consultation</h4>
      <ul className={print ? "bhc-print-list" : "mt-2 space-y-2"}>{events.map((event) => <li key={findingIdentity(event)}>
        <span>{event.finding?.finding || "Body finding"}: {BODY_FINDING_STATUS_LABELS[event.status]}</span>
        <span className={print ? "bhc-print-muted" : "block text-xs text-ink-600"}>Original: {link(event.sourceRecordId)} · finding {event.sourceFindingIndex + 1}</span>
      </li>)}</ul>
    </div>}
  </section>;
}

// Reuse existing record permissions and pagination. Resolved observations stay
// reachable here, including every consultation that reassessed the original.
export function BodyFindingRecordHistory({ record }) {
  const { pathname } = useLocation();
  const base = pathname.startsWith("/rhu") ? "/rhu" : "/bhc";
  const patientId = record.patientId || record.patient_id || record.patient?.id;
  const query = useQuery({ queryKey: ["body-finding-history", String(patientId)], queryFn: () => getHealthRecordsByPatient(patientId), enabled: Boolean(patientId) });
  const history = useMemo(() => bodyFindingHistory([
    ...(query.data || []).filter((item) => String(item.id) !== String(record.id)), record,
  ]), [query.data, record]);
  const originals = history.filter((finding) => String(finding.sourceRecordId) === String(record.id));
  const events = recordReassessments(record);
  if (!originals.length && !events.length) return null;
  return <BodyFindingHistoryView originals={originals} events={events} base={base}
    status={query.isPending ? "Loading reassessment history..." : ""} error={query.isError} onRetry={() => query.refetch()} />;
}
