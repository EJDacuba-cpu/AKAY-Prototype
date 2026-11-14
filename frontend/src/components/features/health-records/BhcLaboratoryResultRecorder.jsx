import { Button } from "../../ui/button";
import { FieldInput } from "./fields/ClinicalFields";
import BhcLaboratoryFields from "./BhcLaboratoryFields";
import {
  MAX_BHC_LAB_RESULTS,
  bhcLaboratorySummary,
  newBhcLaboratoryResult,
} from "../../../utils/bhcLaboratoryResults";

export default function BhcLaboratoryResultRecorder({
  tests = [],
  onChange,
  errors = {},
  readOnly = false,
  legacyEntries = [],
  legacySources = {},
  onLegacySourceChange,
  onTransferLegacy,
  onRemoveLegacy,
  suggestedDate = "",
}) {
  function addResult() {
    if (tests.length >= MAX_BHC_LAB_RESULTS) return;
    onChange([...tests, newBhcLaboratoryResult(suggestedDate)]);
  }

  return (
    <div className="mt-6 border-t border-[#E5E7EB] pt-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#111827]">Laboratory &amp; Diagnostic Results</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#6B7280]">
            Optional. Add a result only when it is already available. Type where it came from. The same test may be entered more than once.
          </p>
        </div>
        {!readOnly && (
          <Button type="button" variant="secondary" size="sm" onClick={addResult} disabled={tests.length >= MAX_BHC_LAB_RESULTS}>
            Add Result
          </Button>
        )}
      </div>
      {errors.laboratoryTests ? <p role="alert" className="mb-3 text-xs font-medium text-[#B91C1C]">{errors.laboratoryTests}</p> : null}
      {errors.legacyLaboratoryEntries ? <p role="alert" className="mb-3 text-xs font-medium text-[#B91C1C]">{errors.legacyLaboratoryEntries}</p> : null}

      {legacyEntries.length > 0 && (
        <div className="mb-4 border border-[#E5E7EB] bg-white p-3">
          <p className="text-xs font-semibold text-[#111827]">Unsaved laboratory results from this draft</p>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            These results were entered on the prenatal form. Move each one into Laboratory &amp; Diagnostic Results and type the result source, or remove it. They are not discarded on their own.
          </p>
          <ul className="mt-3 space-y-3">
            {legacyEntries.map((entry) => (
              <li key={`legacy-${entry.index}`} className="border border-[#E5E7EB] p-3">
                <p className="text-sm font-semibold text-[#111827]">{entry.testName || "Unnamed test"}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-[#374151]">{[entry.result, entry.datePerformed].filter(Boolean).join(" · ") || "No result recorded"}</p>
                <div className="mt-3 grid gap-3 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-end">
                  <FieldInput
                    label="Result Source"
                    required
                    maxLength={150}
                    value={legacySources[entry.index] || ""}
                    disabled={readOnly}
                    onChange={(event) => onLegacySourceChange?.(entry.index, event.target.value)}
                    placeholder="Where this result came from"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled={readOnly} onClick={() => onTransferLegacy?.(entry)}>
                      Move to results
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => onRemoveLegacy?.(entry.index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tests.length === 0 ? (
        <p className="text-xs text-[#6B7280]">No laboratory or diagnostic result added for this visit.</p>
      ) : (
        <div className="space-y-4">
          {tests.map((entry, index) => (
            <div key={entry.id || index} className="border border-[#E5E7EB] bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">Result {index + 1}</p>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(tests.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                )}
              </div>
              <BhcLaboratoryFields
                entry={entry}
                prefix={`laboratoryTests.${index}`}
                errors={errors}
                disabled={readOnly}
                onChange={(next) => onChange(tests.map((item, itemIndex) => (itemIndex === index ? next : item)))}
              />
              <p className="sr-only">{bhcLaboratorySummary(entry)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
