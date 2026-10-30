import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { getPatientConditions } from "../../../services/patientConditionService";
import { getCurrentUser } from "../../../utils/auth";
import { can } from "../../../utils/actionPermissions";
import { queryKeys } from "../../../utils/queryKeys";
import { conditionStatusLabel } from "../../../utils/medicalConditions";
import {
  CONDITION_STATUS_OPTIONS,
  MAX_LEGACY_REASON_LENGTH,
  applyLegacyDecision,
  canRecommendBhcMonitoring,
  existingConditionRow,
  legacyDecisionRow,
  patchConditionRow,
} from "../../../utils/conditionConfirmations";
import { formatShortDate } from "../../../utils/patientProfile";

const OPEN_STATUSES = new Set(["under_evaluation", "active", "controlled"]);

const FIELD_CLASS =
  "h-10 w-full rounded-lg border bg-white px-3 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

function fieldClass(error) {
  return `${FIELD_CLASS} ${error ? "border-red-400" : "border-[#E5E7EB]"}`;
}

function FieldError({ message }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

function Label({ children }) {
  return (
    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
      {children}
    </label>
  );
}

/**
 * `bare` is the row for a legacy monitoring's Confirm / Correct decision: it is
 * always set on the record and its name comes from that decision, so only the
 * status, note and recommendation are shown, without a card of its own.
 */
function ConditionRow({ title, row, errors, index, onPatch, onRemove, nameField, bare = false }) {
  const error = (field) => errors?.[`conditionConfirmations.${index}.${field}`];
  const monitorable = canRecommendBhcMonitoring(row.status);

  return (
    <div className={bare ? "space-y-3" : "space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"}>
      {!bare && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {nameField || (
              <>
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <FieldError message={error("name")} />
              </>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove condition"
              className="mt-6 text-slate-400 transition-colors hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <Label>Status</Label>
          <select
            name={`conditionConfirmations.${index}.status`}
            value={row.status}
            onChange={(event) => onPatch({ status: event.target.value, setOnRecord: true })}
            className={fieldClass(error("status"))}
          >
            <option value="">Select status</option>
            {CONDITION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError message={error("status")} />
        </div>
        <div>
          <Label>Note</Label>
          <input
            type="text"
            name={`conditionConfirmations.${index}.note`}
            value={row.note}
            maxLength={500}
            onChange={(event) => onPatch({ note: event.target.value })}
            placeholder="Optional note"
            className={fieldClass(error("note"))}
          />
          <FieldError message={error("note")} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {!bare && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={row.setOnRecord}
              onChange={(event) => onPatch({ setOnRecord: event.target.checked })}
            />
            Set on patient's record
          </label>
        )}
        <label
          className={`flex items-center gap-2 text-sm ${monitorable ? "text-slate-700" : "text-slate-400"}`}
        >
          <input
            type="checkbox"
            checked={monitorable && row.recommend}
            disabled={!monitorable}
            onChange={(event) => onPatch({ recommend: event.target.checked, setOnRecord: true })}
          />
          Recommend BHC monitoring
        </label>
      </div>
      <FieldError message={error("recommend")} />
    </div>
  );
}

const LEGACY_DECISIONS = [
  { value: "confirm", label: "Confirm" },
  { value: "correct", label: "Correct" },
  { value: "discontinue", label: "Discontinue" },
  { value: "", label: "No decision" },
];

/** One legacy monitoring: its label, a decision, and only the inputs that decision needs. */
function LegacyReviewItem({ monitoring, legacy, rows, errors, onDecide, onPatchRow }) {
  const key = (field) => `legacyMonitoringDiscontinuations.${monitoring.id}.${field}`;
  const rowIndex = rows.findIndex((row) => row.legacyMonitoringId === monitoring.id);
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  const nameError = rowIndex >= 0 ? errors?.[`conditionConfirmations.${rowIndex}.name`] : null;

  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-medium text-slate-800">
        Legacy — Pending RHU Verification — {monitoring.conditionName}
        {monitoring.startedAt ? `, since ${formatShortDate(monitoring.startedAt)}` : ""}
      </p>
      <fieldset data-field={key("decision")} tabIndex={errors?.[key("decision")] ? -1 : undefined}>
        <legend className="sr-only">Decision for {monitoring.conditionName}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {LEGACY_DECISIONS.map((option) => (
            <label key={option.label} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name={`legacy-decision-${monitoring.id}`}
                value={option.value}
                checked={legacy.decision === option.value}
                onChange={() => onDecide({ decision: option.value })}
                className="accent-[#B91C1C]"
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldError message={errors?.[key("decision")]} />
      </fieldset>

      {legacy.decision === "correct" && (
        <div>
          <Label>Corrected condition</Label>
          <input
            type="text"
            name={key("correctedName")}
            value={legacy.correctedName}
            maxLength={150}
            autoComplete="off"
            onChange={(event) => onDecide({ correctedName: event.target.value })}
            placeholder="Condition name"
            className={fieldClass(errors?.[key("correctedName")] || nameError)}
          />
          <FieldError message={errors?.[key("correctedName")] || nameError} />
          <p className="mt-1 text-xs text-slate-500">
            The legacy monitoring is discontinued as "Corrected by RHU to {legacy.correctedName.trim() || "…"}" and kept as history.
          </p>
        </div>
      )}

      {legacy.decision === "discontinue" && (
        <div>
          <Label>Reason for discontinuing</Label>
          <input
            type="text"
            name={key("reason")}
            value={legacy.reason}
            maxLength={MAX_LEGACY_REASON_LENGTH}
            autoComplete="off"
            onChange={(event) => onDecide({ reason: event.target.value })}
            placeholder="Required"
            className={fieldClass(errors?.[key("reason")])}
          />
          <FieldError message={errors?.[key("reason")]} />
        </div>
      )}

      {legacy.decision === "confirm" && (
        <p className="text-xs text-slate-500">
          Only Active or Controlled verifies this monitoring; otherwise choose Discontinue.
        </p>
      )}
      {legacy.decision === "confirm" && <FieldError message={nameError} />}
      {row && (
        <ConditionRow bare row={row} index={rowIndex} errors={errors} onPatch={(patch) => onPatchRow(rowIndex, patch)} />
      )}
    </li>
  );
}

/**
 * RHU-only block: set a patient condition's clinical status. State lives in the
 * form (`rows`, see utils/conditionConfirmations.js); this only edits it. The
 * condition name is plain text - no suggestions.
 */
export default function ConfirmConditionsBlock({
  patientId,
  rows,
  onChange,
  legacyRows = [],
  onLegacyChange = () => {},
  errors,
  context = [],
}) {
  const allowed = can(getCurrentUser(), "conditions.confirm");
  const { data } = useQuery({
    queryKey: queryKeys.patientConditions(patientId),
    queryFn: () => getPatientConditions(patientId),
    enabled: allowed && Boolean(patientId),
  });

  if (!allowed) return null;

  const existing = (data?.conditions || []).filter((condition) => OPEN_STATUSES.has(condition.status));
  const legacyMonitorings = data?.legacyMonitorings || [];
  const contextLines = context.filter((item) => item?.value);
  // Every legacy monitoring has a decision row, undecided until the RHU chooses.
  const legacyDecisions = legacyMonitorings.map(
    (monitoring) => legacyRows.find((row) => row.monitoringId === monitoring.id) || legacyDecisionRow(monitoring),
  );

  function decideLegacy(monitoringId, patch) {
    const next = applyLegacyDecision(rows, legacyDecisions, monitoringId, patch);
    onChange(next.rows);
    onLegacyChange(next.legacyRows);
  }

  function patchRow(index, patch) {
    onChange(rows.map((row, i) => (i === index ? patchConditionRow(row, patch) : row)));
  }

  function patchExisting(condition, patch) {
    const index = rows.findIndex((row) => row.conditionId === condition.id);
    if (index >= 0) return patchRow(index, patch);
    return onChange([...rows, patchConditionRow(existingConditionRow(condition), patch)]);
  }

  function addRow() {
    onChange([
      ...rows,
      { conditionId: null, name: "", status: "", note: "", setOnRecord: true, recommend: false },
    ]);
  }

  return (
    <div className="space-y-4" data-field="conditionConfirmations">
      <p className="text-xs text-slate-500">
        Only RHU staff set a condition's status. Nothing here changes the patient's record unless
        "Set on patient's record" is ticked.
      </p>
      {contextLines.length > 0 && (
        <dl className="grid gap-2 rounded-lg border border-slate-100 bg-white p-3 text-xs text-slate-600 sm:grid-cols-2">
          {contextLines.map((item) => (
            <div key={item.label}>
              <dt className="font-medium uppercase tracking-wider text-slate-400">{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {legacyMonitorings.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Already monitored at BHC
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Not yet verified by RHU. Corrected or discontinued monitoring is stopped, never deleted; its
            visits stay in the history. With no decision it stays pending.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {legacyMonitorings.map((monitoring, i) => (
              <LegacyReviewItem
                key={monitoring.id}
                monitoring={monitoring}
                legacy={legacyDecisions[i]}
                rows={rows}
                errors={errors}
                onDecide={(patch) => decideLegacy(monitoring.id, patch)}
                onPatchRow={patchRow}
              />
            ))}
          </ul>
          <FieldError message={errors?.legacyMonitoringDiscontinuations} />
        </div>
      )}

      {existing.map((condition) => {
        const index = rows.findIndex((row) => row.conditionId === condition.id);
        const row = index >= 0 ? rows[index] : existingConditionRow(condition);
        return (
          <ConditionRow
            key={condition.id}
            title={`${condition.conditionName} (currently ${conditionStatusLabel(condition.status)})`}
            row={row}
            index={index}
            errors={errors}
            onPatch={(patch) => patchExisting(condition, patch)}
          />
        );
      })}

      {rows.map((row, index) =>
        row.conditionId || row.legacyMonitoringId ? null : (
          <ConditionRow
            key={index}
            row={row}
            index={index}
            errors={errors}
            onPatch={(patch) => patchRow(index, patch)}
            onRemove={() => onChange(rows.filter((_, i) => i !== index))}
            nameField={
              <>
                <Label>Condition</Label>
                <input
                  type="text"
                  name={`conditionConfirmations.${index}.name`}
                  value={row.name}
                  maxLength={150}
                  autoComplete="off"
                  onChange={(event) => patchRow(index, { name: event.target.value })}
                  placeholder="Condition name"
                  className={fieldClass(errors?.[`conditionConfirmations.${index}.name`])}
                />
                <FieldError message={errors?.[`conditionConfirmations.${index}.name`]} />
              </>
            }
          />
        ),
      )}

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#B91C1C] hover:text-[#B91C1C]"
      >
        <Plus size={14} />
        Confirm condition
      </button>
      <FieldError message={errors?.conditionConfirmations} />
    </div>
  );
}
