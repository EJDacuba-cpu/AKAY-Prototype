import { useState } from "react";
import { Plus } from "lucide-react";

import useClinicalRegistry from "../../../../hooks/useClinicalRegistry";
import { groupCurrentDiseases } from "../../../../utils/currentConditions";
import { isFollowedThisVisit } from "../../../../utils/followUpThisVisit";
import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
} from "../../../../utils/backgroundUpdate";
import { BackgroundTextField, DiseaseGroupEdit } from "./BackgroundFields";

const PLACEHOLDERS = {
  allergies: "e.g. Penicillin",
  hospitalizations: "e.g. Appendectomy (2019)",
  surgeries: "e.g. None reported",
};

function readValue(background, field) {
  return (field.group ? background?.[field.group]?.[field.key] : background?.[field.key]) || "";
}

/**
 * The one Patient Background editor, mounted only in the Consultation
 * Workspace. Controlled: `value` is the whole background as the clinician has
 * it now and every change calls `onChange` with the next one. It holds no
 * save logic - the consultation stages the result (utils/backgroundUpdate.js)
 * and the server applies it when the record is finalized.
 */
export default function BackgroundEditor({ value, onChange, editedSections = [], onRevertSection, followed = [] }) {
  const [newDisease, setNewDisease] = useState("");
  const { registry } = useClinicalRegistry();
  const diseases = Array.isArray(value?.currentDiseases) ? value.currentDiseases : [];
  const grouped = groupCurrentDiseases(diseases, registry);
  // Conditions followed in this visit are reference only here: Care Plan &
  // Next Steps records what happens to them, so they are not editable twice.
  const followedDiseases = [...grouped.monitored, ...grouped.other].filter((disease) => isFollowedThisVisit(disease, followed, registry));
  const monitored = grouped.monitored.filter((disease) => !followedDiseases.includes(disease));
  const other = grouped.other.filter((disease) => !followedDiseases.includes(disease));

  function setField(field, next) {
    onChange(
      field.group
        ? { ...value, [field.group]: { ...(value?.[field.group] || {}), [field.key]: next } }
        : { ...value, [field.key]: next },
    );
  }

  function setDiseases(next) {
    onChange({ ...value, currentDiseases: next });
  }

  function addDisease() {
    const name = newDisease.trim();
    if (!name) return;
    setNewDisease("");
    if (diseases.some((disease) => disease.name.toLowerCase() === name.toLowerCase())) return;
    const today = new Date().toISOString().slice(0, 10);
    setDiseases([
      ...diseases,
      { name, status: "Active", firstRecorded: today, lastConfirmed: today, source: "Consultation", conditionKey: null },
    ]);
  }

  function updateDisease(index, key, next) {
    setDiseases(diseases.map((disease, position) => (position === index ? { ...disease, [key]: next } : disease)));
  }

  function removeDisease(index) {
    setDiseases(diseases.filter((_, position) => position !== index));
  }

  return (
    <div className="space-y-4">
      {BACKGROUND_SECTION_KEYS.map((section) => {
        const edited = editedSections.includes(section);
        return (
          <fieldset key={section} className="rounded-none border border-gray-200 p-4">
            <legend className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-900">
              {BACKGROUND_SECTION_LABELS[section]}
              {edited && (
                <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
                  Edited
                </span>
              )}
            </legend>
            {edited && onRevertSection && (
              <div className="-mt-1 mb-2 text-right">
                <button
                  type="button"
                  onClick={() => onRevertSection(section)}
                  className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
                >
                  Revert section
                </button>
              </div>
            )}

            <div className="@container space-y-3">
              {section === "medical" && (
                <div className="space-y-3">
                  {followedDiseases.length > 0 && (
                    <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">Followed this visit (reference only): </span>
                      {followedDiseases.map((disease) => (disease.status ? `${disease.name} · ${disease.status}` : disease.name)).join("; ")}.
                      {" "}Record what happens to it in Care Plan &amp; Next Steps.
                    </p>
                  )}
                  <DiseaseGroupEdit
                    title="Monitored Conditions"
                    diseases={monitored}
                    emptyText="None recorded - added automatically from a matching diagnosis."
                    onUpdate={updateDisease}
                    onRemove={removeDisease}
                  />
                  <DiseaseGroupEdit
                    title="Other Conditions"
                    diseases={other}
                    emptyText="None recorded."
                    onUpdate={updateDisease}
                    onRemove={removeDisease}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDisease}
                      aria-label="Add other condition"
                      placeholder="Add other condition..."
                      onChange={(event) => setNewDisease(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addDisease();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-none border border-gray-200 px-3 py-2 text-[12.5px] outline-none transition focus:border-red-600"
                    />
                    <button
                      type="button"
                      onClick={addDisease}
                      className="inline-flex items-center gap-1 rounded-none border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                    >
                      <Plus size={13} />
                      Add
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    A name matching a monitored condition (e.g. &ldquo;HTN&rdquo;, &ldquo;PTB&rdquo;) is
                    recognized and filed under Monitored Conditions once saved.
                  </p>
                </div>
              )}

              <div className="grid gap-3 @xl:grid-cols-2">
                {BACKGROUND_SECTION_FIELDS[section]
                  .filter((field) => field.key !== "currentDiseases")
                  .map((field) => (
                    <BackgroundTextField
                      key={field.key}
                      label={field.label}
                      value={readValue(value, field)}
                      placeholder={PLACEHOLDERS[field.key]}
                      onChange={(next) => setField(field, next)}
                    />
                  ))}
              </div>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
