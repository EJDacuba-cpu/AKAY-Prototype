import { alertConditionNames } from "../../../utils/medicalConditions";
import { isNoAllergyText } from "../../../utils/allergies";
import { summarizeAllergies } from "../../../utils/patientHistory";

const MAX_DISEASE_CHIPS = 3;

const CHIP_BASE =
  "inline-flex max-w-full items-center break-words rounded-sm border px-2 py-0.5 text-left text-xs font-medium";

const TONES = {
  alert: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-gray-200 bg-white text-gray-700",
  program: "border-gray-200 bg-gray-50 text-gray-700",
  muted: "border-transparent px-0 font-normal text-gray-500",
};

export function Chip({ tone = "neutral", children, title }) {
  return (
    <span title={title} className={`${CHIP_BASE} ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * The allergy chip: red with the allergens when recorded, muted "No known
 * allergies" or "Allergies not recorded" otherwise. Takes the structured
 * allergies ({ noneKnown, items }) or an old free-text answer.
 */
export function AllergyChip({ allergies }) {
  const summary = summarizeAllergies(allergies);
  if (summary.status === "none" || (summary.status === "recorded" && isNoAllergyText(summary.text))) {
    return <Chip tone="muted">No known allergies</Chip>;
  }
  if (summary.status === "recorded") {
    return (
      <Chip tone="alert" title={summary.text}>
        Allergy: {summary.text}
      </Chip>
    );
  }
  return <Chip tone="muted">Allergies not recorded</Chip>;
}

/**
 * Allergies (red when recorded) and up to three confirmed / monitored
 * conditions, as one chip row. Only RHU-confirmed (or legacy-monitored)
 * conditions alert; unverified, under-evaluation and patient-reported ones do not.
 */
export default function PatientAlertChips({ background = {}, conditionGroups }) {
  const alertNames = alertConditionNames(conditionGroups).filter(Boolean);
  const shownDiseases = alertNames.slice(0, MAX_DISEASE_CHIPS);
  const hiddenCount = alertNames.length - shownDiseases.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AllergyChip allergies={background?.allergies} />
      {shownDiseases.map((name) => (
        <Chip key={name} tone="neutral">{name}</Chip>
      ))}
      {hiddenCount > 0 && <Chip tone="muted">+{hiddenCount} more</Chip>}
    </div>
  );
}
