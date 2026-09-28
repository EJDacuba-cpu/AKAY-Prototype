import { getSuggestedCarePathways } from "../../../../utils/carePathways";

/**
 * CARE / MONITORING, under Diagnosis / Clinical Impression. A recorded
 * structured diagnosis can make a care pathway AVAILABLE; this only offers it.
 * Nothing starts until the health worker clicks Start Monitoring, and Not Now
 * hides the offer without touching the diagnosis.
 *
 * Computed from the saved diagnosis list only, so it changes when a diagnosis
 * is added, saved or removed - never while one is being typed.
 *
 * @param diagnoses        the consultation's saved diagnoses
 * @param selectedPrograms the consultation's programs (a pathway is started
 *                         when its program is selected)
 * @param dismissed        pathway keys the worker chose Not Now for
 */
export default function CarePathwaySuggestions({
  diagnoses = [],
  selectedPrograms = [],
  dismissed = [],
  onStart,
  onDismiss,
  onOpenForm,
  disabled = false,
}) {
  const pathways = getSuggestedCarePathways(diagnoses).filter(
    (pathway) => selectedPrograms.includes(pathway.programKey) || !dismissed.includes(pathway.pathwayKey),
  );
  if (pathways.length === 0) return null;

  return (
    <section aria-label="Care / Monitoring" className="mt-4">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#374151]">Care / Monitoring</p>
      <div className="space-y-2">
        {pathways.map((pathway) =>
          selectedPrograms.includes(pathway.programKey) ? (
            <div
              key={pathway.pathwayKey}
              className="flex flex-wrap items-center justify-between gap-2 border border-[#E5E7EB] border-l-4 border-l-[#DC2626] bg-white px-3 py-2"
            >
              <p className="text-sm text-[#111827]">
                <span className="font-semibold">{pathway.label}</span> added to this consultation
                <span className="text-[#6B7280]"> · {pathway.matchedDiagnoses.join(", ")}</span>
              </p>
              <button
                type="button"
                onClick={() => onOpenForm(pathway.pathwayKey)}
                className="text-[12px] font-semibold text-[#DC2626] hover:text-red-700"
              >
                Open form
              </button>
            </div>
          ) : (
            <div key={pathway.pathwayKey} className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
              <span className="inline-flex items-center rounded-sm bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#374151]">
                Suggested
              </span>
              <p className="mt-1.5 text-[14px] font-bold leading-snug text-[#111827]">{pathway.label}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-[#111827]">
                {pathway.matchedDiagnoses.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs leading-snug text-[#6B7280]">
                An available workflow for the diagnoses you recorded. It is optional, and starting it is your
                decision. AKAY does not diagnose or classify the patient.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStart(pathway.pathwayKey)}
                  disabled={disabled}
                  className="h-8 bg-[#DC2626] px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start Monitoring
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(pathway.pathwayKey)}
                  className="h-8 px-3 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                >
                  Not Now
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
