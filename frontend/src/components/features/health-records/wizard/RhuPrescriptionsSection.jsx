import { OTHER, prescriptionOptions, selectionFor, editorDuration, changePrescriptionField } from "../../../../utils/prescriptionFields";
import { Button } from "../../../ui/button";
import {
  emptyPrescription,
  formatPrescriptionLine,
  normalizePrescriptions,
  prescriptionErrors,
  prescriptionsForDiagnosis,
  prescriptionsForServices,
  SERVICES_PRESCRIPTION_OWNER_ID,
} from "../../../../utils/rhuPrescriptions";

const MAX_PRESCRIPTIONS = 50;

const controlClass = "mt-1 min-h-9 w-full max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400 aria-invalid:border-red-700";

const TEXT_FIELDS = [
  ["medicineName", "Medicine Name", 255],
  ["strength", "Strength", 100],
  ["dose", "Dose", 100],
];

function fieldMessages(id, errors) {
  const prefix = `prescriptions.${id}.`;
  return Object.entries(errors)
    .filter(([key, message]) => key.startsWith(prefix) && message)
    .map(([key, message]) => ({ key, message }));
}

function RxField({ label, required, error, children, className = "" }) {
  return (
    <label className={`block min-w-0 text-xs font-medium text-neutral-700 ${className}`.trim()}>
      <span>{label}{required ? " *" : ""}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-red-700">{error}</span> : null}
    </label>
  );
}

function ChoiceField({ field, label, value, options, error, disabled, onChange, onSelect, custom = false, maxLength = 100 }) {
  const selection = custom || value === OTHER ? OTHER : selectionFor(value, options);
  return (
    <div className="min-w-0">
      <RxField label={label} required error={error}>
        <select name={field} data-field={field} aria-invalid={Boolean(error) || undefined} className={controlClass} disabled={disabled}
          value={selection} onChange={(event) => onSelect(event.target.value)}>
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
          <option value={OTHER}>Other (Specify)</option>
        </select>
      </RxField>
      {selection === OTHER ? <input aria-label={`Specify ${label.toLowerCase()}`} className={controlClass}
        value={value === OTHER ? "" : value} maxLength={maxLength} disabled={disabled}
        aria-invalid={Boolean(error) || undefined} placeholder={`Specify ${label.toLowerCase()}`}
        onChange={(event) => onChange(event.target.value || OTHER)} /> : null}
    </div>
  );
}

function PrescriptionEditor({
  draft,
  errors,
  disabled,
  onChange,
  onSave,
  onCancel,
}) {
  const key = `prescriptions.${draft.id}`;
  const errorFor = (field) => errors[`${key}.${field}`] || "";
  const duration = editorDuration(draft);
  return (
    <div
      className="rhu-prescription-editor grid min-w-0 gap-2 border border-neutral-200 bg-white p-3 sm:grid-cols-2"
      data-field={`${key}.medicineName`}
    >
      {errorFor("diagnosisIds") || errorFor("serviceKeys") ? (
        <p role="alert" className="text-xs text-red-700 sm:col-span-2">
          {errorFor("diagnosisIds") || errorFor("serviceKeys")}
        </p>
      ) : null}
      {TEXT_FIELDS.map(([field, label, maxLength]) => (
        <RxField key={field} label={label} required error={errorFor(field)}>
          <input
            name={`${key}.${field}`}
            data-field={`${key}.${field}`}
            value={draft[field] || ""}
            placeholder={field === "strength" ? "e.g., 500 mg" : field === "dose" ? "e.g., 1 tablet, 5 mL, or 250 mg" : "Generic medicine name"}
            maxLength={maxLength}
            disabled={disabled}
            aria-invalid={Boolean(errorFor(field)) || undefined}
            className={controlClass}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </RxField>
      ))}
      {[ ["route", "Route", 50], ["frequency", "Frequency", 100] ].map(([field, label, maxLength]) => (
        <ChoiceField key={field} field={`${key}.${field}`} label={label} value={draft[field] || ""}
          options={prescriptionOptions[field]} error={errorFor(field)} disabled={disabled} maxLength={maxLength}
          custom={draft.customFields?.includes(field)}
          onSelect={(value) => onChange(`${field}Selection`, value)}
          onChange={(value) => onChange(`${field}Custom`, value)} />
      ))}
      <RxField label="Duration Value" required error={errorFor("duration")}>
        <input type="number" min="0" step="any" className={controlClass} value={duration.value}
          disabled={disabled} name={`${key}.duration`} data-field={`${key}.duration`} aria-invalid={Boolean(errorFor("duration")) || undefined}
          onChange={(event) => onChange("durationValue", event.target.value)} />
      </RxField>
      <ChoiceField field={`${key}.durationUnit`} label="Duration Unit" value={duration.unit}
        options={prescriptionOptions.durationUnit} error={errorFor("duration")} disabled={disabled}
        maxLength={80} custom={draft.customFields?.includes("durationUnit")}
        onSelect={(value) => onChange("durationUnitSelection", value)}
        onChange={(value) => onChange("durationUnitCustom", value)} />
      {duration.legacy ? <p role="alert" className="text-xs text-amber-800 sm:col-span-2">
        Saved duration: {duration.legacy}. Please clarify the duration value and unit before saving this prescription.
      </p> : null}
      <RxField label="Additional Instructions" error={errorFor("instructions")} className="sm:col-span-2">
        <textarea
          name={`${key}.instructions`}
          data-field={`${key}.instructions`}
          value={draft.instructions || ""}
          maxLength={2000}
          rows={2}
          disabled={disabled}
          aria-invalid={Boolean(errorFor("instructions")) || undefined}
          className={controlClass}
          onChange={(event) => onChange("instructions", event.target.value)}
        />
      </RxField>
      <RxField label="Quantity to Dispense" required error={errorFor("authorizedQuantity")}>
        <input
          name={`${key}.authorizedQuantity`}
          data-field={`${key}.authorizedQuantity`}
          type="number" min="0" step="any" inputMode="decimal"
          value={draft.authorizedQuantity ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(errorFor("authorizedQuantity")) || undefined}
          className={controlClass}
          onChange={(event) => onChange("authorizedQuantity", event.target.value)}
        />
      </RxField>
      <ChoiceField field={`${key}.authorizedUnit`} label="Dispensing Unit" value={draft.authorizedUnit || ""}
        options={prescriptionOptions.authorizedUnit} error={errorFor("authorizedUnit")} disabled={disabled}
        maxLength={50} custom={draft.customFields?.includes("authorizedUnit")}
        onSelect={(value) => onChange("authorizedUnitSelection", value)}
        onChange={(value) => onChange("authorizedUnitCustom", value)} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" size="compact" disabled={disabled} className="rounded-none" onClick={onSave}>
          Save Prescription
        </Button>
        <Button type="button" variant="ghost" size="compact" disabled={disabled} className="rounded-none" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function commitPrescriptionDraft(prescriptions, draft, mode) {
  const next = emptyPrescription(draft);
  const latest = Array.isArray(prescriptions) ? prescriptions : [];
  const exists = latest.some((item) => item.id === next.id);
  if (mode === "edit" && !exists) return { cancelled: true, prescriptions: latest };
  if (!exists && latest.length >= MAX_PRESCRIPTIONS) return { cancelled: true, prescriptions: latest };
  const merged = exists
    ? latest.map((item) => (item.id === next.id ? next : item))
    : [...latest, next];
  return { cancelled: false, prescriptions: merged };
}

export default function RhuPrescriptionsSection({
  diagnosisId,
  serviceMode = false,
  selectedServiceKeys = [],
  diagnoses = [],
  prescriptions = [],
  onPrescriptionsChange,
  errors = {},
  disabled = false,
  editor = null,
  onEditorChange,
}) {
  const ownerId = serviceMode ? SERVICES_PRESCRIPTION_OWNER_ID : diagnosisId;
  const ownsEditor = editor?.ownerDiagnosisId === ownerId && Boolean(editor?.draft);
  const draft = ownsEditor ? editor.draft : null;
  const linked = serviceMode
    ? prescriptionsForServices(prescriptions)
    : prescriptionsForDiagnosis(prescriptions, diagnosisId);
  const shownErrors = ownsEditor ? { ...errors, ...(editor.localErrors || {}) } : errors;
  const atCap = prescriptions.length >= MAX_PRESCRIPTIONS;
  const helperText = serviceMode
    ? "Record the medicines for selected health services."
    : "Record the medicines for this diagnosis.";
  const emptyText = serviceMode
    ? "No prescriptions for selected health services."
    : "No prescriptions for this diagnosis.";

  function updateList(next) {
    onPrescriptionsChange?.(normalizePrescriptions(next));
  }

  function openEditor(next) {
    onEditorChange?.(next);
  }

  function startAdd() {
    if (disabled || Boolean(editor?.draft) || atCap) return;
    openEditor({
      draft: emptyPrescription({
        diagnosisIds: !serviceMode && diagnosisId ? [diagnosisId] : [],
        serviceKeys: serviceMode ? selectedServiceKeys : [],
      }),
      mode: "add",
      ownerDiagnosisId: ownerId,
      localErrors: {},
    });
  }

  function startEdit(rx) {
    if (disabled || Boolean(editor?.draft) || rx?.source === "tb_form4b_ref") return;
    openEditor({
      draft: emptyPrescription(rx),
      mode: "edit",
      ownerDiagnosisId: ownerId,
      localErrors: {},
    });
  }

  function cancel() {
    if (editor?.ownerDiagnosisId === ownerId) onEditorChange?.(null);
  }

  function save() {
    if (!ownsEditor) return;
    const next = emptyPrescription({
      ...draft,
      // Keep automatic link to this diagnosis card; preserve any historical multi-links.
      diagnosisIds: Array.isArray(draft.diagnosisIds) && draft.diagnosisIds.length
        ? draft.diagnosisIds
        : (!serviceMode && diagnosisId ? [diagnosisId] : []),
      serviceKeys: Array.isArray(draft.serviceKeys) && draft.serviceKeys.length
        ? draft.serviceKeys
        : (serviceMode ? selectedServiceKeys : []),
    });
    const found = prescriptionErrors([draft], diagnoses);
    const own = Object.fromEntries(
      Object.entries(found).filter(([key]) => key.startsWith(`prescriptions.${next.id}.`)),
    );
    if (Object.keys(own).length) {
      onEditorChange?.({ ...editor, draft, localErrors: own });
      return;
    }
    const result = commitPrescriptionDraft(prescriptions, next, editor.mode);
    if (!result.cancelled) updateList(result.prescriptions);
    onEditorChange?.(null);
  }

  function removePrescription(id) {
    updateList(prescriptions.filter((item) => item.id !== id));
    if (editor?.draft?.id === id) onEditorChange?.(null);
  }

  function changeDraft(field, value) {
    if (!ownsEditor) return;
    onEditorChange?.({ ...editor, draft: changePrescriptionField(editor.draft, field, value), localErrors: {} });
  }

  const editorNode = draft ? (
    <PrescriptionEditor
      draft={draft}
      errors={shownErrors}
      disabled={disabled}
      onChange={changeDraft}
      onSave={save}
      onCancel={cancel}
    />
  ) : null;

  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-2 border-t border-[#E5EEFF] pt-3"
      data-rx-editor-open={ownsEditor ? "true" : undefined}
    >
      <legend className="pt-1 text-xs font-semibold text-[#0B1C30]">Prescriptions</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#545F73]">{helperText}</p>
        <Button type="button" variant="secondary" size="compact" disabled={disabled || Boolean(editor?.draft) || atCap} className="rounded-none" onClick={startAdd}>
          Add Prescription
        </Button>
      </div>
      {errors.prescriptions ? <p role="alert" className="text-xs text-red-700">{errors.prescriptions}</p> : null}
      {!linked.length && !draft ? <p className="text-xs text-[#545F73]">{emptyText}</p> : null}
      <ul className="space-y-1">
        {linked.map((rx) => (
          rx.id === draft?.id ? (
            <li key={rx.id} className="min-w-0">
              {editorNode}
            </li>
          ) : (
            <li key={rx.id} className="min-w-0 space-y-1 py-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-xs text-[#0B1C30]">{formatPrescriptionLine(rx)}</p>
                <div className="flex gap-1">
                  {rx.source !== "tb_form4b_ref" ? (
                    <Button type="button" variant="ghost" size="compact" disabled={disabled || Boolean(editor?.draft)} className="rounded-none" onClick={() => startEdit(rx)}>
                      Edit Prescription
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="compact" disabled={disabled} className="rounded-none" onClick={() => removePrescription(rx.id)}>
                    Remove Prescription
                  </Button>
                </div>
              </div>
              {fieldMessages(rx.id, errors).map((item) => (
                <p key={item.key} role="alert" className="text-xs text-red-700">{item.message}</p>
              ))}
            </li>
          )
        ))}
      </ul>
      {draft && !linked.some((rx) => rx.id === draft.id) ? editorNode : null}
    </fieldset>
  );
}
