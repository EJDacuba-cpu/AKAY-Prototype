import { Lock } from "lucide-react";

import BackgroundEditor from "../../patients/background/BackgroundEditor";
import MedicalConditionsGroups from "../../patients/MedicalConditionsGroups";
import useClinicalRegistry from "../../../../hooks/useClinicalRegistry";
import { usePatientConditions } from "../../../../hooks/usePatientConditionGroups";
import { backgroundConditionGroups } from "../../../../utils/backgroundConditions";
import {
  buildBackgroundUpdate,
  editedSectionKeys,
  overlayBackgroundUpdate,
  sliceBackground,
} from "../../../../utils/backgroundUpdate";

/**
 * Patient Background on Patient Interview, after Chief Complaint / HPI -
 * per docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
 *
 * Collapsed it is a read-only summary; Review / Update opens the shared
 * editor. Edits are only staged (`update`, carried in the draft) and saved
 * with the finalized record. Users without clinical.history get the locked
 * state: the section keeps its place in the layout, its content does not.
 */
export default function ConsultationBackgroundCard({
  patientId,
  locked = false,
  loading = false,
  background,
  update,
  onUpdateChange,
  expanded = false,
  onExpandedChange,
  followed = [],
}) {
  const { registry } = useClinicalRegistry();
  const conditionsQuery = usePatientConditions(patientId, { enabled: !locked });
  if (locked) {
    return (
      <div className="flex items-start gap-3 py-1" role="note">
        <Lock size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-semibold text-gray-900">Clinical history restricted</p>
          <p className="mt-0.5 text-xs text-gray-600">You are not allowed to view or update this section.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="py-1 text-xs text-gray-500">Loading patient background...</p>;
  }

  const current = overlayBackgroundUpdate(background, update);
  const editedSections = editedSectionKeys(update);

  function handleChange(nextBackground) {
    onUpdateChange(buildBackgroundUpdate(background, nextBackground, update));
  }

  function revertSection(section) {
    handleChange({ ...current, ...sliceBackground(background, section) });
  }

  // Read-only summary: the patient's medical conditions by clinical source
  // (the conditions followed in this visit flagged), allergies,
  // hospitalizations and surgeries. Assessment handles new diagnoses; Care
  // Plan decides what happens to a followed condition.
  const groups = backgroundConditionGroups({
    diseases: current?.currentDiseases,
    conditions: conditionsQuery.data?.conditions,
    legacyMonitorings: conditionsQuery.data?.legacyMonitorings,
    followed,
    registry,
  });
  const text = (value) => String(value || "").trim();
  const lines = [
    { key: "allergies", label: "Allergies", text: text(current?.allergies) },
    { key: "hospitalizations", label: "Hospitalizations", text: text(current?.hospitalizations) },
    { key: "surgeries", label: "Surgeries", text: text(current?.surgeries) },
  ];
  const noConditions = Object.values(groups).every((group) => group.length === 0);
  const isEmpty = noConditions && lines.every((line) => !line.text);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editedSections.length > 0 && (
            <p className="mb-2 inline-flex rounded-sm bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              Edited · saves when the consultation is finalized
            </p>
          )}
          {!expanded &&
            (isEmpty ? (
              <p className="text-sm text-gray-500">No background recorded yet.</p>
            ) : (
              <div className="space-y-2 text-[12.5px]">
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3">
                  <p className="text-gray-500">Medical Conditions</p>
                  <MedicalConditionsGroups
                    groups={groups}
                    isLoading={conditionsQuery.isLoading}
                    isError={conditionsQuery.isError}
                  />
                </div>
                <dl className="space-y-1">
                  {lines.map((line) => (
                    <div key={line.key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3">
                      <dt className="text-gray-500">{line.label}</dt>
                      <dd className={"m-0 min-w-0 break-words " + (line.text ? "text-gray-900" : "text-gray-400")}>
                        {line.text || "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
        </div>
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          className="shrink-0 rounded-none border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
        >
          {expanded ? "Done" : "Review / Update"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3">
          <BackgroundEditor
            value={current}
            onChange={handleChange}
            conditionGroups={groups}
            editedSections={editedSections}
            onRevertSection={revertSection}
          />
        </div>
      )}
    </div>
  );
}
