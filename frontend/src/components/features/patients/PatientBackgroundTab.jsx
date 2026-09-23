import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { formatLongDate } from "../../../utils/formatters";
import { EMPTY_MEDICAL_BACKGROUND } from "../../../services/patientService";

const DISEASE_STATUS_OPTIONS = ["Active", "Controlled", "Resolved"];

/**
 * The three background sections, as separate tabs in the design. Each one is
 * a slice of the single medical_background payload the patient row owns, so
 * editing one section always saves the whole object back - never a partial
 * that would drop the sections the user was not looking at.
 */
export const BACKGROUND_SECTIONS = {
  medical: {
    key: "medical",
    label: "Past Medical History",
    title: "Current Past Medical History",
    subtitle: "Longitudinal medical background for this patient.",
  },
  family: {
    key: "family",
    label: "Family History",
    title: "Current Family History",
    subtitle: "Illnesses recorded among immediate family members.",
  },
  social: {
    key: "social",
    label: "Personal & Social History",
    title: "Current Personal & Social History",
    subtitle: "Diet, lifestyle, and social history.",
  },
};

const TEXT_FIELDS = {
  medical: [
    { key: "allergies", label: "Allergies", placeholder: "e.g. Penicillin" },
    {
      key: "hospitalizations",
      label: "Hospitalizations",
      placeholder: "e.g. Appendectomy (2019)",
    },
    { key: "surgeries", label: "Surgeries", placeholder: "e.g. None reported" },
  ],
  family: [
    { key: "similarIllness", label: "Similar Illness", group: "familyHistory" },
    { key: "chronicIllness", label: "Chronic Illness", group: "familyHistory" },
    {
      key: "hereditaryIllness",
      label: "Hereditary Illness",
      group: "familyHistory",
    },
  ],
  social: [
    { key: "diet", label: "Diet", group: "personalSocial" },
    { key: "smoking", label: "Smoking", group: "personalSocial" },
    { key: "alcohol", label: "Alcohol", group: "personalSocial" },
    { key: "notes", label: "Other Notes", group: "personalSocial" },
  ],
};

function cloneBackground(background) {
  return {
    ...EMPTY_MEDICAL_BACKGROUND,
    ...(background || {}),
    currentDiseases: [...(background?.currentDiseases || [])],
    familyHistory: {
      ...EMPTY_MEDICAL_BACKGROUND.familyHistory,
      ...(background?.familyHistory || {}),
    },
    personalSocial: {
      ...EMPTY_MEDICAL_BACKGROUND.personalSocial,
      ...(background?.personalSocial || {}),
    },
  };
}

function readValue(background, field) {
  return field.group
    ? background?.[field.group]?.[field.key] || ""
    : background?.[field.key] || "";
}

function Row({ label, children, compact }) {
  return (
    <div className={`flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 ${compact ? "" : "sm:flex-row sm:items-center sm:gap-4"}`}>
      <span className={`w-full shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal in-[.bhc-patient-profile]:r in-[.bhc-patient-profile]:text-slate-500 ${compact ? "" : "sm:w-48"}`}>
        {label}
      </span>
      <div className={`min-w-0 flex-1 ${compact ? "" : "sm:text-right"}`}>{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] text-slate-700 outline-none transition focus:border-[#B91C1C]"
    />
  );
}

/**
 * The dated log below the editable card.
 *
 * Backed by medical_background.updatedAt[section], which stores ONE date per
 * section - when it was last edited. That is the only history the schema
 * keeps, so this renders the single stamp it has rather than implying a
 * per-change revision trail the backend does not record.
 */
function BackgroundUpdateLog({ config, lastUpdated }) {
  return (
    <section className="mt-5">
      <h3 className="text-[13px] font-bold text-[#0F172A] in-[.bhc-patient-profile]:font-semibold in-[.bhc-patient-profile]:text-slate-900 in-[.bhc-patient-profile]:font-sans!">
        {config.label} Records
      </h3>
      <p className="mt-0.5 text-[11px] text-slate-500 in-[.bhc-patient-profile]:text-sm">
        A dated log of changes to this patient&apos;s medical background over
        time.
      </p>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white in-[.bhc-patient-profile]:rounded-2xl in-[.bhc-patient-profile]:border-slate-100 in-[.bhc-patient-profile]:shadow-sm">
        {lastUpdated ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-[12.5px] font-semibold text-[#0F172A] in-[.bhc-patient-profile]:text-slate-900">
              {config.label} updated
            </span>
            <span className="text-[11px] font-semibold text-slate-500 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal">
              {formatLongDate(lastUpdated, "")}
            </span>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[12px] text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:text-slate-500">
            No recorded updates yet.
          </p>
        )}
      </div>
    </section>
  );
}

export default function PatientBackgroundTab({
  section,
  background,
  saving = false,
  onSave,
  compact = false,
  startEditing = false,
  onEditingDone,
  sharedDraft,
  onDraftChange,
}) {
  const config = BACKGROUND_SECTIONS[section];
  const [isEditing, setIsEditing] = useState(startEditing);
  const [newDisease, setNewDisease] = useState("");

  // The drawer mounts one instance per section at the same time, so the draft
  // has to live above them - otherwise saving "family" would post whatever
  // stale "medical" slice that instance was holding. When no owner is passed
  // (the full Patient Profile), the draft stays local.
  const controlled = typeof onDraftChange === "function";
  const [localDraft, setLocalDraft] = useState(() => cloneBackground(background));
  const draft = controlled ? cloneBackground(sharedDraft || background) : localDraft;

  function setDraft(updater) {
    const next = typeof updater === "function" ? updater(draft) : updater;
    if (controlled) onDraftChange(next);
    else setLocalDraft(next);
  }

  useEffect(() => {
    if (!isEditing && !controlled) setLocalDraft(cloneBackground(background));
  }, [background, isEditing, controlled]);

  useEffect(() => {
    setIsEditing(startEditing);
    setNewDisease("");
  }, [section, startEditing]);

  function setField(field, value) {
    setDraft((current) => {
      if (!field.group) return { ...current, [field.key]: value };
      return {
        ...current,
        [field.group]: { ...current[field.group], [field.key]: value },
      };
    });
  }

  function addDisease() {
    const name = newDisease.trim();
    if (!name) return;
    const today = new Date().toISOString().slice(0, 10);

    setDraft((current) => {
      if (
        current.currentDiseases.some(
          (disease) => disease.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        return current;
      }
      return {
        ...current,
        currentDiseases: [
          ...current.currentDiseases,
          {
            name,
            status: "Active",
            firstRecorded: today,
            lastConfirmed: today,
            source: "Patient Profile",
          },
        ],
      };
    });
    setNewDisease("");
  }

  function updateDisease(index, key, value) {
    setDraft((current) => ({
      ...current,
      currentDiseases: current.currentDiseases.map((disease, position) =>
        position === index ? { ...disease, [key]: value } : disease,
      ),
    }));
  }

  function removeDisease(index) {
    setDraft((current) => ({
      ...current,
      currentDiseases: current.currentDiseases.filter(
        (_, position) => position !== index,
      ),
    }));
  }

  function cancel() {
    setDraft(cloneBackground(background));
    setNewDisease("");
    setIsEditing(false);
    onEditingDone?.();
  }

  async function save() {
    // Stamp only the section being edited; the other two keep whatever date
    // they already carried, since this save did not touch them.
    const stamped = {
      ...draft,
      updatedAt: {
        ...(draft.updatedAt || {}),
        [section]: new Date().toISOString().slice(0, 10),
      },
    };

    const saved = await onSave?.(stamped);
    if (saved !== false) {
      setNewDisease("");
      setIsEditing(false);
      onEditingDone?.();
    }
  }

  const fields = TEXT_FIELDS[section] || [];
  const diseases = draft.currentDiseases;
  const lastUpdated = background?.updatedAt?.[section] || "";

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-200 in-[.bhc-patient-profile]:rounded-2xl in-[.bhc-patient-profile]:border-slate-100 in-[.bhc-patient-profile]:bg-white in-[.bhc-patient-profile]:shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h3 className="text-[13px] font-bold text-[#0F172A] in-[.bhc-patient-profile]:font-semibold in-[.bhc-patient-profile]:text-slate-900 in-[.bhc-patient-profile]:font-sans!">
              {config.title}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 in-[.bhc-patient-profile]:text-sm">
              {config.subtitle}
            </p>
            <p className="mt-1 text-[10.5px] font-semibold text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal in-[.bhc-patient-profile]:text-slate-500">
              {lastUpdated
                ? `Last updated ${formatLongDate(lastUpdated, "")}`
                : "Not yet recorded"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                >
                  {saving ? "Saving..." : compact ? "Done" : "Save Changes"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
              >
                Edit
              </button>
            )}
          </div>
        </header>

        <div className="bg-white">
          {section === "medical" && (
            <Row label="Current Diseases" compact={compact}>
              {!isEditing ? (
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {diseases.length ? (
                    diseases.map((disease, index) => (
                      <span
                        key={`${disease.name}-${index}`}
                        className="rounded-full bg-red-50 px-2.5 py-1 text-[11.5px] font-semibold text-[#B91C1C] in-[.bhc-patient-profile]:px-3"
                      >
                        {disease.name}
                        {disease.status ? ` · ${disease.status}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-[12.5px] text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:text-slate-500">
                      Not yet recorded
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2 sm:text-left">
                  {diseases.map((disease, index) => (
                    <div
                      key={`${disease.name}-${index}`}
                      className="rounded-lg border border-slate-200 p-3 text-left in-[.bhc-patient-profile]:rounded-2xl in-[.bhc-patient-profile]:border-slate-100 in-[.bhc-patient-profile]:bg-white in-[.bhc-patient-profile]:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12.5px] font-bold text-[#0F172A] in-[.bhc-patient-profile]:font-semibold in-[.bhc-patient-profile]:text-slate-900">
                          {disease.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDisease(index)}
                          aria-label={`Remove ${disease.name}`}
                          className="text-slate-400 transition hover:text-[#B91C1C] in-[.bhc-patient-profile]:text-slate-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className={`mt-2 grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal in-[.bhc-patient-profile]:r in-[.bhc-patient-profile]:text-slate-500">
                          Status
                          <select
                            value={disease.status || ""}
                            onChange={(event) =>
                              updateDisease(index, "status", event.target.value)
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-[#B91C1C]"
                          >
                            <option value="">Select...</option>
                            {DISEASE_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal in-[.bhc-patient-profile]:r in-[.bhc-patient-profile]:text-slate-500">
                          First Recorded
                          <input
                            type="date"
                            value={disease.firstRecorded || ""}
                            onChange={(event) =>
                              updateDisease(
                                index,
                                "firstRecorded",
                                event.target.value,
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-[#B91C1C]"
                          />
                        </label>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 in-[.bhc-patient-profile]:text-sm in-[.bhc-patient-profile]:font-normal in-[.bhc-patient-profile]:r in-[.bhc-patient-profile]:text-slate-500">
                          Last Confirmed
                          <input
                            type="date"
                            value={disease.lastConfirmed || ""}
                            onChange={(event) =>
                              updateDisease(
                                index,
                                "lastConfirmed",
                                event.target.value,
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-[#B91C1C]"
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDisease}
                      placeholder="Add other disease..."
                      onChange={(event) => setNewDisease(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addDisease();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] outline-none transition focus:border-[#B91C1C]"
                    />
                    <button
                      type="button"
                      onClick={addDisease}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
                    >
                      <Plus size={13} />
                      Add
                    </button>
                  </div>
                </div>
              )}
            </Row>
          )}

          {fields.map((field) => (
            <Row key={field.key} label={field.label} compact={compact}>
              {isEditing ? (
                <TextInput
                  value={readValue(draft, field)}
                  placeholder={field.placeholder || "Not yet recorded"}
                  onChange={(value) => setField(field, value)}
                />
              ) : (
                <span
                  className={`text-[12.5px] ${readValue(background, field) ? "text-[#0F172A] in-[.bhc-patient-profile]:text-slate-900" : "text-slate-400 in-[.bhc-patient-profile]:text-slate-500"}`}
                >
                  {readValue(background, field) || "Not yet recorded"}
                </span>
              )}
            </Row>
          ))}
        </div>
      </div>

      {!compact && (
        <BackgroundUpdateLog config={config} lastUpdated={lastUpdated} />
      )}
    </div>
  );
}
