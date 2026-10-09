import { AddressedBadge, GroupHeading } from "./background/BackgroundFields";
import { conditionEventSourceLabel, conditionStatusLabel } from "../../../utils/medicalConditions";
import { formatShortDate } from "../../../utils/patientProfile";

export const UNVERIFIED_LABEL = "Unverified — recorded from BHC consultation";

const STATUS_TONE = {
  active: "border-red-200 bg-red-50 text-red-700",
  controlled: "border-amber-200 bg-amber-50 text-amber-700",
  under_evaluation: "border-slate-200 bg-slate-50 text-slate-600",
  resolved: "border-green-200 bg-green-50 text-green-700",
  ruled_out: "border-slate-200 bg-slate-50 text-slate-600",
};

const CHIP = "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

function Row({ name, chip, lines = [], badge, children }) {
  return (
    <li className="py-1 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{name}</span>
        {chip}
      </div>
      {lines.filter(Boolean).map((line) => (
        <p key={line} className="mt-0.5 text-[11px] text-slate-500">
          {line}
        </p>
      ))}
      {badge}
      {children}
    </li>
  );
}

function StatusChip({ status }) {
  const label = conditionStatusLabel(status);
  if (!label) return null;
  return <span className={`${CHIP} ${STATUS_TONE[status] || STATUS_TONE.ruled_out}`}>{label}</span>;
}

function Group({ title, children }) {
  return (
    <div>
      <GroupHeading>{title}</GroupHeading>
      <ul className="mt-1 divide-y divide-gray-100">{children}</ul>
    </div>
  );
}

function monitoredSince(condition) {
  const startedAt = condition.kind === "legacy-monitoring" ? condition.startedAt : condition.monitoring?.startedAt;
  return startedAt ? `Monitored at BHC since ${formatShortDate(startedAt)}` : "";
}

/** A closed or under-evaluation condition whose BHC monitoring is still active (the RHU does not stop it). */
function stillMonitored(condition) {
  const startedAt = condition.monitoring?.startedAt;
  return condition.monitoring ? `Still monitored at BHC${startedAt ? ` since ${formatShortDate(startedAt)}` : ""}` : "";
}

function ConfirmedRow({ condition }) {
  const legacy = condition.kind === "legacy-monitoring";
  return (
    <Row
      name={condition.conditionName}
      chip={legacy ? null : <StatusChip status={condition.status} />}
      lines={[
        legacy ? "Legacy BHC Monitoring" : `Confirmed by RHU · ${formatShortDate(condition.confirmedAt)}`,
        monitoredSince(condition),
      ]}
      badge={condition.addressed ? <div className="mt-1"><AddressedBadge /></div> : null}
    />
  );
}

function EventLine({ event }) {
  const change = event.fromStatus
    ? `${conditionStatusLabel(event.fromStatus)} → ${conditionStatusLabel(event.toStatus)}`
    : conditionStatusLabel(event.toStatus);
  const parts = [change, event.changedByName, formatShortDate(event.changedAt), conditionEventSourceLabel(event.sourceType)];
  return (
    <li className="text-[11px] text-slate-500">
      {parts.filter(Boolean).join(" · ")}
      {event.note ? <span className="block break-words text-slate-600">{event.note}</span> : null}
    </li>
  );
}

function PastCondition({ condition }) {
  return (
    <Row name={condition.conditionName} chip={<StatusChip status={condition.status} />} lines={[stillMonitored(condition)]}>
      {condition.events?.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {condition.events.map((event, index) => (
            <EventLine key={`${event.changedAt}-${index}`} event={event} />
          ))}
        </ul>
      )}
    </Row>
  );
}

/**
 * A patient's medical conditions by clinical source: Confirmed / Monitored
 * (RHU-confirmed, or monitored before confirmation existed), Under Evaluation,
 * Unverified (legacy BHC consultation entries), Patient-Reported Previous Conditions, and Past
 * (collapsed, with each status change). Read-only; `groups` is the result of
 * groupMedicalConditions. Only Confirmed / Monitored ever counts as an alert.
 */
export default function MedicalConditionsGroups({ groups, isLoading = false, isError = false }) {
  const { confirmed = [], underEvaluation = [], unverified = [], patientReported = [], past = [] } = groups || {};
  const empty = [confirmed, underEvaluation, unverified, patientReported, past].every((group) => group.length === 0);

  return (
    <div className="space-y-3">
      {isLoading && <p role="status" className="text-xs text-slate-500">Loading RHU-confirmed conditions...</p>}
      {isError && (
        <p role="alert" className="text-xs text-slate-500">
          RHU-confirmed conditions could not be loaded right now.
        </p>
      )}
      {empty && !isLoading && !isError && <p className="text-xs text-slate-500">No documented conditions yet.</p>}

      {confirmed.length > 0 && (
        <Group title="Confirmed / Monitored">
          {confirmed.map((condition) => (
            <ConfirmedRow key={`${condition.kind}-${condition.id}`} condition={condition} />
          ))}
        </Group>
      )}
      {underEvaluation.length > 0 && (
        <Group title="Under Evaluation">
          {underEvaluation.map((condition) => (
            <Row
              key={condition.id}
              name={condition.conditionName}
              chip={<StatusChip status={condition.status} />}
              lines={["Under RHU evaluation", stillMonitored(condition)]}
            />
          ))}
        </Group>
      )}
      {unverified.length > 0 && (
        <Group title={UNVERIFIED_LABEL}>
          {unverified.map((disease) => (
            <Row
              key={`${disease.name}-${disease.index}`}
              name={disease.name}
              lines={[disease.firstRecorded && `First noted ${formatShortDate(disease.firstRecorded)}`]}
            />
          ))}
        </Group>
      )}
      {patientReported.length > 0 && (
        <Group title="Patient-Reported Previous Conditions">
          {patientReported.map((disease) => (
            <Row
              key={`${disease.name}-${disease.index}`}
              name={disease.name}
              lines={[disease.note, disease.firstRecorded && `Reported ${formatShortDate(disease.firstRecorded)}`]}
            />
          ))}
        </Group>
      )}
      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Past ({past.length})
          </summary>
          <ul className="mt-1 divide-y divide-gray-100">
            {past.map((condition) => (
              <PastCondition key={condition.id} condition={condition} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
