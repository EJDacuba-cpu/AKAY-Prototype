import { historyFieldError } from "../../../../utils/backgroundValidation";
import {
  DELIVERY_TYPES,
  MENSTRUAL_SYMPTOMS,
  PREGNANCY_OUTCOMES,
  sectionVisibility,
} from "../../../../utils/patientHistory";
import {
  Block,
  CheckboxField,
  CollapsibleBlock,
  FieldGrid,
  NumberField,
  SelectField,
  TextField,
} from "./HistoryFields";
import ListEditor from "./ListEditor";

const STATUSES = [
  { value: "menstruating", label: "Menstruating" },
  { value: "menopause", label: "Menopause" },
];
const AMOUNTS = [
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
];
const REGULARITY = [
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
];

const PREGNANCY_COLUMNS = [
  { key: "year", label: "Year", type: "number", min: 1900, max: 2100 },
  { key: "outcome", label: "Outcome", type: "select", options: PREGNANCY_OUTCOMES, emptyLabel: "Outcome not recorded" },
  { key: "delivery", label: "Delivery", type: "select", options: DELIVERY_TYPES, emptyLabel: "Delivery not recorded" },
  { key: "place", label: "Place", type: "text" },
  { key: "note", label: "Note", type: "text" },
];
const PREGNANCY_NEW = { year: null, outcome: "", delivery: "", place: "", note: "" };

const OBSTETRIC = "background_update.sections.obstetric.obstetric";

/**
 * Section V. `value` is the obstetric slice { obstetric }. It records previous
 * pregnancies; the prenatal form owns the current pregnancy's OB score. The
 * section starts collapsed (with a Show button) below the age that
 * sectionVisibility() opens it; the caller leaves it out for non-female patients.
 */

export default function ObstetricSection({ value, onChange, patient, today = new Date(), errors = {} }) {
  const obstetric = value?.obstetric || {};
  const symptoms = Array.isArray(obstetric.symptoms) ? obstetric.symptoms : [];
  const pregnancies = Array.isArray(obstetric.pregnancies) ? obstetric.pregnancies : [];
  const collapsed = patient ? sectionVisibility(patient, today).obstetric === "collapsed" : false;
  const fieldError = (path) => historyFieldError(errors, `${OBSTETRIC}.${path}`);
  const hasError = Object.keys(errors).some((key) => key.startsWith(OBSTETRIC));

  const set = (patch) => onChange({ ...value, obstetric: { ...obstetric, ...patch } });

  function changeStatus(status) {
    if (status === "menstruating") set({ menstrualStatus: status, menopauseAge: null });
    else if (status === "menopause") {
      set({ menstrualStatus: status, intervalDays: null, durationDays: null, amount: "", regularity: "" });
    } else {
      set({
        menstrualStatus: status,
        menopauseAge: null,
        intervalDays: null,
        durationDays: null,
        amount: "",
        regularity: "",
      });
    }
  }

  function toggleSymptom(symptom, checked) {
    set({ symptoms: checked ? [...symptoms, symptom] : symptoms.filter((item) => item !== symptom) });
  }

  return (
    <CollapsibleBlock title="Obstetric & Menstrual History" collapsed={collapsed} forceOpen={hasError}>
      <div className="space-y-5">
        <Block title="Menstrual Cycle">
          <FieldGrid>
            <NumberField label="Age at first period" name={`${OBSTETRIC}.menarcheAge`} error={fieldError("menarcheAge")} min={6} max={25} value={obstetric.menarcheAge} onChange={(next) => set({ menarcheAge: next })} />
            <SelectField label="Menstrual status" name={`${OBSTETRIC}.menstrualStatus`} error={fieldError("menstrualStatus")} value={obstetric.menstrualStatus} options={STATUSES} emptyLabel="Not recorded" onChange={changeStatus} />
            {obstetric.menstrualStatus === "menopause" ? (
              <NumberField label="Age at menopause" name={`${OBSTETRIC}.menopauseAge`} error={fieldError("menopauseAge")} min={30} max={70} value={obstetric.menopauseAge} onChange={(next) => set({ menopauseAge: next })} />
            ) : (
              <>
                <NumberField label="Cycle interval (days)" name={`${OBSTETRIC}.intervalDays`} error={fieldError("intervalDays")} min={10} max={90} value={obstetric.intervalDays} onChange={(next) => set({ intervalDays: next })} />
                <NumberField label="Duration (days)" name={`${OBSTETRIC}.durationDays`} error={fieldError("durationDays")} min={1} max={15} value={obstetric.durationDays} onChange={(next) => set({ durationDays: next })} />
                <SelectField label="Amount" name={`${OBSTETRIC}.amount`} error={fieldError("amount")} value={obstetric.amount} options={AMOUNTS} emptyLabel="Not recorded" onChange={(next) => set({ amount: next })} />
                <SelectField label="Regularity" name={`${OBSTETRIC}.regularity`} error={fieldError("regularity")} value={obstetric.regularity} options={REGULARITY} emptyLabel="Not recorded" onChange={(next) => set({ regularity: next })} />
              </>
            )}
          </FieldGrid>
        </Block>

        <Block title="Menstrual Symptoms">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {MENSTRUAL_SYMPTOMS.map((symptom) => (
              <CheckboxField key={symptom.value} label={symptom.label} checked={symptoms.includes(symptom.value)} onChange={(next) => toggleSymptom(symptom.value, next)} />
            ))}
          </div>
          <TextField label="Symptom notes" value={obstetric.symptomNotes} onChange={(next) => set({ symptomNotes: next })} />
        </Block>

        <Block title="Previous pregnancies">
          <p className="text-xs text-neutral-600">
            Record previous pregnancies here. G/P and TPAL for the current prenatal assessment are recorded in Prenatal Care.
          </p>
          <ListEditor
            label="previous pregnancy"
            addLabel="Add previous pregnancy"
            items={pregnancies}
            columns={PREGNANCY_COLUMNS}
            newItem={PREGNANCY_NEW}
            fieldPrefix={`${OBSTETRIC}.pregnancies`}
            errors={errors}
            onChange={(next) => set({ pregnancies: next })}
          />
        </Block>
      </div>
    </CollapsibleBlock>
  );
}
