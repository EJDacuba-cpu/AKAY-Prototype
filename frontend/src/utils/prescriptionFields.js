export const OTHER = "__other__";
export const prescriptionOptions = {
  route: ["Oral", "Topical", "Intravenous (IV)", "Intramuscular (IM)", "Subcutaneous", "Inhalation", "Sublingual"],
  frequency: ["Once daily", "Twice daily", "Three times daily", "Four times daily", "Every 6 hours", "Every 8 hours", "Every 12 hours", "Once weekly", "As needed (PRN)"],
  durationUnit: ["Days", "Weeks", "Months"],
  authorizedUnit: ["Tablets", "Capsules", "Bottles", "Milliliters (mL)", "Vials", "Ampoules", "Sachets"],
};

// Effective clinical values remain unchanged; only incomplete editor state needs metadata.
export function selectionFor(value, options) {
  const text = String(value ?? "").trim();
  return options.find((option) => option.toLowerCase() === text.toLowerCase()) || (text ? OTHER : "");
}

export function durationFields(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return { value: "", unit: "", legacy: "" };
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match || Number(match[1]) <= 0) return { value: "", unit: "", legacy: raw };
  const unit = /^(days?|weeks?|months?)$/i.test(match[2])
    ? `${match[2].replace(/s$/i, "")}s`.toLowerCase()
    : match[2];
  return { value: match[1], unit, legacy: "" };
}

export function editorDuration(draft) {
  return draft.durationEditor || durationFields(draft.duration);
}

export function changePrescriptionField(draft, field, value) {
  if (field.endsWith("Selection") || field.endsWith("Custom")) {
    const custom = field.endsWith("Custom") || value === OTHER;
    const name = field.replace(/(?:Selection|Custom)$/, "");
    const customFields = (draft.customFields || []).filter((item) => item !== name);
    if (custom) customFields.push(name);
    return changePrescriptionField({ ...draft, customFields }, name, value);
  }
  if (field === "durationValue" || field === "durationUnit") {
    const parts = { ...editorDuration(draft), [field === "durationValue" ? "value" : "unit"]: value, legacy: "" };
    return { ...draft, durationEditor: parts, duration: `${parts.value} ${parts.unit === OTHER ? "" : parts.unit}`.trim() };
  }
  return { ...draft, [field]: value };
}

export function isCountableUnit(unit) {
  return /^(tablets?|capsules?|bottles?|vials?|ampoules?|sachets?)$/i.test(String(unit ?? "").trim());
}

export function prescriptionEditorForDraft(editor) {
  if (!editor?.draft) return null;
  return { mode: editor.mode, ownerDiagnosisId: editor.ownerDiagnosisId, draft: editor.draft };
}
