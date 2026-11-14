import { getEpiCode, formatEpiDate } from "./epiTracking.js";
import { normalizeVaccineName } from "./healthRecordPrograms.js";

/** Services / indicators that are not infant vaccine doses. */
export const NON_VACCINE_TRACKING_LABELS = new Set([
  "NEWBORN SCREENING",
  "CPAB",
]);

const BIRTH_DOSE_FAMILIES = new Set(["BCG", "HEPA B"]);

/** When facility options are dose-less family names (typical RHU list). */
const FAMILY_DOSE_EXPANSIONS = {
  BCG: [{ value: "birth", label: "Birth dose", storedSuffix: "" }],
  "HEPA B": [{ value: "birth", label: "Birth dose", storedSuffix: "" }],
  "HEPATITIS B": [{ value: "birth", label: "Birth dose", storedSuffix: "" }],
  OPV: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
    { value: "3", label: "3", storedSuffix: " 3" },
  ],
  PENTA: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
    { value: "3", label: "3", storedSuffix: " 3" },
  ],
  PENTAVALENT: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
    { value: "3", label: "3", storedSuffix: " 3" },
  ],
  PCV: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
    { value: "3", label: "3", storedSuffix: " 3" },
  ],
  IPV: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
  ],
  MCV: [
    { value: "1", label: "1", storedSuffix: " 1" },
    { value: "2", label: "2", storedSuffix: " 2" },
  ],
  HPV: [{ value: "1", label: "1", storedSuffix: "" }],
};

const CPAB_EVIDENCE_SOURCES = [
  { value: "maternal_card", label: "Maternal vaccination card" },
  { value: "facility_record", label: "Verified facility record" },
  { value: "mother_reported", label: "Mother/guardian reported" },
  { value: "unknown", label: "Unknown" },
];

export const CPAB_STATUS_OPTIONS = [
  { value: "not_assessed", label: "Not assessed" },
  { value: "protected", label: "Protected at birth" },
  { value: "not_protected", label: "Not protected at birth" },
];

export { CPAB_EVIDENCE_SOURCES };

function isNonVaccineLabel(label) {
  return NON_VACCINE_TRACKING_LABELS.has(normalizeVaccineName(label));
}

function splitDoseLabel(label) {
  const raw = String(label || "").trim();
  const match = raw.match(/^(.*?)(?:\s+)(\d+)$/);
  if (!match) return null;
  return { family: match[1].trim(), dose: match[2] };
}

function familyKey(label) {
  return normalizeVaccineName(label).replace(/\s+\d+$/, "").trim();
}

function displayFamilyName(optionLabel, familyNorm) {
  if (familyNorm === "HEPA B" || familyNorm === "HEPATITIS B") {
    return String(optionLabel).replace(/\s+\d+$/, "").trim() || "Hepatitis B";
  }
  if (familyNorm === "PENTA" || familyNorm === "PENTAVALENT") {
    return String(optionLabel).match(/pentavalent/i) ? "Pentavalent" : "PENTA";
  }
  if (familyNorm === "MMR" || familyNorm === "MCV") {
    return String(optionLabel).match(/mmr/i) ? "MMR" : "MCV";
  }
  return String(optionLabel).replace(/\s+\d+$/, "").trim() || familyNorm;
}

function resolveStoredLabel(optionLabel, familyNorm, doseSpec) {
  const base = String(optionLabel).replace(/\s+\d+$/, "").trim() || familyNorm;
  // Canonical EPI codes for RHU family-only options so getEpiCode / TCL stay aligned.
  if (familyNorm === "PENTAVALENT" || familyNorm === "PENTA") {
    return doseSpec?.value && doseSpec.value !== "birth" ? `PENTA ${doseSpec.value}` : "PENTA";
  }
  if (familyNorm === "MMR" || familyNorm === "MCV") {
    return doseSpec?.value && doseSpec.value !== "birth" ? `MCV ${doseSpec.value}` : "MCV";
  }
  if (familyNorm === "OPV" || familyNorm === "PCV" || familyNorm === "IPV") {
    return doseSpec?.value && doseSpec.value !== "birth"
      ? `${familyNorm} ${doseSpec.value}`
      : familyNorm;
  }
  if (familyNorm === "HEPATITIS B" || familyNorm === "HEPA B") {
    return base;
  }
  if (!doseSpec || doseSpec.value === "birth" || !doseSpec.storedSuffix) {
    return base;
  }
  return `${base}${doseSpec.storedSuffix}`;
}

/**
 * Build Vaccine → Dose catalog from a facility's option list.
 * Preserves facility-specific stored labels when options already encode doses.
 */
export function buildVaccineDoseCatalog(vaccineOptions = []) {
  const families = new Map();

  for (const option of vaccineOptions || []) {
    const label = String(option || "").trim();
    if (!label || isNonVaccineLabel(label)) continue;

    const split = splitDoseLabel(label);
    const familyNorm = familyKey(label);
    const displayName = displayFamilyName(label, familyNorm);

    if (!families.has(familyNorm)) {
      families.set(familyNorm, {
        key: familyNorm,
        label: displayName,
        doses: [],
        sourceOptions: [],
      });
    }
    const family = families.get(familyNorm);
    family.sourceOptions.push(label);

    if (split) {
      const doseValue = split.dose;
      if (!family.doses.some((dose) => dose.value === doseValue)) {
        family.doses.push({
          value: doseValue,
          label: doseValue,
          storedLabel: label,
        });
      }
      continue;
    }

    if (BIRTH_DOSE_FAMILIES.has(familyNorm) || familyNorm === "HEPATITIS B") {
      if (!family.doses.some((dose) => dose.value === "birth")) {
        family.doses.push({
          value: "birth",
          label: "Birth dose",
          storedLabel: label,
        });
      }
      continue;
    }

    const expansion = FAMILY_DOSE_EXPANSIONS[familyNorm];
    if (expansion) {
      for (const spec of expansion) {
        if (family.doses.some((dose) => dose.value === spec.value)) continue;
        family.doses.push({
          value: spec.value,
          label: spec.label,
          storedLabel: resolveStoredLabel(label, familyNorm, spec),
        });
      }
      continue;
    }

    if (!family.doses.some((dose) => dose.value === "1")) {
      family.doses.push({
        value: "1",
        label: "1",
        storedLabel: label,
      });
    }
  }

  return [...families.values()].map((family) => ({
    ...family,
    doses: family.doses.sort((a, b) => {
      if (a.value === "birth") return -1;
      if (b.value === "birth") return 1;
      return String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
    }),
  }));
}

export function needsBirthDoseTime(storedLabel = "") {
  const code = getEpiCode(storedLabel);
  return code === "BCG" || code === "HEPA_B";
}

export function findDoseOption(catalog, familyKeyValue, doseValue) {
  const family = (catalog || []).find((item) => item.key === familyKeyValue);
  if (!family) return null;
  return family.doses.find((dose) => String(dose.value) === String(doseValue)) || null;
}

export function vaccineEntryConflicts({
  storedLabel,
  dateGiven,
  entries = [],
  historyByCode = null,
} = {}) {
  const code = getEpiCode(storedLabel);
  if (!code) return "Choose a supported vaccine and dose.";
  if (!String(dateGiven || "").trim()) return "Enter the date the vaccine was actually given.";

  if (historyByCode?.has?.(code)) {
    const prior = historyByCode.get(code);
    const when = formatEpiDate(prior?.dateGiven);
    return `Already recorded${when ? ` on ${when}` : ""}.`;
  }

  const duplicate = (entries || []).some(
    (entry) => getEpiCode(entry?.vaccineName) === code,
  );
  if (duplicate) return "This vaccine dose is already on this visit list.";
  return "";
}

export function emptyCpabAssessment() {
  return {
    status: "not_assessed",
    notes: "",
  };
}

export function emptyMaternalEvidenceRow() {
  return {
    id: `cpab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    vaccineType: "TT",
    dose: "1",
    dateAdministered: "",
    evidenceSource: "unknown",
  };
}
