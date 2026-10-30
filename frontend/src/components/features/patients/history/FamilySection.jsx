import { useId, useRef, useState } from "react";

import { FAMILY_CONDITION_OPTIONS, familyConditionChoice, familyHistoryForChoice } from "../../../../utils/familyHistoryChoice";
import { FAMILY_RELATIONS } from "../../../../utils/patientHistory";
import { formatPatientName } from "../../../../utils/formatters";
import { Block, FieldGrid, RadioChoice, SelectField, TextField } from "./HistoryFields";
import ListEditor from "./ListEditor";

const ANSWERS = ["Yes", "No", "Unknown"];
const NEW_ITEM = { condition: "", kind: "", relation: "", relativePatientId: null };

/** Linked family members that can be picked as the relative: { value: id, label: name }. */
function relativeOptions(relatives) {
  return (Array.isArray(relatives) ? relatives : [])
    .map((relative) => ({
      value: String(relative?.id ?? relative?.patientId ?? ""),
      label: formatPatientName(relative, "Unnamed"),
    }))
    .filter((option) => option.value !== "");
}

/**
 * Similar Illness in the Family: a per-visit answer, never part of the stored
 * background. Exported so the history panel can ask it while the section is
 * only being reviewed.
 */
export function SimilarIllnessBlock({ value, onChange }) {
  const illness = value || { answer: "", who: "", note: "" };
  return (
    <Block title="Similar Illness in the Family" note="Asked at this visit. It is not added to Family Conditions.">
      <FieldGrid>
        <SelectField
          label="Anyone with a similar illness?"
          value={illness.answer}
          options={ANSWERS}
          emptyLabel="Not recorded"
          onChange={(next) => onChange({ ...illness, answer: next })}
        />
        <TextField
          label="Who"
          value={illness.who}
          onChange={(next) => onChange({ ...illness, who: next })}
        />
        <TextField
          label="Note"
          value={illness.note}
          onChange={(next) => onChange({ ...illness, note: next })}
        />
      </FieldGrid>
    </Block>
  );
}

/**
 * Family History body. `value` is the family slice { familyHistory };
 * `relatives` the patient's linked family members. Picking a relative only
 * identifies the person - it never copies their conditions. Similar Illness is
 * per visit; `showSimilarIllness={false}` leaves it out (Patient Background).
 * `baseline` is the saved chart slice so Unsure never overwrites it.
 */
export default function FamilySection({
  value,
  onChange,
  similarIllness,
  onSimilarIllnessChange,
  relatives,
  showSimilarIllness = true,
  baseline,
  errors = {},
}) {
  const family = value?.familyHistory || {};
  const items = Array.isArray(family.items) ? family.items : [];
  const options = relativeOptions(relatives);
  const radioName = useId();
  const savedRef = useRef(baseline?.familyHistory ?? family);
  if (baseline) savedRef.current = baseline.familyHistory ?? { noneKnown: false, items: [] };
  const heldItemsRef = useRef(items);
  const derived = familyConditionChoice(family);
  const [choice, setChoice] = useState(() => derived || "");
  // Unsure is local-only. Yes/None follow the stored slice when it has an
  // answer, so Undo and a resumed draft show the chart, not a stale click.
  const selected =
    choice === "unsure" ? "unsure" : derived === "yes" || derived === "none" ? derived : choice;

  const columns = [
    { key: "condition", label: "Condition", type: "text", required: true },
    { key: "kind", label: "Kind", type: "select", options: ["Chronic", "Hereditary"] },
    { key: "relation", label: "Relation", type: "select", options: FAMILY_RELATIONS },
    ...(options.length
      ? [
          {
            key: "relativePatientId",
            label: "Relative (optional)",
            type: "select",
            options,
            valueType: "number",
            emptyLabel: "Not linked",
          },
        ]
      : []),
  ];

  function stage(nextChoice, nextItems = items) {
    if (items.length) heldItemsRef.current = items;
    setChoice(nextChoice);
    const yesItems = nextItems.length ? nextItems : heldItemsRef.current;
    onChange({
      ...value,
      familyHistory: familyHistoryForChoice(nextChoice, {
        items: nextChoice === "yes" ? yesItems : nextItems,
        saved: savedRef.current,
      }),
    });
  }

  return (
    <div className="space-y-5">
      {showSimilarIllness && <SimilarIllnessBlock value={similarIllness} onChange={onSimilarIllnessChange} />}

      <Block
        title="Family Conditions"
        note={
          showSimilarIllness
            ? "Known conditions in the family. These stay on the chart across visits."
            : "Conditions found in the patient's family."
        }
      >
        <RadioChoice
          name={radioName}
          options={FAMILY_CONDITION_OPTIONS}
          value={selected}
          onChange={stage}
        />
        {selected === "yes" && (
          <div className="mt-3">
            <ListEditor
              label="family condition"
              addLabel="Add condition"
              items={items}
              columns={columns}
              newItem={NEW_ITEM}
              fieldPrefix="background_update.sections.family.familyHistory.items"
              errors={errors}
              onChange={(next) => {
                heldItemsRef.current = next;
                onChange({ ...value, familyHistory: { noneKnown: false, items: next } });
              }}
            />
          </div>
        )}
      </Block>
    </div>
  );
}
