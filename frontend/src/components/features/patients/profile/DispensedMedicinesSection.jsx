import { Button } from "../../../ui/button";
import ProfileCardsSkeleton from "./ProfileCardsSkeleton";
import { formatShortDate } from "../../../../utils/patientProfile";

export default function DispensedMedicinesSection({ rows = [], isLoading = false, isError = false, onRetry, onViewRecord }) {
  return (
    <section aria-labelledby="dispensed-medicines-title" className="mt-6">
      <div className="mb-3">
        <h3 id="dispensed-medicines-title" className="text-[17px] font-bold text-ink-800">Medicines Dispensed</h3>
        <p className="mt-1 text-xs text-neutral-500">Items actually dispensed during this patient&apos;s consultations</p>
      </div>
      {isError ? (
        <div role="alert" className="care-tracking-empty flex flex-col items-center justify-center gap-3 rounded-xl border border-alert-100 bg-alert-50 p-5 text-center text-sm text-alert-700">
          <p>Could not load dispensed medicines.</p>
          <Button type="button" variant="secondary" size="compact" onClick={() => onRetry?.()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <ProfileCardsSkeleton label="Loading dispensed medicines" />
      ) : rows.length === 0 ? (
        <p className="care-tracking-empty care-tracking-reveal flex items-center justify-center rounded-xl border border-neutral-200 bg-white p-5 text-center text-sm text-neutral-500">
          No medicines dispensed for this patient.
        </p>
      ) : (
        <ul className="care-tracking-grid care-tracking-reveal">
          {rows.map((row) => (
            <li key={row.id} className="profile-record-card">
              <div className="profile-record-card__body" tabIndex={0} role="region" aria-label={`${row.name} dispensing details`}>
                <h4 className="text-sm font-semibold text-ink-800">{row.name}</h4>
                <p className="mt-1 text-xs tabular-nums text-neutral-500">{formatShortDate(row.date)}</p>
                <dl className="mt-4 space-y-3 text-xs">
                  {[
                    ["Quantity", row.quantity || "Not recorded"],
                    ["Program", row.programs?.join(", ") || "Not recorded"],
                    ["Dispensed by", row.dispensedBy || "Not recorded"],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                      <dt className="text-neutral-500">{label}</dt>
                      <dd className="text-ink-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {onViewRecord && row.recordId ? (
                <div className="profile-record-card__footer">
                  <Button type="button" variant="secondary" size="compact" onClick={() => onViewRecord(row.recordId)}>View Record</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
