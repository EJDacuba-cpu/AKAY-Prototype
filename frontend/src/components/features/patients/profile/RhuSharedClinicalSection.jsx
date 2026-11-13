import { Link } from "react-router";
import { SoftLoadingArea } from "../../../common";
import { LaboratoryEvidenceList } from "../../health-records/LaboratoryEvidence";
import { formatDisplayValue } from "../../../../utils/formatters";

/**
 * Read-only RHU clinical slice for accepted monitoring handoffs linked to this
 * BHC patient. Kept separate from local Health Records to preserve facility scope.
 */
export default function RhuSharedClinicalSection({
  entries = [],
  isLoading = false,
  isError = false,
  onRetry,
}) {
  return (
    <section className="space-y-3 border-b border-neutral-200 p-4 sm:p-5">
      <div>
        <h2 className="text-[17px] font-bold text-ink-900">RHU Shared Clinical Information</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Authorized excerpts from accepted RHU monitoring handoffs. Read-only. Local BHC consultations stay under this patient&apos;s Health Records.
        </p>
      </div>

      <SoftLoadingArea isLoading={isLoading} message="Loading shared RHU clinical information..." minHeight="min-h-[8rem]">
        {isError ? (
          <div className="rounded-lg border border-alert-200 bg-alert-50 px-3 py-2 text-sm text-alert-700">
            Unable to load shared RHU clinical information.
            {onRetry && (
              <button type="button" className="ml-2 underline" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-neutral-600">No accepted RHU monitoring handoffs shared with this patient.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.handoff_id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">
                      {entry.source_facility?.name || "RHU"} · {entry.consultation_date || "Consultation date unavailable"}
                    </p>
                    <Link
                      to={`/bhc/patients?view=monitoring-requests`}
                      className="text-xs font-medium text-ink-800 underline underline-offset-2"
                      state={{ openHandoffId: entry.handoff_id }}
                    >
                      Monitoring request #{entry.handoff_id}
                    </Link>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-neutral-600">
                    RHU source patient ID {entry.source_patient_id}
                    {entry.linked_patient_id ? ` · Linked BHC ID ${entry.linked_patient_id}` : ""}
                  </p>
                </div>
                <div className="space-y-3 p-3">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Detail label="Confirmed condition" value={entry.condition?.name} />
                    <Detail label="Condition status" value={formatDisplayValue(entry.condition?.status)} />
                    <Detail label="Monitoring recommendation" value={entry.recommendation} wide />
                    <Detail label="Chief complaint" value={entry.chief_complaint} wide />
                    <Detail label="Clinical assessment" value={entry.clinical_assessment} wide />
                  </dl>

                  {entry.vital_signs && Object.keys(entry.vital_signs).length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Vital signs</h3>
                      <p className="mt-1 text-sm text-neutral-700">
                        {summarizeVitals(entry.vital_signs)}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      Shared laboratory evidence
                    </h3>
                    <LaboratoryEvidenceList
                      entries={entry.laboratory_evidence || []}
                      emptyMessage="No laboratory evidence shared with this handoff."
                    />
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      Prescription summary (informational)
                    </h3>
                    {(entry.prescriptions || []).length === 0 ? (
                      <p className="mt-1 text-sm text-neutral-600">None shared.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {entry.prescriptions.map((rx, index) => (
                          <li key={`${entry.handoff_id}-rx-${index}`} className="text-sm text-ink-900">
                            {rx.line || rx.medicineName || "Prescription"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-xs text-neutral-600">
                      RHU prescriptions remain informational. Dispense only from BHC consultation inventory.
                    </p>
                  </div>

                  {entry.follow_up_recommendations && (
                    <Detail label="Follow-up recommendations" value={entry.follow_up_recommendations} wide />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SoftLoadingArea>
    </section>
  );
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{value || "—"}</dd>
    </div>
  );
}

function summarizeVitals(vitals) {
  if (!vitals || typeof vitals !== "object") return "—";
  const pairs = Object.entries(vitals)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${value}`);
  return pairs.length ? pairs.join(" · ") : "—";
}
