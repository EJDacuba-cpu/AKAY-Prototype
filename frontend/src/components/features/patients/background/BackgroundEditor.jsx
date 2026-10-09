import { useState } from "react";
import { Plus } from "lucide-react";

import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
  newPatientReportedCondition,
} from "../../../../utils/backgroundUpdate";
import { UNVERIFIED_LABEL } from "../MedicalConditionsGroups";
import { BackgroundTextField, PatientReportedEdit, UnverifiedReadOnly } from "./BackgroundFields";

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
 *
 * The only conditions editable here are the patient's own Previous Conditions
 * (name + optional note, no status). Confirmed, under-evaluation and past
 * conditions are RHU's; legacy consultation entries show read-only as
 * unverified. `conditionGroups` is groupMedicalConditions over `value`.
 */
export default function BackgroundEditor({ value, onChange, conditionGroups, editedSections = [], onRevertSection }) {
  const [newDisease, setNewDisease] = useState("");
  const [newNote, setNewNote] = useState("");
  const diseases = Array.isArray(value?.currentDiseases) ? value.currentDiseases : [];
  const patientReported = conditionGroups?.patientReported || [];
  const unverified = conditionGroups?.unverified || [];

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
    const entry = newPatientReportedCondition(newDisease, newNote);
    if (!entry) return;
    setNewDisease("");
    setNewNote("");
    if (patientReported.some((disease) => disease.name.toLowerCase() === entry.name.toLowerCase())) return;
    setDiseases([...diseases, entry]);
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
                  <UnverifiedReadOnly title={UNVERIFIED_LABEL} diseases={unverified} />
                  <PatientReportedEdit diseases={patientReported} onUpdate={updateDisease} onRemove={removeDisease} />
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newDisease}
                      aria-label="Patient-reported previous condition"
                      placeholder="Add a previous condition..."
                      onChange={(event) => setNewDisease(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addDisease();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-none border border-gray-200 px-3 py-2 text-[12.5px] outline-none transition focus:border-red-600"
                    />
                    <input
                      type="text"
                      value={newNote}
                      aria-label="Note (optional)"
                      placeholder="Note (optional)"
                      onChange={(event) => setNewNote(event.target.value)}
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
                    Conditions the patient reports. They stay unconfirmed until RHU confirms a diagnosis.
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
