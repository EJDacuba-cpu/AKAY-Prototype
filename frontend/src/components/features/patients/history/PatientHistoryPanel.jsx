import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import RestrictedArea from "../../../common/access/RestrictedArea";
import LockedPlaceholder from "../../../common/access/LockedPlaceholder";
import useClinicalRegistry from "../../../../hooks/useClinicalRegistry";
import { usePatientConditions } from "../../../../hooks/usePatientConditionGroups";
import { backgroundConditionGroups } from "../../../../utils/backgroundConditions";
import {
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
import HistorySectionSummary from "./HistorySectionSummary";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "../../../../utils/backgroundEditing";
import { SMALL_BUTTON_CLASS } from "./HistoryFields";
import ObstetricSection from "./ObstetricSection";
import { LegacyPendingConditions } from "../MedicalConditionsGroups";
import PastMedicalSection, { RhuConditions } from "./PastMedicalSection";
import PersonalSocialSection from "./PersonalSocialSection";
import SectionNav, { statusText } from "./SectionNav";

export const HISTORY_SECTION_TITLES = {
  general: "General Data",
  medical: "Past Medical History",
  family: "Family History",
  social: "Personal & Social History",
  obstetric: "Obstetric & Menstrual History",
};

const PRESSED_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-none border border-gray-900 bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-gray-700";

/** One editable section: its status, No changes / Update, and the summary or the form. */
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
 * Patient History (ITR page 1): the one shared component for the BHC
 * consultation (layout "section", `inline` to edit in place) and the RHU
 * record form (layout "screen" or stacked, with Update / Done / No changes).
 * Controlled; it holds no save logic. Edits are staged in `update` through
 * buildBackgroundUpdate, "No changes" marks a section reviewed, and nothing
 * here is required to continue. Entered values are checked when the
 * consultation moves on; invalid numbers and half-filled rows stay as typed.
 *
 * `errors` is historyErrorMessages(..., { withSection: true }) of the last
 * check: listed above the sections, and the first one's section is opened.
 * `fieldErrors` is the keyed object shown inline on the invalid inputs.
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
  fieldErrors = {},
  initialSection = "general",
  showGeneral = true,
  sections,
  showSimilarIllness = true,
  showEducationAndOccupation = true,
  inline = false,
}) {
  const { registry } = useClinicalRegistry();
  const conditionsQuery = usePatientConditions(patient?.id, { enabled: !locked });
  const [active, setActive] = useState(initialSection);
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

  const firstErrorField = errors.find((error) => error.key)?.key || "";
  useEffect(() => {
    if (!firstErrorField) return;
    const frame = window.requestAnimationFrame(() => {
      const escaped =
        typeof CSS !== "undefined" && CSS.escape ? CSS.escape(firstErrorField) : firstErrorField.replace(/"/g, '\\"');
      const element = document.querySelector(`[name="${escaped}"], [data-field="${escaped}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof element?.focus === "function") element.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [errorKey, firstErrorField]);

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
  const requestedKeys = Array.isArray(sections) && sections.length
    ? sections.filter((section) => EDITABLE_SECTION_KEYS.includes(section))
    : EDITABLE_SECTION_KEYS;
  const editableKeys = requestedKeys.filter(
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
    ...(showGeneral ? [{ key: "general", label: HISTORY_SECTION_TITLES.general, status: { kind: "auto" } }] : []),
    ...editableKeys.map((section) => ({
      key: section,
      label: HISTORY_SECTION_TITLES[section],
      status: sectionStatus({ background, update, section, today }),
      visible: true,
    })),
  ];

  function sectionForm(section) {
    const props = { value: sliceOf(current, section), onChange: changeSlice, errors: fieldErrors };
    if (section === "medical") return <PastMedicalSection {...props} conditionGroups={conditionGroups} />;
    if (section === "family") {
      return (
        <FamilySection
          {...props}
          baseline={sliceOf(background, "family")}
          similarIllness={similarIllness}
          onSimilarIllnessChange={onSimilarIllnessChange}
          relatives={familyRelatives}
          showSimilarIllness={showSimilarIllness}
        />
      );
    }
    if (section === "social") {
      return (
        <PersonalSocialSection
          {...props}
          patient={patient}
          householdEnvironment={householdEnvironment}
          today={today}
          showEducationAndOccupation={showEducationAndOccupation}
        />
      );
    }
    return <ObstetricSection {...props} patient={patient} today={today} />;
  }

  function sectionSummary(section) {
    const recorded = hasRecordedData(current, section);
    return (
      <div className="space-y-4">
        {section === "medical" && (
          <div className="space-y-3">
            <RhuConditions groups={conditionGroups} />
            <LegacyPendingConditions rows={conditionGroups.legacyPending} />
          </div>
        )}
        {recorded ? (
          <HistorySectionSummary
            section={section}
            value={current}
            omitFields={showEducationAndOccupation ? [] : BHC_HIDDEN_SOCIAL_FIELDS}
          />
        ) : (
          <p className="text-[13px] text-gray-500">
            Nothing recorded yet. Use Update to record it; &ldquo;None known&rdquo; is an answer too.
          </p>
        )}
        {section === "family" && showSimilarIllness && (
          <SimilarIllnessBlock value={similarIllness} onChange={onSimilarIllnessChange} />
        )}
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
    if (inline) {
      return (
        <section aria-label={HISTORY_SECTION_TITLES[section]} className="border border-gray-200 bg-white">
          <header className="border-b border-gray-200 px-4 py-2.5">
            <h3 className="text-[14px] font-bold leading-snug text-gray-900">{HISTORY_SECTION_TITLES[section]}</h3>
          </header>
          <div className="px-4 py-3">
            {section === "medical" && (
              <div className="mb-4 space-y-3">
                <RhuConditions groups={conditionGroups} />
                <LegacyPendingConditions rows={conditionGroups.legacyPending} />
              </div>
            )}
            {sectionForm(section)}
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
      <p className="text-[13px] font-bold text-red-700">Fix the highlighted fields before continuing</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-red-700">
        {errors.map((error) => (
          <li key={error.key || error.text}>{error.text}</li>
        ))}
      </ul>
    </div>
  );

  if (layout === "section") {
    return (
      <div className="space-y-4">
        {errorList}
        {[...(showGeneral ? ["general"] : []), ...editableKeys].map((section) => (
          <div key={section}>{renderSection(section)}</div>
        ))}
        {!inline && <div className="max-w-xs">{markAll}</div>}
      </div>
    );
  }

  const fallback = showGeneral ? "general" : editableKeys[0];
  const shown = navSections.some((section) => section.key === active && section.visible !== false) ? active : fallback;
  return (
    <div className="@container/history space-y-4">
      {errorList}
      <div className="grid gap-4 @3xl/history:grid-cols-[13rem_minmax(0,1fr)] @3xl/history:items-start">
        <div className="space-y-3">
          <SectionNav sections={navSections} active={shown} onSelect={setActive} />
          {!inline && markAll}
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
