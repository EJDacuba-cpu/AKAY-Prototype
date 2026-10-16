/**
 * An old BHC draft's staged Patient History changes (see
 * utils/legacyBackgroundRecovery). Nothing here saves or drops anything by
 * itself: the clinician keeps the changes for this consultation (they save
 * when it is finalized, through the record's revision check) or discards them
 * after a confirmation the workspace asks for.
 *
 * Collapsed (`expanded` false, after Keep) it is a one-line reminder with a
 * Show changes button. `errors` (the last save's background_update lines)
 * always show.
 */

import { Button } from "../../../ui/button";
import PatientBackgroundEditor from "../../patients/PatientBackgroundEditor";
import { sectionVisibility } from "../../../../utils/patientHistory";

const BUTTON_CLASS =
  "inline-flex items-center rounded-none border px-3 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function ChangeRows({ rows }) {
  return (
    <dl className="divide-y divide-gray-100">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-1 px-3 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
          <dt className="text-xs font-medium text-gray-500">{row.label}</dt>
          <dd className="m-0 min-w-0 break-words text-[13px] text-gray-900">
            <span className="text-gray-500">{row.before || "Not recorded"}</span>
            <span aria-hidden="true" className="px-1.5 text-gray-400">
              &rarr;
            </span>
            <span className="sr-only"> changed to </span>
            <span className="font-medium">{row.after || "Not recorded"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function LegacyBackgroundRecoveryPanel({
  recovery,
  errors = [],
  expanded = true,
  disabled = false,
  canKeep = !disabled,
  update,
  patient,
  conditions,
  today,
  onCorrect,
  onKeep,
  onDiscard,
  onShow,
}) {
  if (!recovery) return null;

  const errorList = errors.length > 0 && (
    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12.5px] text-red-700">
      {errors.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );

  if (!expanded && errors.length === 0) {
    return (
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-none border border-amber-200 bg-amber-50/70 px-4 py-2 text-[12.5px] text-amber-900"
      >
        <span>
          {recovery.hasClinicalChanges || recovery.reviewed.length > 0
            ? "Patient History changes from an earlier draft are kept. They save when this consultation is finalized."
            : "Text from an earlier draft is kept for reference. A consultation no longer saves it."}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={onShow}
          className={`${BUTTON_CLASS} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}
        >
          Show changes
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="Patient History changes from an earlier draft"
      className="mb-4 rounded-none border border-amber-200 bg-amber-50 p-4"
    >
      <p className="text-[13px] font-bold text-amber-900">Patient History changes from an earlier draft</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-amber-900">
        {recovery.hasClinicalChanges || recovery.reviewed.length > 0
          ? "This consultation was started when Patient History was a consultation step. The changes below are not saved to Patient Background yet. Keep them to save them when this consultation is finalized, or discard them."
          : "This consultation was started when Patient History was a consultation step. It holds the text below, which a consultation no longer saves. Keep it visible while you copy what is needed, or discard it."}
      </p>
      {errorList}

      <div className="mt-3 space-y-3">
        {recovery.sections.map((entry) => (
          <div key={entry.section} className="border border-amber-200 bg-white">
            <p className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[12.5px] font-semibold text-gray-900">
              {entry.label}
            </p>
            {entry.rows.length ? <ChangeRows rows={entry.rows} /> : (
              <p className="px-3 py-2 text-xs text-gray-600">No completed clinical field differs from the saved history. Check any unfinished entries before keeping this section.</p>
            )}
            {onCorrect && !disabled && update?.sections?.[entry.section] &&
              (entry.section !== "obstetric" || sectionVisibility(patient, today).obstetric !== "hidden") && (
              <details className="border-t border-gray-200 p-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-gray-900 focus-visible:outline-2">
                  Correct staged {entry.label}
                </summary>
                <div className="mt-3">
                  <PatientBackgroundEditor
                    section={entry.section}
                    value={update.sections[entry.section]}
                    onChange={(value) => onCorrect(entry.section, value)}
                    patient={patient}
                    conditions={conditions}
                    today={today}
                  />
                </div>
              </details>
            )}
          </div>
        ))}

        {recovery.reviewed.length > 0 && (
          <p className="text-[12.5px] text-amber-900">
            <span className="font-semibold">Marked &ldquo;No changes&rdquo;:</span> {recovery.reviewed.join(" · ")}
          </p>
        )}

        {recovery.removedText.length > 0 && (
          <div className="border border-amber-200 bg-white px-3 py-2">
            <p className="text-[12.5px] font-semibold text-gray-900">Not saved to Patient Background</p>
            <p className="text-[11.5px] text-gray-500">
              Education is now recorded in Patient Information, and Past Occupations are no longer recorded here.
              Copy anything still needed into Patient Information.
            </p>
            <dl className="mt-1.5 space-y-1">
              {recovery.removedText.map((row) => (
                <div key={row.key} className="grid gap-0.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-xs font-medium text-gray-500">{row.label}</dt>
                  <dd className="m-0 min-w-0 select-text break-words text-[13px] text-gray-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={onDiscard}
          className={`${BUTTON_CLASS} border-gray-300 bg-white text-red-700 hover:border-red-200 hover:bg-red-50`}
        >
          Discard changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!canKeep}
          onClick={onKeep}
          className={`${BUTTON_CLASS} border-gray-900 bg-gray-900 text-white hover:bg-gray-700`}
        >
          Keep for this consultation
        </Button>
      </div>
    </section>
  );
}
