import { FieldError, FieldInput, FieldTextarea } from "../fields/ClinicalFields";
import { Button } from "../../../ui/button";
import {
  createServiceUsageId,
  deriveEpiUsagesFromVaccineEntries,
  manualProgramsAvailable,
} from "../../../../utils/serviceUsages";

const PROGRAM_LABELS = {
  EPI: "EPI",
  Maternal: "Maternal Care",
  "Family Planning": "Family Planning",
  Nutrition: "Nutrition",
};

/**
 * Read-only EPI administered references + optional manual usage rows for
 * Maternal / FP / Nutrition. Does not deduct inventory.
 */
export default function ServiceItemsUsedSection({
  selectedPrograms = [],
  vaccineEntries = [],
  serviceUsages = [],
  onServiceUsagesChange,
  errors = {},
  disabled = false,
}) {
  const epiSelected = selectedPrograms.includes("EPI");
  const epiRows = epiSelected ? deriveEpiUsagesFromVaccineEntries(vaccineEntries) : [];
  const manualPrograms = manualProgramsAvailable(selectedPrograms);
  const show = epiSelected || manualPrograms.length > 0;
  if (!show) return null;

  function updateRow(id, patch) {
    onServiceUsagesChange?.(
      serviceUsages.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(id) {
    onServiceUsagesChange?.(serviceUsages.filter((row) => row.id !== id));
  }

  function addRow() {
    const program = manualPrograms[0];
    if (!program || disabled) return;
    onServiceUsagesChange?.([
      ...serviceUsages,
      {
        id: createServiceUsageId(),
        serviceProgram: program,
        itemDescription: "",
        quantity: 1,
        unit: "",
        usedAt: "",
        note: "",
      },
    ]);
  }

  return (
    <div className="mt-4 space-y-3" data-testid="service-items-used">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Service items used
        </h3>
        <p className="mt-1 text-xs text-[#6B7280]">
          Items already administered or used during this visit. Inventory staff
          reconcile stock later in To Dispense — nothing is deducted here.
        </p>
      </div>

      {epiSelected && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-[#111827]">EPI</p>
          {epiRows.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              No administered vaccine with a date given yet. Add vaccines in EPI Vaccine Tracking.
            </p>
          ) : (
            <ul className="divide-y divide-[#E5E7EB] rounded-md border border-[#E5E7EB] bg-[#FAFAFA]">
              {epiRows.map((row) => (
                <li key={row.id} className="px-3 py-2 text-[13px] text-[#111827]">
                  <div className="font-medium">{row.itemDescription}</div>
                  <div className="mt-0.5 text-xs text-[#6B7280]">
                    Date given: {row.usedAt}
                    {row.note ? ` · ${row.note}` : ""}
                  </div>
                  <div className="mt-0.5 text-xs text-[#6B7280]">
                    Inventory reconciliation: Not yet recorded
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {manualPrograms.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-[#111827]">
              Other service items
            </p>
            <Button
              type="button"
              size="compact"
              variant="secondary"
              disabled={disabled}
              onClick={addRow}
            >
              Add service usage
            </Button>
          </div>
          {serviceUsages.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              Add an item only when a medicine or supply was actually used. Selecting a
              service alone does not create an inventory task.
            </p>
          ) : (
            <ul className="space-y-3">
              {serviceUsages.map((row) => {
                const prefix = `serviceUsages.${row.id}`;
                return (
                  <li
                    key={row.id}
                    className="space-y-2 rounded-md border border-[#E5E7EB] p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-[#374151]">
                        Source service
                        <select
                          className="mt-1 w-full rounded-md border border-[#D1D5DB] px-2 py-1.5 text-sm"
                          value={row.serviceProgram}
                          disabled={disabled}
                          onChange={(event) =>
                            updateRow(row.id, { serviceProgram: event.target.value })
                          }
                        >
                          {manualPrograms.map((program) => (
                            <option key={program} value={program}>
                              {PROGRAM_LABELS[program] || program}
                            </option>
                          ))}
                        </select>
                        <FieldError error={errors[`${prefix}.serviceProgram`]} />
                      </label>
                      <FieldInput
                        label="Item used"
                        name={`${prefix}.itemDescription`}
                        value={row.itemDescription}
                        error={errors[`${prefix}.itemDescription`]}
                        disabled={disabled}
                        onChange={(event) =>
                          updateRow(row.id, { itemDescription: event.target.value })
                        }
                      />
                      <FieldInput
                        label="Quantity"
                        name={`${prefix}.quantity`}
                        type="number"
                        min={1}
                        value={row.quantity}
                        error={errors[`${prefix}.quantity`]}
                        disabled={disabled}
                        onChange={(event) =>
                          updateRow(row.id, { quantity: event.target.value })
                        }
                      />
                      <FieldInput
                        label="Unit"
                        name={`${prefix}.unit`}
                        value={row.unit}
                        error={errors[`${prefix}.unit`]}
                        disabled={disabled}
                        onChange={(event) => updateRow(row.id, { unit: event.target.value })}
                      />
                      <FieldInput
                        label="Date used"
                        name={`${prefix}.usedAt`}
                        type="date"
                        value={row.usedAt || ""}
                        error={errors[`${prefix}.usedAt`]}
                        disabled={disabled}
                        onChange={(event) => updateRow(row.id, { usedAt: event.target.value })}
                      />
                    </div>
                    <FieldTextarea
                      label="Note (optional)"
                      name={`${prefix}.note`}
                      rows={2}
                      value={row.note || ""}
                      error={errors[`${prefix}.note`]}
                      disabled={disabled}
                      onChange={(event) => updateRow(row.id, { note: event.target.value })}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[#6B7280]">
                        Inventory reconciliation: Not yet recorded
                      </p>
                      <Button
                        type="button"
                        size="compact"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => removeRow(row.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <FieldError error={errors.serviceUsages} />
        </div>
      )}
    </div>
  );
}
