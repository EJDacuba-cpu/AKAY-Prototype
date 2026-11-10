import { Button } from "../../ui/button";
import TbTreatmentCardForm, { normalizeTbData } from "./TbTreatmentCardForm";
import { SCREENING_DATE_SOURCES } from "../../../utils/tbRegistration";

/**
 * Compact expandable Form 4B registration panel for RHU diagnosis cards.
 * Opening/editing never creates a case — only authorized consultation finalize does.
 */
export default function TbInlineForm4bPanel({
  registration,
  onChange,
  laboratoryTests = [],
  errors = {},
  disabled = false,
  facilityName = "",
  patientName = "",
  physicianName = "",
  diagnosisLabel = "TB Disease · Drug-susceptible",
  visitWeightKg = "",
  prescriptionText = "",
}) {
  if (!registration) return null;

  function patch(next) {
    onChange?.({ ...registration, ...next });
  }

  function patchCard(card) {
    patch({ card_data: card });
  }

  const labCount = (laboratoryTests || []).length;
  const screeningLabel = SCREENING_DATE_SOURCES[registration.screeningDateSource] || "Confirm screening date";
  const weightHint = registration.card_data?.regimen?.weightKg || visitWeightKg || "—";
  const prescriptionHint = String(registration.card_data?.regimen?.description || prescriptionText || "").trim() || "—";

  return (
    <div
      className="mt-3 space-y-3 rounded-[12px] border border-[var(--color-border,#E4E7EC)] bg-[var(--color-surface-sunk,#F1F3F6)] p-3"
      data-field="tbCaseRegistration"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text,#101828)]">Register Treatment · Form 4B</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary,#475467)]">
            Completes with consultation finalize. Cancel clears registration intent only.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          disabled={disabled}
          className="text-xs"
          onClick={() => onChange?.(null)}
        >
          Cancel registration
        </Button>
      </div>

      <div className="rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 py-2 text-xs text-[var(--color-text-secondary,#475467)]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand,#DC2626)]">
          Verified from this consultation
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Patient</dt>
            <dd>{patientName || "Current patient"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Diagnosing physician</dt>
            <dd>{physicianName || "RHU physician on finalize"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Diagnosing facility</dt>
            <dd>
              {registration.card_data?.caseFinding?.diagnosingFacility
                || facilityName
                || "RHU facility (confirmed on save)"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Source</dt>
            <dd>{registration.referralSourceLabel || "RHU walk-in"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">TB assessment</dt>
            <dd>{diagnosisLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Screening date</dt>
            <dd>
              {registration.card_data?.caseFinding?.dateOfScreening || "—"}
              <span className="ml-1 text-[var(--color-text-muted,#667085)]">({screeningLabel})</span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Visit weight</dt>
            <dd>{weightHint}{weightHint !== "—" ? " kg" : ""}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-text,#101828)]">Laboratory evidence</dt>
            <dd>{labCount ? `${labCount} linked test${labCount === 1 ? "" : "s"}` : "None linked yet"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-[var(--color-text,#101828)]">Visit prescription (reference)</dt>
            <dd className="whitespace-pre-wrap">{prescriptionHint}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--color-text,#101828)]">
          Reporting year
          <input
            type="number"
            min="1900"
            max="9999"
            disabled={disabled}
            className="mt-1 h-10 w-full rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 text-sm"
            value={registration.reporting_year || ""}
            onChange={(event) => patch({ reporting_year: Number(event.target.value) })}
          />
          {(errors.reporting_year || errors["tbCaseRegistration.reporting_year"]) && (
            <span role="alert" className="mt-1 block text-xs text-[var(--color-danger)]">
              {errors.reporting_year || errors["tbCaseRegistration.reporting_year"]}
            </span>
          )}
        </label>
        <label className="text-sm font-medium text-[var(--color-text,#101828)]">
          Case number <span className="font-normal text-[var(--color-text-muted,#667085)]">(optional)</span>
          <input
            disabled={disabled}
            className="mt-1 h-10 w-full rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 text-sm"
            maxLength={100}
            value={registration.case_number || ""}
            onChange={(event) => patch({ case_number: event.target.value })}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--color-text-secondary,#475467)]">
            Assigned on successful registration if left blank.
          </span>
        </label>
        <label className="text-sm font-medium text-[var(--color-text,#101828)] sm:col-span-2">
          Treatment start date
          <input
            type="date"
            required
            disabled={disabled}
            className="mt-1 h-10 w-full rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 text-sm"
            value={registration.treatment_start_date || ""}
            onChange={(event) => patch({ treatment_start_date: event.target.value })}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--color-text-secondary,#475467)]">
            Documented initiation date. Do not assume the consultation date.
          </span>
          {(errors.treatment_start_date || errors["tbCaseRegistration.treatment_start_date"]) && (
            <span role="alert" className="mt-1 block text-xs text-[var(--color-danger)]">
              {errors.treatment_start_date || errors["tbCaseRegistration.treatment_start_date"]}
            </span>
          )}
        </label>
      </div>

      <div className="rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 py-1">
        <TbTreatmentCardForm
          mode="compactRegistration"
          sections="required"
          laboratoryContext="rhu"
          laboratoryTests={laboratoryTests}
          value={normalizeTbData(registration.card_data)}
          errors={errors}
          disabled={disabled}
          onChange={patchCard}
        />
      </div>

      <details className="rounded-[8px] border border-[var(--color-border,#E4E7EC)] bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text,#101828)]">
          Additional Form 4B details
        </summary>
        <p className="mt-1 text-xs text-[var(--color-text-secondary,#475467)]">
          NTP extras, treatment supporter, and HIV/ART/CPT. Phase monitoring stays in case management after registration.
        </p>
        <div className="mt-2">
          <TbTreatmentCardForm
            mode="registration"
            sections="additional"
            laboratoryContext="rhu"
            laboratoryTests={laboratoryTests}
            value={normalizeTbData(registration.card_data)}
            errors={errors}
            disabled={disabled}
            onChange={patchCard}
          />
        </div>
      </details>

      <label className="flex items-start gap-2 text-sm text-[var(--color-text,#101828)]">
        <input
          type="checkbox"
          disabled={disabled}
          className="mt-1 accent-[var(--color-brand,#DC2626)]"
          checked={Boolean(registration.confirmed)}
          onChange={(event) => patch({ confirmed: event.target.checked })}
        />
        <span>
          I reviewed the diagnostic evidence and authorize this drug-susceptible TB treatment case and prescribed regimen.
        </span>
      </label>
      {(errors.confirmed || errors["tbCaseRegistration.confirmed"]) && (
        <span role="alert" className="block text-xs text-[var(--color-danger)]">
          {errors.confirmed || errors["tbCaseRegistration.confirmed"]}
        </span>
      )}
    </div>
  );
}
