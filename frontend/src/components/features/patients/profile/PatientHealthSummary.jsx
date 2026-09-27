import { ProfileSection } from "./ProfileSection";

/**
 * Static 2D figures for the body-map slot, keyed by `variant` so a later
 * pass can register sex/age-specific art (male/female/child) without
 * touching the surrounding card, spacing or layout. Only "neutral" exists
 * today - one fixed figure shown for every patient.
 */
const SILHOUETTE_VARIANTS = {
  neutral: {
    src: "/patient-body-map-placeholder.png",
    alt: "Generic body illustration placeholder",
  },
};

function BodyFigure({ variant }) {
  const figure = SILHOUETTE_VARIANTS[variant] || SILHOUETTE_VARIANTS.neutral;
  return (
    <img
      src={figure.src}
      alt={figure.alt}
      className="mx-auto h-56 w-auto max-w-full object-contain sm:h-64"
      draggable="false"
    />
  );
}

function DocumentedConditions({ diseases }) {
  if (diseases.length === 0) {
    return <p className="text-xs text-gray-500">No documented conditions yet.</p>;
  }
  return (
    <ul className="space-y-1">
      {diseases.map((disease, index) => (
        <li
          key={`${disease.name}-${index}`}
          className="flex items-center justify-between gap-2 text-xs text-gray-700"
        >
          <span className="min-w-0 truncate">{disease.name}</span>
          {disease.status && <span className="shrink-0 text-gray-400">{disease.status}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Overview tab's right-column companion: a 2D figure standing in for the
 * future interactive body map, plus a read-only summary of documented
 * conditions and care status. Shows only information already recorded for
 * the patient - no inferred findings, no condition-to-body mapping.
 */
export default function PatientHealthSummary({ patient, programLabels = [], variant = "neutral" }) {
  const diseases = Array.isArray(patient?.medicalBackground?.currentDiseases)
    ? patient.medicalBackground.currentDiseases
    : [];

  return (
    <ProfileSection id="health-summary" title="Patient Health Summary" className="mb-0 p-4">
      <div className="border border-gray-100 bg-gray-50 py-2">
        <BodyFigure variant={variant} />
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Body visualization will show documented conditions only.
      </p>

      <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Documented Conditions
          </h3>
          <DocumentedConditions diseases={diseases} />
        </div>

        {programLabels.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Care Status
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {programLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-sm border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </ProfileSection>
  );
}
