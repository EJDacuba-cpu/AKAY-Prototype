import { alertConditionNames } from "../../../utils/medicalConditions";
import { isNoAllergyText } from "../../../utils/allergies";

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
 * Allergies (red when recorded) and up to three confirmed / monitored
 * conditions, as one chip row. Only RHU-confirmed (or legacy-monitored)
 * conditions alert; unverified, under-evaluation and patient-reported ones do not.
 */
export default function PatientAlertChips({ background = {}, conditionGroups }) {
  const allergies = String(background?.allergies || "").trim();
  const alertNames = alertConditionNames(conditionGroups).filter(Boolean);
  const shownDiseases = alertNames.slice(0, MAX_DISEASE_CHIPS);
  const hiddenCount = alertNames.length - shownDiseases.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!allergies ? (
        <Chip tone="muted">Allergies not recorded</Chip>
      ) : isNoAllergyText(allergies) ? (
        <Chip tone="muted">No known allergies</Chip>
      ) : (
        <Chip tone="alert" title={allergies}>Allergy: {allergies}</Chip>
      )}
      {shownDiseases.map((name) => (
        <Chip key={name} tone="neutral">{name}</Chip>
      ))}
      {hiddenCount > 0 && <Chip tone="muted">+{hiddenCount} more</Chip>}
    </div>
  );
}
