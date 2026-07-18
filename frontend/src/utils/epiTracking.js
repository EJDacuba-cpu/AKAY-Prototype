import {
  EPI_VACCINE_ROWS,
  getEpiVaccineEntries,
  getRecordDateValue,
  getRecordId,
  isEpiRecord,
  normalizeVaccineName,
} from "./healthRecordPrograms";

export const REQUIRED_EPI_ITEMS = [
  { code: "NEWBORN_SCREENING", label: "Newborn Screening" },
  { code: "BCG", label: "BCG" },
  { code: "HEPA_B", label: "HEPA B" },
  { code: "OPV_1", label: "OPV 1" },
  { code: "OPV_2", label: "OPV 2" },
  { code: "OPV_3", label: "OPV 3" },
  { code: "PENTA_1", label: "PENTA 1" },
  { code: "PENTA_2", label: "PENTA 2" },
  { code: "PENTA_3", label: "PENTA 3" },
  { code: "PCV_1", label: "PCV 1" },
  { code: "PCV_2", label: "PCV 2" },
  { code: "PCV_3", label: "PCV 3" },
  { code: "IPV_1", label: "IPV 1" },
  { code: "IPV_2", label: "IPV 2" },
  { code: "MCV_1", label: "MCV 1" },
  { code: "MCV_2", label: "MCV 2" },
];

const LABEL_TO_CODE = new Map(
  REQUIRED_EPI_ITEMS.map((item) => [normalizeVaccineName(item.label), item.code]),
);
const CODE_TO_ITEM = new Map(REQUIRED_EPI_ITEMS.map((item) => [item.code, item]));

export function getEpiCode(value = "") {
  const normalized = normalizeVaccineName(value).replace(/[_-]+/g, " ");
  if (LABEL_TO_CODE.has(normalized)) return LABEL_TO_CODE.get(normalized);
  const codeLike = normalized.replace(/\s+/g, "_");
  return CODE_TO_ITEM.has(codeLike) ? codeLike : "";
}

export function getEpiLabel(codeOrLabel = "") {
  const code = getEpiCode(codeOrLabel) || String(codeOrLabel || "");
  return CODE_TO_ITEM.get(code)?.label || codeOrLabel || "";
}

export function formatEpiDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRecordTime(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

export function compileEpiHistory(records = [], { excludeRecordId = "" } = {}) {
  const historyByCode = new Map();
  const excludedId = String(excludeRecordId || "");

  records
    .filter(isEpiRecord)
    .filter((record) => !excludedId || String(getRecordId(record)) !== excludedId)
    .flatMap((record) =>
      getEpiVaccineEntries(record).map((entry) => ({
        ...entry,
        code: getEpiCode(entry.vaccineName),
        dateGiven: entry.dateGiven || getRecordDateValue(record),
        record,
      })),
    )
    .filter((entry) => entry.code)
    .sort((a, b) => getRecordTime(a.dateGiven) - getRecordTime(b.dateGiven))
    .forEach((entry) => {
      if (!historyByCode.has(entry.code)) historyByCode.set(entry.code, entry);
    });

  return historyByCode;
}

export function getSelectedEpiCodes(entries = []) {
  return new Set(
    entries
      .map((entry) => getEpiCode(entry?.vaccineName || entry))
      .filter(Boolean),
  );
}

export function getRemainingEpiItems(completedCodes = new Set()) {
  return REQUIRED_EPI_ITEMS.filter((item) => !completedCodes.has(item.code));
}

export function getEpiCompletionState(historyByCode, selectedEntries = []) {
  const alreadyGivenCodes = new Set(historyByCode.keys());
  const selectedCodes = getSelectedEpiCodes(selectedEntries);
  const completedCodes = new Set([...alreadyGivenCodes, ...selectedCodes]);
  const remainingItems = getRemainingEpiItems(completedCodes);

  return {
    alreadyGivenCodes,
    selectedCodes,
    completedCodes,
    remainingItems,
    completeAfterSave: remainingItems.length === 0,
  };
}

export function getRequiredEpiLabels() {
  return EPI_VACCINE_ROWS;
}
