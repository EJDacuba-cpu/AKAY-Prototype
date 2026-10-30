import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../ui/card";
import { Button } from "../../../ui/button";

export default function RhuBhcReferralReference({ slip = {}, sendingBhc, onViewFullSlip, loading, unauthorized, missing, loadError, onRetry }) {
  const unavailable = loading || unauthorized || missing || loadError;
  return (
    <Card className="ehr-consult__sheet">
      <CardHeader>
        <CardTitle>BHC Referral</CardTitle>
        <CardDescription>Previous BHC observations for reference. Record today's RHU assessment separately.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {unavailable ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <p className="text-sm text-neutral-600">
              {unauthorized ? "Clinical referral details are restricted to authorized RHU users."
                : loading ? "Loading BHC referral..."
                  : loadError ? "Unable to load the BHC referral."
                    : "The referral linked to this visit could not be loaded for this patient."}
            </p>
            {!loading && !unauthorized && <Button type="button" variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
          </div>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Originating BHC", slip.referringHci || sendingBhc],
                ["Original Chief Complaint", slip.chiefComplaint],
                ["History of Present Illness", slip.historyOfPresentIllness],
                ["Referred Concerns", slip.services],
                ["Reason for Referral", slip.reason],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-1">
                  <dt className="text-xs font-medium text-neutral-600">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-ink-900">{value || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={onViewFullSlip}>View Full Referral Slip</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
