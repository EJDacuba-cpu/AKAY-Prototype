import { SimilarIllnessBlock } from "../../patients/history/FamilySection";
import { InformantBlock } from "../../patients/history/GeneralDataSection";

/**
 * The visit's history questions on the BHC Patient Interview (they moved here
 * from the removed Patient History step): who gave the history and whether
 * anyone at home has a similar illness. Both are per visit; neither changes
 * the patient's background. Controlled; the workspace keeps the state, the
 * draft autosave and the record payload exactly as before.
 *
 * `errors` are visitAnswerErrorMessages(...) lines from the last save, shown
 * right under the questions.
 */
export default function InterviewVisitQuestions({
  informant,
  onInformantChange,
  similarIllness,
  onSimilarIllnessChange,
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
      <SimilarIllnessBlock value={similarIllness} onChange={onSimilarIllnessChange} />
    </div>
  );
}
