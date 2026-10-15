import { conditionEventSourceLabel, conditionStatusLabel } from "../../../utils/medicalConditions";
import { formatShortDate } from "../../../utils/patientProfile";

export const LEGACY_PENDING_LABEL = "Legacy — Pending RHU Verification";
export const UNVERIFIED_LABEL = "Unverified — recorded from BHC consultation";

const STATUS_TONE = {
  active: "bg-alert-50 text-alert-700 ring-alert-100",
  controlled: "bg-warning-50 text-warning-700 ring-warning-100",
  under_evaluation: "bg-info-50 text-info-700 ring-info-100",
  resolved: "bg-success-50 text-success-700 ring-success-100",
  ruled_out: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

function GroupHeading({ children }) {
  return <p className="text-xs font-medium text-neutral-500">{children}</p>;
}

/** Marks a condition the consultation is following today (picked in Start Consultation). */
function AddressedBadge() {
  return (
    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 ring-1 ring-inset ring-ink-100">
      Addressed in this visit
    </span>
  );
}

const CHIP = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

function Row({ name, chip, lines = [], badge, children }) {
  return (
    <li className="py-1.5 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-[13px] font-medium text-neutral-900">{name}</span>
        {chip}
      </div>
      {lines.filter(Boolean).map((line) => (
        <p key={line} className="mt-0.5 text-xs text-neutral-500">
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
      <ul className="mt-1 divide-y divide-neutral-100">{children}</ul>
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
        legacy ? "Monitored at BHC; not yet confirmed by RHU" : `Confirmed by RHU · ${formatShortDate(condition.confirmedAt)}`,
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
    <li className="text-xs text-neutral-500">
      {parts.filter(Boolean).join(" · ")}
      {event.note ? <span className="block break-words text-neutral-600">{event.note}</span> : null}
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
 * (RHU-confirmed), Legacy — Pending RHU Verification (monitored before confirmation
 * existed), Under Evaluation,
 * Unverified (legacy BHC consultation entries), Patient-Reported Previous Conditions, and Past
 * (collapsed, with each status change). Read-only; `groups` is the result of
 * groupMedicalConditions. Only Confirmed / Monitored counts as an alert.
 */
export default function MedicalConditionsGroups({ groups, isLoading = false, isError = false }) {
  const {
    confirmed = [],
    legacyPending = [],
    underEvaluation = [],
    unverified = [],
    patientReported = [],
    past = [],
  } = groups || {};
  const empty = [confirmed, legacyPending, underEvaluation, unverified, patientReported, past].every((group) => group.length === 0);

  return (
    <div className="space-y-3">
      {isLoading && <p role="status" className="text-[13px] text-neutral-500">Loading RHU-confirmed conditions...</p>}
      {isError && (
        <p role="alert" className="text-[13px] text-neutral-500">
          RHU-confirmed conditions could not be loaded right now.
        </p>
      )}
      {empty && !isLoading && !isError && <p className="text-[13px] text-neutral-500">No documented conditions yet.</p>}

      {confirmed.length > 0 && (
        <Group title="Confirmed / Monitored">
          {confirmed.map((condition) => (
            <ConfirmedRow key={`${condition.kind}-${condition.id}`} condition={condition} />
          ))}
        </Group>
      )}
      {legacyPending.length > 0 && (
        <Group title={LEGACY_PENDING_LABEL}>
          {legacyPending.map((condition) => (
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
          <summary className="cursor-pointer rounded-md text-xs font-medium text-neutral-500 hover:text-neutral-900">
            Past ({past.length})
          </summary>
          <ul className="mt-1 divide-y divide-neutral-100">
            {past.map((condition) => (
              <PastCondition key={condition.id} condition={condition} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
