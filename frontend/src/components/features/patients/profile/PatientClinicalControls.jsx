import { useState } from "react";
import { HeartPulse, Pill, ShieldAlert } from "lucide-react";

import { Button } from "../../../ui/button";
import MedicalConditionsGroups from "../MedicalConditionsGroups";
import ProfileFactPopover from "./ProfileFactPopover";
import { summarizeAllergies } from "../../../../utils/patientHistory";
import { summarizeMedicines } from "../../../../utils/medicationSummary";
import { evenSpreadArc } from "../../../../utils/arcPlacement";
import { formatShortDate } from "../../../../utils/patientProfile";

function MedicinesGiven({ records, isLoading, isError, onViewRecord }) {
  const [showHistory, setShowHistory] = useState(false);
  const summary = summarizeMedicines(records);
  if (isLoading && summary.count === 0) return <p role="status" className="text-sm text-neutral-500">Loading medicines...</p>;
  if (isError && summary.count === 0) return <p role="alert" className="text-sm text-neutral-600">Medicines could not be loaded. Please try refreshing the page.</p>;
  if (summary.count === 0) return <p className="text-sm text-neutral-500">No medicines recorded.</p>;

  const visits = showHistory ? summary.visits : summary.visits.slice(0, 1);
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-neutral-500">Medicines given during recorded visits. Current use has not been confirmed.</p>
      {isError && <p role="alert" className="text-xs text-warning-700">Could not refresh medicines. Showing previously loaded records.</p>}
      {visits.map((visit) => (
        <section key={visit.recordId} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-sans! text-xs font-semibold tabular-nums text-neutral-600">{formatShortDate(visit.date, "Date not recorded")}</h4>
            {visit.recordId && onViewRecord && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onViewRecord(visit.recordId)}>
                View record
              </Button>
            )}
          </div>
          <ul className="divide-y divide-neutral-100">
            {visit.items.map((item) => (
              <li key={item.id} className="py-2 first:pt-0">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 break-words font-medium">{item.name}</span>
                  {item.amount && <span className="shrink-0 tabular-nums text-neutral-500">{item.amount}</span>}
                </div>
                {item.remarks && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-600">{item.remarks}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {summary.visits.length > 1 && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>
          {showHistory ? "Show most recent visit" : `View history (${summary.visits.length} visits)`}
        </Button>
      )}
    </div>
  );
}

// Outer arc around the figure: conditions above the chest line, medicines below.
const ARC_KEYS = ["conditions", "allergies", "medicines"];
const ARC_POSITIONS = evenSpreadArc(3, { minAngle: -22, maxAngle: 22, offsetRem: 3.5 });

/**
 * Read-only clinical facts. Dispensing history never implies ongoing medicine
 * use. With `arc` the three controls curve around the left of the body figure
 * (inside its frame); without it they sit in a row.
 */
export default function PatientClinicalControls({ background, conditions, records, recordsLoading, recordsError, openFact, onFactChange, onViewRecord, arc = false, rail = false }) {
  const groups = conditions?.groups;
  const conditionCount = (groups?.confirmed?.length || 0) + (groups?.legacyPending?.length || 0) + (groups?.underEvaluation?.length || 0);
  const allergies = summarizeAllergies(background?.allergies);
  const hasAllergy = allergies.status === "recorded";

  const place = (key) => (rail ? { placement: "rail", side: "left" } : arc ? { placement: "left", style: ARC_POSITIONS[ARC_KEYS.indexOf(key)] } : {});

  return (
    <div role="group" aria-label="Clinical details" className={arc || rail ? "contents" : "flex justify-center gap-5"}>
      <ProfileFactPopover label="Medical conditions" Icon={HeartPulse} count={conditionCount} open={openFact === "conditions"} onOpenChange={(open) => onFactChange(open ? "conditions" : null)} {...place("conditions")}>
        <MedicalConditionsGroups groups={groups} isLoading={conditions?.isLoading} isError={conditions?.isError} />
      </ProfileFactPopover>
      <ProfileFactPopover label="Allergies" Icon={ShieldAlert} warning={hasAllergy ? "Allergy recorded" : undefined} open={openFact === "allergies"} onOpenChange={(open) => onFactChange(open ? "allergies" : null)} {...place("allergies")}>
        <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${hasAllergy ? "font-medium text-alert-700" : "text-neutral-600"}`}>
          {allergies.status === "unrecorded" ? "Allergies not recorded" : allergies.text}
        </p>
      </ProfileFactPopover>
      <ProfileFactPopover label="Medicines given" Icon={Pill} open={openFact === "medicines"} onOpenChange={(open) => onFactChange(open ? "medicines" : null)} {...place("medicines")}>
        <MedicinesGiven records={records} isLoading={recordsLoading} isError={recordsError} onViewRecord={onViewRecord} />
      </ProfileFactPopover>
    </div>
  );
}
