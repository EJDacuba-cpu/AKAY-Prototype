import { FAMILY_RELATIONS } from "../../../../utils/patientHistory";
import { formatPatientName } from "../../../../utils/formatters";
import { Block, FieldGrid, SelectField, TextField } from "./HistoryFields";
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
 * Section III. `value` is the family slice { familyHistory }; `relatives` the
 * patient's linked family members. Picking a relative only identifies the
 * person - it never copies their conditions. Similar Illness is per visit and
 * has its own props.
 */
export default function FamilySection({
  value,
  onChange,
  similarIllness,
  onSimilarIllnessChange,
  relatives,
}) {
  const family = value?.familyHistory || {};
  const items = Array.isArray(family.items) ? family.items : [];
  const options = relativeOptions(relatives);
  const illness = similarIllness || { answer: "", who: "", note: "" };

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

  return (
    <div className="space-y-5">
      <Block title="Family Conditions" note="Conditions found in the patient's family.">
        <ListEditor
          label="family condition"
          addLabel="Add condition"
          items={items}
          columns={columns}
          newItem={NEW_ITEM}
          noneLabel="None known"
          noneChecked={family.noneKnown === true}
          onNoneChange={(checked) =>
            onChange({ ...value, familyHistory: { noneKnown: checked, items: checked ? [] : items } })
          }
          onChange={(next) =>
            onChange({
              ...value,
              familyHistory: { noneKnown: next.length > 0 ? false : family.noneKnown === true, items: next },
            })
          }
        />
      </Block>

      <Block title="Similar Illness in the Family" note="Asked at this visit.">
        <FieldGrid>
          <SelectField
            label="Anyone with a similar illness?"
            value={illness.answer}
            options={ANSWERS}
            emptyLabel="Not recorded"
            onChange={(next) => onSimilarIllnessChange({ ...illness, answer: next })}
          />
          <TextField
            label="Who"
            value={illness.who}
            onChange={(next) => onSimilarIllnessChange({ ...illness, who: next })}
          />
          <TextField
            label="Note"
            value={illness.note}
            onChange={(next) => onSimilarIllnessChange({ ...illness, note: next })}
          />
        </FieldGrid>
      </Block>
    </div>
  );
}
