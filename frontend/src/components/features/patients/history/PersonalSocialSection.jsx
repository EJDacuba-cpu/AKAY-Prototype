import { historyFieldError } from "../../../../utils/backgroundValidation";
import { formatEnvironment } from "../../../../utils/backgroundFormat";
import { formatDisplayValue } from "../../../../utils/formatters";
import { isInfantAt } from "../../../../utils/infantVisibility";
import {
  EDUCATION_LEVELS,
  EXPOSURES,
  TOILET_TYPES,
  WATER_SOURCES,
  packYears,
  sectionVisibility,
} from "../../../../utils/patientHistory";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  Block,
  CheckboxField,
  CollapsibleBlock,
  FieldGrid,
  NumberField,
  SMALL_BUTTON_CLASS,
  SelectField,
  TextField,
} from "./HistoryFields";

const STATUSES = [
  { value: "never", label: "Never" },
  { value: "former", label: "Former" },
  { value: "current", label: "Current" },
];
const FREQUENCIES = [
  { value: "occasional", label: "Occasional" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];
const SEXUAL_ACTIVE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "declined", label: "Declined to answer" },
];
const DIET = [
  ["highSalt", "High salt"],
  ["fatty", "Fatty foods"],
  ["sweetDrinks", "Sweet drinks"],
  ["lowFruitVeg", "Low fruits & vegetables"],
];

const isBlank = (value) => (Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim());

/**
 * `target` with the household's water source and toilet copied into its EMPTY
 * fields. Only these two are household facts; exposures and notes are personal
 * and are never copied from another patient.
 */
function fillEmptyEnvironment(target, source) {
  const result = { ...target };
  ["waterSource", "toilet"].forEach((key) => {
    if (isBlank(target[key]) && !isBlank(source[key])) result[key] = source[key];
  });
  return result;
}

const SOCIAL = "background_update.sections.social.personalSocial";

/**
 * Section IV. `value` is the social slice { personalSocial }. Occupation is
 * read-only from registration. Changing a status clears the fields that only
 * apply to another status, so nothing stale is saved.
 *
 * `showEducationAndOccupation={false}` leaves out the Education & Occupation
 * block (BHC: Education and Occupation belong to Patient Information, Past
 * Occupations is history only); the values in `value` are passed through
 * untouched. The default keeps the block for the RHU record form.
 */

export default function PersonalSocialSection({
  value,
  onChange,
  patient,
  householdEnvironment,
  today = new Date(),
  showEducationAndOccupation = true,
  errors = {},
}) {
  const social = value?.personalSocial || {};
  const education = social.education || {};
  const smoking = social.smoking || {};
  const alcohol = social.alcohol || {};
  const diet = social.diet || {};
  const sexual = social.sexual || {};
  const environment = social.environment || {};
  const exposures = Array.isArray(environment.exposures) ? environment.exposures : [];
  const smokes = smoking.status === "former" || smoking.status === "current";
  const pack = smokes ? packYears(smoking) : null;
  const visibility = sectionVisibility(patient, today);
  const sexualCollapsed = visibility.sexual === "collapsed";
  const hideAdultLifestyle = isInfantAt(patient, today);
  const field = (path) => `${SOCIAL}.${path}`;
  const fieldError = (path) => historyFieldError(errors, field(path));
  const sexualHasError = Object.keys(errors).some((key) => key.startsWith(field("sexual")));

  const set = (group, patch) =>
    onChange({ ...value, personalSocial: { ...social, [group]: { ...(social[group] || {}), ...patch } } });

  const prefill = householdEnvironment?.environment;
  const prefillText = prefill
    ? formatEnvironment({ waterSource: prefill.waterSource, toilet: prefill.toilet })
    : "";
  const prefillResult = prefill ? fillEmptyEnvironment(environment, prefill) : environment;
  const prefillUseful = JSON.stringify(prefillResult) !== JSON.stringify(environment);
  const prefillDate = householdEnvironment?.date ? ` · ${formatShortDate(householdEnvironment.date)}` : "";

  function changeSmoking(status) {
    const cleared =
      status === "never" || status === ""
        ? { sticksPerDay: null, years: null, quitYear: null }
        : status === "current"
          ? { quitYear: null }
          : {};
    set("smoking", { status, ...cleared });
  }

  function toggleExposure(exposure, checked) {
    set("environment", {
      exposures: checked ? [...exposures, exposure] : exposures.filter((item) => item !== exposure),
    });
  }

  return (
    <div className="space-y-5">
      {showEducationAndOccupation && !hideAdultLifestyle && (
        <Block title="Education & Occupation">
          <FieldGrid>
            <SelectField label="Education level" value={education.level} options={EDUCATION_LEVELS} emptyLabel="Not recorded" onChange={(next) => set("education", { level: next })} />
            <SelectField label="Completed" value={education.completed} options={["Level", "Graduate"]} emptyLabel="Not recorded" onChange={(next) => set("education", { completed: next })} />
            <div>
              <p className="text-xs font-medium text-gray-500">Occupation</p>
              <p className="mt-1 py-2 text-[12.5px] text-gray-900">{formatDisplayValue(patient?.occupation, "Not recorded")}</p>
            </div>
            <TextField label="Past occupations" value={social.pastOccupations} onChange={(next) => onChange({ ...value, personalSocial: { ...social, pastOccupations: next } })} />
          </FieldGrid>
        </Block>
      )}

      {!hideAdultLifestyle && (
        <>
          <Block title="Smoking">
            <FieldGrid>
              <SelectField
                label="Smoking status"
                name={field("smoking.status")}
                error={fieldError("smoking.status")}
                value={smoking.status}
                options={STATUSES}
                emptyLabel="Not recorded"
                onChange={changeSmoking}
              />
              {(smokes || fieldError("smoking.sticksPerDay") || fieldError("smoking.years")) && (
                <>
                  <NumberField
                    label="Sticks per day"
                    name={field("smoking.sticksPerDay")}
                    error={fieldError("smoking.sticksPerDay")}
                    min={1}
                    max={100}
                    value={smoking.sticksPerDay}
                    onChange={(next) => set("smoking", { sticksPerDay: next })}
                  />
                  <NumberField
                    label="Years smoked"
                    name={field("smoking.years")}
                    error={fieldError("smoking.years")}
                    min={0}
                    max={80}
                    value={smoking.years}
                    onChange={(next) => set("smoking", { years: next })}
                  />
                </>
              )}
              {(smoking.status === "former" || fieldError("smoking.quitYear")) && (
                <NumberField
                  label="Year quit"
                  name={field("smoking.quitYear")}
                  error={fieldError("smoking.quitYear")}
                  min={1900}
                  max={2100}
                  value={smoking.quitYear}
                  onChange={(next) => set("smoking", { quitYear: next })}
                />
              )}
            </FieldGrid>
            {pack !== null && <p className="text-[12.5px] text-gray-700">Pack-years: {pack}</p>}
          </Block>

          <Block title="Alcohol">
            <FieldGrid>
              <SelectField label="Alcohol status" value={alcohol.status} options={STATUSES} emptyLabel="Not recorded" onChange={(next) => set("alcohol", { status: next, ...(next === "current" ? {} : { frequency: "" }) })} />
              {alcohol.status === "current" && (
                <SelectField label="Frequency" value={alcohol.frequency} options={FREQUENCIES} emptyLabel="Not recorded" onChange={(next) => set("alcohol", { frequency: next })} />
              )}
            </FieldGrid>
          </Block>

          <Block title="Diet">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {DIET.map(([key, label]) => (
                <CheckboxField key={key} label={label} checked={diet[key] === true} onChange={(next) => set("diet", { [key]: next })} />
              ))}
            </div>
            <TextField label="Diet notes" value={diet.notes} onChange={(next) => set("diet", { notes: next })} />
          </Block>
        </>
      )}

      {visibility.sexual !== "hidden" && (
        <CollapsibleBlock title="Sexual History" collapsed={sexualCollapsed} forceOpen={sexualHasError}>
          <Block title="Sexual History">
            <FieldGrid>
              <SelectField label="Sexually active" value={sexual.active} options={SEXUAL_ACTIVE} emptyLabel="Not recorded" onChange={(next) => set("sexual", { active: next })} />
              <TextField label="Sexual history notes" value={sexual.notes} onChange={(next) => set("sexual", { notes: next })} />
            </FieldGrid>
          </Block>
        </CollapsibleBlock>
      )}

      <Block title="Household Environment">
        {prefill && prefillText && (
          <div className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="min-w-0 text-[12.5px] text-gray-700">
              <p className="font-medium text-gray-900">
                From {householdEnvironment.patientName || "a household member"}&apos;s record{prefillDate}
              </p>
              <p className="break-words">{prefillText}</p>
            </div>
            <button type="button" disabled={!prefillUseful} onClick={() => set("environment", prefillResult)} className={SMALL_BUTTON_CLASS}>
              Use these
            </button>
          </div>
        )}
        <FieldGrid>
          <SelectField label="Water source" value={environment.waterSource} options={WATER_SOURCES} emptyLabel="Not recorded" onChange={(next) => set("environment", { waterSource: next })} />
          <SelectField label="Toilet" value={environment.toilet} options={TOILET_TYPES} emptyLabel="Not recorded" onChange={(next) => set("environment", { toilet: next })} />
        </FieldGrid>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {EXPOSURES.map((exposure) => (
            <CheckboxField key={exposure.value} label={exposure.label} checked={exposures.includes(exposure.value)} onChange={(next) => toggleExposure(exposure.value, next)} />
          ))}
        </div>
        <TextField label="Environment notes" value={environment.notes} onChange={(next) => set("environment", { notes: next })} />
      </Block>
    </div>
  );
}
