import { InformantBlock } from "../../patients/history/GeneralDataSection";

/**
 * Who gave the history at this visit. Similar Illness lives under Family
 * History with Family Conditions. Controlled; the workspace keeps the state,
 * the draft autosave and the record payload exactly as before.
 *
 * `errors` are visitAnswerErrorMessages(...) lines for informant keys.
 */
export default function InterviewVisitQuestions({
  informant,
  onInformantChange,
  errors = [],
}) {
  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <div role="alert" className="border border-red-200 bg-red-50 px-3 py-2">
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-red-700">
            {errors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <InformantBlock informant={informant} onInformantChange={onInformantChange} />
    </div>
  );
}
