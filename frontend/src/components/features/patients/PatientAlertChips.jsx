export const NO_ALLERGY_PATTERN = /^(none|n\/a|na|nka|nkda|no known.*|no allergies?|-+)$/i;
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

/** Allergies (red when recorded) and up to three active conditions, as one chip row. */
export default function PatientAlertChips({ background = {} }) {
  const allergies = String(background?.allergies || "").trim();
  const activeDiseases = (Array.isArray(background?.currentDiseases) ? background.currentDiseases : [])
    .filter((disease) => disease?.name && String(disease.status || "Active").toLowerCase() === "active");
  const shownDiseases = activeDiseases.slice(0, MAX_DISEASE_CHIPS);
  const hiddenCount = activeDiseases.length - shownDiseases.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!allergies ? (
        <Chip tone="muted">Allergies not recorded</Chip>
      ) : NO_ALLERGY_PATTERN.test(allergies) ? (
        <Chip tone="muted">No known allergies</Chip>
      ) : (
        <Chip tone="alert" title={allergies}>Allergy: {allergies}</Chip>
      )}
      {shownDiseases.map((disease) => (
        <Chip key={disease.name} tone="neutral">{disease.name}</Chip>
      ))}
      {hiddenCount > 0 && <Chip tone="muted">+{hiddenCount} more</Chip>}
    </div>
  );
}
