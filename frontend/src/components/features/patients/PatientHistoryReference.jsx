import { useId, useState } from "react";
import { History, Lock, PencilLine, X } from "lucide-react";

import { cn } from "../../../lib/utils";
import { historyReferenceSections } from "../../../utils/backgroundEditing";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { LegacyPendingConditions, REPORTED_LABEL } from "./MedicalConditionsGroups";
import { RhuConditions } from "./history/PastMedicalSection";

function ReferenceRows({ rows }) {
  return (
    <dl className="divide-y divide-neutral-100">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-0.5 py-1.5">
          <dt className="text-[11px] font-medium text-neutral-500">
            {row.key === "currentDiseases" ? REPORTED_LABEL : row.label}
          </dt>
          <dd className={cn("m-0 min-w-0 break-words text-[13px]", row.value ? "text-neutral-900" : "text-neutral-500")}>
            {row.value || "Not recorded"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RhuBlock({ conditions }) {
  if (conditions?.isLoading) {
    return <p role="status" className="text-[12.5px] text-neutral-500">Loading RHU-confirmed conditions...</p>;
  }
  if (conditions?.isError) {
    return (
      <p role="alert" className="text-[12.5px] text-alert-700">
        RHU-confirmed conditions could not be loaded right now.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <RhuConditions groups={conditions?.groups} />
      <LegacyPendingConditions rows={conditions?.groups?.legacyPending} />
    </div>
  );
}

/**
 * Patient History reference: a read-only, manually opened panel with the
 * patient's longitudinal history (Past Medical incl. locked RHU conditions,
 * Family Conditions, Smoking, Alcohol, Diet, Sexual History, Household
 * Environment, and Obstetric & Menstrual History when Section V is visible).
 * Demographics, Informant, Similar Illness, Education and Occupations are
 * never shown here.
 *
 * Non-modal: it stays open while the page behind it is used (clicks and focus
 * outside do not close it); only its Close button, Escape or the trigger
 * close it. It scrolls on its own and fits narrow screens.
 *
 * Props:
 * - `patient` - used only for Section V visibility (sex/age); no demographics.
 * - `background` - the normalized `patient.medicalBackground` (saved data only).
 * - `conditions` - usePatientConditionGroups(...) result ({ groups, isLoading, isError }).
 * - `onEditBackground` - optional; when given (only for users with
 *   clinical.background.update) an "Edit in Patient Background" button calls it.
 * - `loading` / `error` - optional; the background is still loading / failed
 *   to load, so the panel never shows an error as empty history.
 * - `align`, `triggerClassName` - optional placement / styling of the trigger.
 */
export default function PatientHistoryReference({
  patient,
  background,
  conditions,
  onEditBackground,
  loading = false,
  error = false,
  align = "end",
  triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const unavailable = !loading && (error || !background);
  const sections = historyReferenceSections(background, { patient });

  function editBackground() {
    setOpen(false);
    onEditBackground?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-[13px] font-medium text-neutral-700 shadow-xs transition hover:border-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 data-[state=open]:border-brand-300 data-[state=open]:bg-brand-50 data-[state=open]:text-brand-700",
            triggerClassName,
          )}
        >
          <History size={14} aria-hidden="true" />
          Patient History
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-labelledby={titleId}
        hideWhenDetached={false}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex w-[min(26rem,calc(100vw-2rem))] max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-0"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 border-l-2 border-l-brand-600 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-neutral-900 font-sans!">Patient History</h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">Read-only reference · saved Patient Background</p>
          </div>
          <PopoverClose
            aria-label="Close Patient History"
            className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
          >
            <X size={15} aria-hidden="true" />
          </PopoverClose>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-width:thin]">
          {loading ? (
            <p role="status" className="text-[13px] text-neutral-500">Loading patient history...</p>
          ) : unavailable ? (
            <p role="alert" className="text-[13px] text-alert-700">
              Patient history could not be loaded right now. This does not mean nothing is recorded.
            </p>
          ) : (
            <div className="space-y-4">
              {sections.map((section) => (
                <section key={section.key} aria-label={section.title}>
                  <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-600 font-sans!">
                    {section.title}
                  </h3>
                  {section.key === "medical" && (
                    <div className="mb-2">
                      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-neutral-500">
                        <Lock size={11} aria-hidden="true" />
                        RHU conditions
                      </p>
                      <RhuBlock conditions={conditions} />
                    </div>
                  )}
                  <ReferenceRows rows={section.rows} />
                </section>
              ))}
            </div>
          )}
        </div>

        {onEditBackground && (
          <footer className="shrink-0 border-t border-neutral-200 px-4 py-2.5">
            <button
              type="button"
              onClick={editBackground}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-ink-700 px-3 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-1"
            >
              <PencilLine size={13} aria-hidden="true" />
              Edit in Patient Background
            </button>
          </footer>
        )}
      </PopoverContent>
    </Popover>
  );
}
