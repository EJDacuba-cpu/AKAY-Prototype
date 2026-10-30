import { useId } from "react";
import { formatDisplayValue, formatFacilityName } from "../../../../utils/formatters";

export default function ReferralReturnSlipSection({ referral = {}, pendingMessage = "Awaiting RHU feedback. The return slip will appear here once submitted." }) {
  const titleId = useId();
  const feedback = referral.feedback || referral.returnSlip;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 id={titleId} className="text-sm font-semibold text-ink-900">RHU Return Slip</h2>
      {!feedback ? (
        <p className="mt-2 text-sm text-neutral-600">{pendingMessage}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="RHU Findings" value={feedback.rhu_diagnosis || feedback.rhuDiagnosis} />
            <Detail label="Actions Taken" value={feedback.action_taken || feedback.actionsTaken || feedback.actionTaken} />
            {(feedback.treatment_notes || feedback.treatmentNotes) && <Detail label="Treatment / Management Notes" value={feedback.treatment_notes || feedback.treatmentNotes} />}
            <Detail label="Care Recommendations" value={feedback.recommendation} />
            <Detail label="Follow-up Instructions / Remarks" value={feedback.remarks} />
            {feedback.assessmentOutcome && <Detail label="Assessment Outcome" value={feedback.assessmentOutcome} />}
            {feedback.followUpDate && <Detail label="Follow-up Date" value={formatDate(feedback.followUpDate)} />}
          </dl>
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-neutral-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Receiving Personnel" value={feedback.receiving_practitioner || feedback.receivingPractitioner || feedback.receivingPersonnel} />
            <Detail label="Receiving Facility" value={feedback.receivingFacility || getDestinationFacility(referral)} />
            <Detail label="Received" value={feedback.received_at ? formatDateTime(feedback.received_at) : [feedback.dateOfReceipt, feedback.timeOfReceipt].filter(Boolean).join(" ")} />
            <Detail label="Submitted At" value={formatDateTime(feedback.created_at || feedback.submittedAt)} />
            {feedback.submittedBy && <Detail label="Submitted By" value={feedback.submittedBy} />}
          </dl>
        </>
      )}
    </section>
  );
}

function Detail({ label, value, empty = "Not recorded", children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-neutral-600">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">{formatDisplayValue(value, empty)}{children}</dd>
    </div>
  );
}

function getDestinationFacility(referral = {}) {
  return formatFacilityName(
    referral.destinationFacility ||
      referral.referredFacility ||
      referral.receivingFacility ||
      referral.rural_health_unit ||
      referral.ruralHealthUnit,
    "",
  );
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  return `${formatDate(value)} ${formatTime(value)}`;
}
