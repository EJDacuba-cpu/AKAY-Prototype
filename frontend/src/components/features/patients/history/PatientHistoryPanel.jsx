import { useState } from "react";
import { Check } from "lucide-react";

import RestrictedArea from "../../../common/access/RestrictedArea";
import LockedPlaceholder from "../../../common/access/LockedPlaceholder";
import useClinicalRegistry from "../../../../hooks/useClinicalRegistry";
import { usePatientConditions } from "../../../../hooks/usePatientConditionGroups";
import { backgroundConditionGroups } from "../../../../utils/backgroundConditions";
import {
  BACKGROUND_SECTION_FIELDS,
  buildBackgroundUpdate,
  editedSectionKeys,
  markReviewed,
  overlayBackgroundUpdate,
  reviewedSectionKeys,
  sliceBackground,
  unmarkReviewed,
} from "../../../../utils/backgroundUpdate";
import { linkedRelatives } from "../../../../utils/historyStep";
import {
  EDITABLE_SECTION_KEYS,
  hasRecordedData,
  sectionStatus,
  sectionVisibility,
} from "../../../../utils/patientHistory";
import FamilySection, { SimilarIllnessBlock } from "./FamilySection";
import GeneralDataSection from "./GeneralDataSection";
import { SMALL_BUTTON_CLASS } from "./HistoryFields";
import ObstetricSection from "./ObstetricSection";
import PastMedicalSection, { RhuConditions } from "./PastMedicalSection";
import PersonalSocialSection from "./PersonalSocialSection";
import SectionNav, { statusText } from "./SectionNav";

export const HISTORY_SECTION_TITLES = {
  general: "I. General Data",
  medical: "II. Past Medical History",
  family: "III. Family History",
  social: "IV. Personal & Social History",
  obstetric: "V. Obstetric & Menstrual History",
};

const PRESSED_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-none border border-gray-900 bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-gray-700";

/** Read-only lines of a section, as the Review step and the profile word them. */
function SectionSummary({ section, value }) {
  return (
    <dl className="divide-y divide-gray-100 border border-gray-200">
      {BACKGROUND_SECTION_FIELDS[section].map((field) => {
        const text = String(field.read(value) || "").trim();
        return (
          <div key={field.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
            <dd className={`m-0 min-w-0 break-words text-[13px] ${text ? "text-gray-900" : "text-gray-400"}`}>
              {text || "Not recorded"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** One editable section (II-V): its status, No changes / Update, and the summary or the form. */
function SectionFrame({ title, status, updated, reviewed, canReview, editing, onReview, onToggleEdit, onUndo, children }) {
  return (
    <section aria-label={title} className="border border-gray-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold leading-snug text-gray-900">{title}</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {statusText(status)}
            {updated && " · saves when the consultation is finalized"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {updated ? (
            <button type="button" onClick={onUndo} className={SMALL_BUTTON_CLASS}>
              Undo changes
            </button>
          ) : (
            <button
              type="button"
              aria-pressed={reviewed}
              disabled={!reviewed && !canReview}
              title={!reviewed && !canReview ? "Nothing is recorded yet. Use Update." : undefined}
              onClick={onReview}
              className={reviewed ? PRESSED_BUTTON_CLASS : SMALL_BUTTON_CLASS}
            >
              {reviewed && <Check size={12} aria-hidden="true" />}
              No changes
            </button>
          )}
          <button type="button" aria-expanded={editing} onClick={onToggleEdit} className={SMALL_BUTTON_CLASS}>
            {editing ? "Done" : "Update"}
          </button>
        </div>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * Patient History (ITR page 1, sections I-V): the one shared component for the
 * BHC consultation step (layout "screen": section list on the left, one
 * section on the right) and the RHU record form (layout "section": every
 * section stacked). Controlled; it holds no save logic. Edits are staged in
 * `update` through buildBackgroundUpdate, "No changes" marks a section
 * reviewed, and nothing here is ever required to continue.
 *
 * `errors` is historyErrorMessages(..., { withSection: true }) of the last
 * save: listed above the sections, and the first one's section is opened.
 */
export default function PatientHistoryPanel({
  patient,
  background,
  update,
  onUpdateChange,
  informant,
  onInformantChange,
  similarIllness,
  onSimilarIllnessChange,
  householdEnvironment,
  today = new Date(),
  layout = "screen",
  locked = false,
  loading = false,
  relatives,
  editLink,
  errors = [],
}) {
  const { registry } = useClinicalRegistry();
  const conditionsQuery = usePatientConditions(patient?.id, { enabled: !locked });
  const [active, setActive] = useState("general");
  const [editing, setEditing] = useState({});
  // The values as typed, kept while `update` is still the one they produced:
  // the staged update is trimmed and drops blank rows, which must not happen
  // under the cursor.
  const [typed, setTyped] = useState(null);
  // Open the section of the first error once per error list.
  const errorKey = errors.map((error) => error.text).join("|");
  const [seenErrorKey, setSeenErrorKey] = useState("");
  if (errorKey !== seenErrorKey) {
    setSeenErrorKey(errorKey);
    const first = errors.find((error) => error.section)?.section;
    if (first) {
      setActive(first);
      if (first !== "general") setEditing((current) => ({ ...current, [first]: true }));
    }
  }

  if (locked) {
    return (
      <RestrictedArea
        locked
        label="Patient history"
        className="rounded-none"
        placeholder={<LockedPlaceholder lines={5} className="min-h-48" />}
      />
    );
  }
  if (loading) {
    return <p role="status" className="py-1 text-xs text-gray-500">Loading patient history...</p>;
  }

  const current = typed && typed.update === update ? typed.value : overlayBackgroundUpdate(background, update);
  const updatedKeys = editedSectionKeys(update);
  const reviewedKeys = reviewedSectionKeys(update);
  const visibility = sectionVisibility(patient, today);
  const editableKeys = EDITABLE_SECTION_KEYS.filter(
    (section) => section !== "obstetric" || visibility.obstetric !== "hidden",
  );
  const conditionGroups = backgroundConditionGroups({
    diseases: current?.currentDiseases,
    conditions: conditionsQuery.data?.conditions,
    legacyMonitorings: conditionsQuery.data?.legacyMonitorings,
    registry,
  });
  const familyRelatives = Array.isArray(relatives) ? relatives : linkedRelatives(patient);
  const reviewable = editableKeys.filter(
    (section) =>
      hasRecordedData(background, section) && !updatedKeys.includes(section) && !reviewedKeys.includes(section),
  );

  function change(next) {
    const nextUpdate = buildBackgroundUpdate(background, next, update);
    setTyped({ update: nextUpdate, value: next });
    onUpdateChange(nextUpdate);
  }

  function changeSlice(slice) {
    change({ ...current, ...slice });
  }

  function undo(section) {
    setEditing((state) => ({ ...state, [section]: false }));
    change({ ...current, ...sliceBackground(background, section) });
  }

  function toggleReviewed(section) {
    onUpdateChange(reviewedKeys.includes(section) ? unmarkReviewed(update, section) : markReviewed(update, [section]));
  }

  const navSections = [
    { key: "general", label: HISTORY_SECTION_TITLES.general, status: { kind: "auto" } },
    ...EDITABLE_SECTION_KEYS.map((section) => ({
      key: section,
      label: HISTORY_SECTION_TITLES[section],
      status: sectionStatus({ background, update, section, today }),
      visible: editableKeys.includes(section),
    })),
  ];

  function sectionForm(section) {
    const props = { value: sliceOf(current, section), onChange: changeSlice };
    if (section === "medical") return <PastMedicalSection {...props} conditionGroups={conditionGroups} />;
    if (section === "family") {
      return (
        <FamilySection
          {...props}
          similarIllness={similarIllness}
          onSimilarIllnessChange={onSimilarIllnessChange}
          relatives={familyRelatives}
        />
      );
    }
    if (section === "social") {
      return (
        <PersonalSocialSection {...props} patient={patient} householdEnvironment={householdEnvironment} today={today} />
      );
    }
    return <ObstetricSection {...props} patient={patient} today={today} />;
  }

  function sectionSummary(section) {
    const recorded = hasRecordedData(current, section);
    return (
      <div className="space-y-4">
        {section === "medical" && <RhuConditions groups={conditionGroups} />}
        {recorded ? (
          <SectionSummary section={section} value={current} />
        ) : (
          <p className="text-[13px] text-gray-500">
            Nothing recorded yet. Use Update to record it; &ldquo;None known&rdquo; is an answer too.
          </p>
        )}
        {section === "family" && <SimilarIllnessBlock value={similarIllness} onChange={onSimilarIllnessChange} />}
      </div>
    );
  }

  function renderSection(section) {
    if (section === "general") {
      return (
        <section aria-label={HISTORY_SECTION_TITLES.general} className="border border-gray-200 bg-white">
          <header className="border-b border-gray-200 px-4 py-2.5">
            <h3 className="text-[14px] font-bold leading-snug text-gray-900">{HISTORY_SECTION_TITLES.general}</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">From registration · informant asked at this visit</p>
          </header>
          <div className="px-4 py-3">
            <GeneralDataSection
              patient={patient}
              informant={informant}
              onInformantChange={onInformantChange}
              editLink={editLink}
              today={today}
            />
          </div>
        </section>
      );
    }
    const updated = updatedKeys.includes(section);
    const isEditing = editing[section] ?? updated;
    return (
      <SectionFrame
        title={HISTORY_SECTION_TITLES[section]}
        status={sectionStatus({ background, update, section, today })}
        updated={updated}
        reviewed={reviewedKeys.includes(section)}
        canReview={hasRecordedData(background, section)}
        editing={isEditing}
        onReview={() => toggleReviewed(section)}
        onToggleEdit={() => setEditing((state) => ({ ...state, [section]: !isEditing }))}
        onUndo={() => undo(section)}
      >
        {isEditing ? sectionForm(section) : sectionSummary(section)}
      </SectionFrame>
    );
  }

  const markAll = (
    <div className="space-y-1">
      <button
        type="button"
        disabled={reviewable.length === 0}
        onClick={() => onUpdateChange(markReviewed(update, reviewable))}
        className={`${SMALL_BUTTON_CLASS} w-full justify-center`}
      >
        <Check size={12} aria-hidden="true" />
        Mark all reviewed
      </button>
      <p className="text-[11px] text-gray-500">Marks sections that already hold answers. An empty section needs Update.</p>
    </div>
  );

  const errorList = errors.length > 0 && (
    <div role="alert" className="border border-red-200 border-l-4 border-l-red-600 bg-red-50 p-3">
      <p className="text-[13px] font-bold text-red-700">The patient history was not saved</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-red-700">
        {errors.map((error) => (
          <li key={error.text}>{error.text}</li>
        ))}
      </ul>
    </div>
  );

  if (layout === "section") {
    return (
      <div className="space-y-4">
        {errorList}
        {["general", ...editableKeys].map((section) => (
          <div key={section}>{renderSection(section)}</div>
        ))}
        <div className="max-w-xs">{markAll}</div>
      </div>
    );
  }

  const shown = navSections.some((section) => section.key === active && section.visible !== false) ? active : "general";
  return (
    <div className="space-y-4">
      {errorList}
      <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start">
        <div className="space-y-3">
          <SectionNav sections={navSections} active={shown} onSelect={setActive} />
          {markAll}
        </div>
        <div className="min-w-0">{renderSection(shown)}</div>
      </div>
    </div>
  );
}

const SLICE_KEYS = {
  medical: ["currentDiseases", "allergies", "hospitalizations"],
  family: ["familyHistory"],
  social: ["personalSocial"],
  obstetric: ["obstetric"],
};

/** The section's own keys of a background, as typed (not re-shaped). */
function sliceOf(background, section) {
  return Object.fromEntries(SLICE_KEYS[section].map((key) => [key, background?.[key]]));
}
