import { ShieldAlert, ShieldCheck } from "lucide-react";

import { OverviewCard } from "./OverviewCard";
import { TextAction } from "./ProfileSection";
import VitalsTrendList from "./VitalsTrendList";
import { NO_ALLERGY_PATTERN } from "../PatientAlertChips";
import { summarizeBackground } from "../../../../utils/backgroundSummary";

function AllergyCard({ allergies }) {
  const text = String(allergies || "").trim();
  const recorded = text && !NO_ALLERGY_PATTERN.test(text);
  const Icon = recorded ? ShieldAlert : ShieldCheck;
  return (
    <OverviewCard id="overview-alerts" title="Alerts & Allergies">
      <p className={`flex items-start gap-1.5 text-[13px] leading-snug ${recorded ? "font-semibold text-red-700" : "text-slate-500"}`}>
        <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">
          {recorded ? `Allergy: ${text}` : text ? "No known allergies" : "Allergies not recorded"}
        </span>
      </p>
    </OverviewCard>
  );
}

/** Read-only background summary; editing happens on Patient Information. */
function BackgroundSummaryCard({ background, onEdit }) {
  return (
    <OverviewCard
      id="overview-background"
      title="Patient Background"
      action={<TextAction onClick={onEdit}>Edit →</TextAction>}
    >
      <dl className="space-y-0.5 text-xs">
        {summarizeBackground(background).map(({ key, label, text }) => (
          <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className={`m-0 line-clamp-2 min-w-0 break-words ${text ? "text-slate-900" : "text-slate-400"}`} title={text || undefined}>
              {text || "Not recorded"}
            </dd>
          </div>
        ))}
      </dl>
    </OverviewCard>
  );
}

/**
 * Left column of the Overview board: allergy alert, latest vitals with
 * trends, and the background summary. Identity and demographics live in
 * the profile header and Patient Information tab, not here.
 */
export default function OverviewSummaryColumn({ patient, records = [], recordsLoading = false, onEditBackground }) {
  return (
    <div className="space-y-1.5">
      <AllergyCard allergies={patient.medicalBackground?.allergies} />
      <VitalsTrendList records={records} isLoading={recordsLoading} />
      <BackgroundSummaryCard background={patient.medicalBackground} onEdit={onEditBackground} />
    </div>
  );
}
