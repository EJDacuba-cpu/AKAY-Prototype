import { Lock } from "lucide-react";

import { conditionStatusLabel } from "../../../../utils/medicalConditions";
import { formatShortDate } from "../../../../utils/patientProfile";
import { LegacyPendingConditions } from "../MedicalConditionsGroups";
import { Block } from "./HistoryFields";
import ListEditor from "./ListEditor";

const REPORTED_COLUMNS = [
  { key: "name", label: "Condition", type: "text", required: true },
  { key: "yearDiagnosed", label: "Year diagnosed", type: "number", min: 1900, max: 2100 },
  { key: "diagnosedWhere", label: "Diagnosed where", type: "text" },
  { key: "note", label: "Note", type: "text" },
];
const REPORTED_NEW = { name: "", yearDiagnosed: null, diagnosedWhere: "", note: "" };

const ALLERGY_COLUMNS = [
  { key: "allergen", label: "Allergen", type: "text", required: true },
  { key: "reaction", label: "Reaction", type: "text" },
];
const ALLERGY_NEW = { allergen: "", reaction: "" };

const HOSPITAL_COLUMNS = [
  { key: "type", label: "Type", type: "select", options: ["Hospitalization", "Surgery"], required: true },
  { key: "year", label: "Year", type: "number", min: 1900, max: 2100 },
  { key: "reason", label: "Reason", type: "text" },
  { key: "place", label: "Place", type: "text" },
];
const HOSPITAL_NEW = { type: "", year: null, reason: "", place: "" };

function RhuGroup({ title, rows, showLock = false }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {showLock && <Lock size={12} aria-hidden="true" />}
        {title}
      </p>
      <ul className="mt-1 divide-y divide-gray-100 border border-gray-200 bg-gray-50">
        {rows.map((condition) => (
          <li key={condition.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
            <span className="text-[13px] font-medium text-gray-900">{condition.conditionName}</span>
            <span className="text-[11px] text-gray-500">
              {[
                conditionStatusLabel(condition.status),
                condition.confirmedAt && formatShortDate(condition.confirmedAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Read-only RHU conditions in three groups, each shown only when it has rows. */
export function RhuConditions({ groups }) {
  const confirmed = groups?.confirmed || [];
  const underEvaluation = groups?.underEvaluation || [];
  const past = groups?.past || [];
  const none = confirmed.length + underEvaluation.length + past.length === 0;
  return (
    <div className="space-y-3">
      <RhuGroup title="Confirmed by RHU" rows={confirmed} showLock />
      <RhuGroup title="Under evaluation at RHU" rows={underEvaluation} showLock />
      <RhuGroup title="Past (RHU)" rows={past} showLock />
      {none && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-gray-500">
          <Lock size={12} aria-hidden="true" />
          No conditions confirmed by RHU.
        </p>
      )}
      <p className="text-[11px] text-gray-500">Only RHU confirms or changes these.</p>
    </div>
  );
}

/**
 * Section II. `value` is the medical slice { currentDiseases, allergies,
 * hospitalizations }; `conditionGroups` is groupMedicalConditions over the
 * patient. Only patient-reported conditions are editable here.
 *
 * `rhuConditionsSlot` (optional) replaces the read-only RHU / legacy condition
 * groups, e.g. with a loading or "could not be loaded" notice so a failed
 * fetch never reads as "No conditions confirmed by RHU". Default: the groups.
 */
export default function PastMedicalSection({ value, onChange, conditionGroups, rhuConditionsSlot }) {
  const diseases = Array.isArray(value?.currentDiseases) ? value.currentDiseases : [];
  const allergies = value?.allergies || {};
  const hospitalizations = value?.hospitalizations || {};
  const allergyItems = Array.isArray(allergies.items) ? allergies.items : [];
  const hospitalItems = Array.isArray(hospitalizations.items) ? hospitalizations.items : [];

  return (
    <div className="space-y-5">
      <Block title="Current Conditions">
        {rhuConditionsSlot ?? (
          <>
            <RhuConditions groups={conditionGroups} />
            {/* Read-only, like the profile tab: legacy BHC monitoring awaiting RHU verification. */}
            <LegacyPendingConditions rows={conditionGroups?.legacyPending} />
          </>
        )}
        <div>
          <p className="text-xs font-medium text-gray-500">Reported by patient (not confirmed)</p>
          <div className="mt-1">
            <ListEditor
              label="reported condition"
              addLabel="Add condition"
              items={diseases}
              columns={REPORTED_COLUMNS}
              newItem={REPORTED_NEW}
              onChange={(next) => onChange({ ...value, currentDiseases: next })}
            />
          </div>
        </div>
      </Block>

      <Block title="Allergies">
        <ListEditor
          label="allergy"
          addLabel="Add allergy"
          items={allergyItems}
          columns={ALLERGY_COLUMNS}
          newItem={ALLERGY_NEW}
          noneLabel="No known allergies"
          noneChecked={allergies.noneKnown === true}
          onNoneChange={(checked) =>
            onChange({ ...value, allergies: { noneKnown: checked, items: checked ? [] : allergyItems } })
          }
          onChange={(next) =>
            onChange({
              ...value,
              allergies: { noneKnown: next.length > 0 ? false : allergies.noneKnown === true, items: next },
            })
          }
        />
      </Block>

      <Block title="Hospitalizations & Surgeries">
        <ListEditor
          label="hospitalization or surgery"
          addLabel="Add entry"
          items={hospitalItems}
          columns={HOSPITAL_COLUMNS}
          newItem={HOSPITAL_NEW}
          noneLabel="None"
          noneChecked={hospitalizations.none === true}
          onNoneChange={(checked) =>
            onChange({ ...value, hospitalizations: { none: checked, items: checked ? [] : hospitalItems } })
          }
          onChange={(next) =>
            onChange({
              ...value,
              hospitalizations: { none: next.length > 0 ? false : hospitalizations.none === true, items: next },
            })
          }
        />
      </Block>
    </div>
  );
}
