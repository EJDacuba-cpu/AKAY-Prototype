import { createIdempotencyKey } from "./idempotency.js";

const REGIMEN_PHASES = Object.freeze(["intensive", "continuation", "individualized"]);

export const TB_REGIMEN_CODES = Object.freeze({
  standard_2hrze_4hr: "2hrze_4hr",
  standard_2hrze_10hr: "2hrze_10hr",
  other: "other",
});

export const TB_REGIMEN_CODE_OPTIONS = Object.freeze([
  { value: TB_REGIMEN_CODES.standard_2hrze_4hr, label: "Standard DS-TB regimen: 2HRZE/4HR" },
  { value: TB_REGIMEN_CODES.standard_2hrze_10hr, label: "Extended regimen: 2HRZE/10HR" },
  { value: TB_REGIMEN_CODES.other, label: "Other / Individualized Regimen" },
]);

export const TB_REGIMEN_PHASE_OPTIONS = Object.freeze([
  { value: "intensive", label: "Intensive Phase" },
  { value: "continuation", label: "Continuation Phase" },
  { value: "individualized", label: "Individualized / Single-Drug Regimen" },
]);

export const TB_EPTB_SITE_OPTIONS = Object.freeze([
  { value: "lymph_node", label: "Lymph node" },
  { value: "pleural", label: "Pleural" },
  { value: "bones_joints", label: "Bones/joints" },
  { value: "cns_meningitis", label: "CNS/meningitis" },
  { value: "genitourinary", label: "Genitourinary" },
  { value: "abdominal", label: "Abdominal" },
  { value: "other", label: "Other" },
]);

const EPTB_LABEL_BY_CODE = Object.fromEntries(TB_EPTB_SITE_OPTIONS.map((option) => [option.value, option.label]));
const EPTB_CODE_BY_LABEL = Object.fromEntries(
  TB_EPTB_SITE_OPTIONS
    .filter((option) => option.value !== "other")
    .map((option) => [option.label.toLowerCase(), option.value]),
);

const REGIMEN_LABEL_BY_CODE = Object.freeze({
  [TB_REGIMEN_CODES.standard_2hrze_4hr]: "2HRZE/4HR",
  [TB_REGIMEN_CODES.standard_2hrze_10hr]: "2HRZE/10HR",
});

export function withTbRegimenRows(regimen, rows) {
  return { ...regimen, rows };
}

export function isValidRegimenPhase(phase) {
  return REGIMEN_PHASES.includes(String(phase || "").trim());
}

export function isInvalidRegimenDescription(description) {
  const text = String(description || "").trim();
  if (!text) return true;
  return text.toLowerCase() === "none";
}

export function regimenDescriptionForCode(code, otherText = "") {
  if (code === TB_REGIMEN_CODES.standard_2hrze_4hr) return REGIMEN_LABEL_BY_CODE[code];
  if (code === TB_REGIMEN_CODES.standard_2hrze_10hr) return REGIMEN_LABEL_BY_CODE[code];
  return String(otherText || "").trim();
}

export function resolveRegimenCode(regimen = {}) {
  const code = String(regimen.code || "").trim();
  if (code === TB_REGIMEN_CODES.standard_2hrze_4hr
    || code === TB_REGIMEN_CODES.standard_2hrze_10hr
    || code === TB_REGIMEN_CODES.other) {
    return code;
  }
  const description = String(regimen.description || "").trim().toUpperCase().replace(/\s+/g, "");
  if (description === "2HRZE/4HR") return TB_REGIMEN_CODES.standard_2hrze_4hr;
  if (description === "2HRZE/10HR") return TB_REGIMEN_CODES.standard_2hrze_10hr;
  if (String(regimen.description || "").trim()) return TB_REGIMEN_CODES.other;
  return "";
}

export function formatExtrapulmonarySite(code, otherText = "") {
  const key = String(code || "").trim();
  if (!key) return "";
  if (key === "other" || key === "legacy") {
    const detail = String(otherText || "").trim();
    return detail ? (key === "legacy" ? detail : `Other: ${detail}`) : (key === "other" ? "Other:" : "");
  }
  return EPTB_LABEL_BY_CODE[key] || String(otherText || key).trim();
}

export function parseExtrapulmonarySite(value) {
  const raw = String(value || "").trim();
  if (!raw) return { code: "", otherText: "" };
  const otherMatch = /^other\s*:\s*(.*)$/i.exec(raw);
  if (otherMatch) return { code: "other", otherText: String(otherMatch[1] || "").trim() };
  const byLabel = EPTB_CODE_BY_LABEL[raw.toLowerCase()];
  if (byLabel) return { code: byLabel, otherText: "" };
  if (EPTB_LABEL_BY_CODE[raw]) return { code: raw, otherText: "" };
  return { code: "legacy", otherText: raw };
}

export function adultFdcDailyTablets(weightKg) {
  const weight = Number(weightKg);
  if (!Number.isFinite(weight)) return null;
  if (weight >= 25 && weight <= 37) return 2;
  if (weight >= 38 && weight <= 54) return 3;
  if (weight >= 55 && weight <= 70) return 4;
  if (weight > 70) return 5;
  return null;
}

export function canShowAdultFdcReference({ ageYears, weightKg, regimenCode } = {}) {
  if (!Number.isFinite(Number(ageYears)) || Number(ageYears) < 18) return false;
  if (regimenCode !== TB_REGIMEN_CODES.standard_2hrze_4hr && regimenCode !== TB_REGIMEN_CODES.standard_2hrze_10hr) {
    return false;
  }
  return adultFdcDailyTablets(weightKg) != null;
}

/** Shared idempotency helper used by monitoring, follow-up, endorsements, and DR referral. */
export function tbRegistrationAttempt(previous, sourceId, payload, createKey = createIdempotencyKey) {
  const fingerprint = JSON.stringify([String(sourceId), payload]);
  if (previous?.fingerprint === fingerprint) return previous;
  return { key: createKey(), sourceId, payload: structuredClone(payload), fingerprint };
}
