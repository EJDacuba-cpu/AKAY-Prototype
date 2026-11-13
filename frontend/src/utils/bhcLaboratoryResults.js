import { labTestLabel } from "./prenatalForm.js";

export const BHC_RESULT_STATUS = "Result Available";
export const MAX_BHC_LAB_RESULTS = 50;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function newBhcLaboratoryResult(examinationDate = "") {
  return {
    id: crypto.randomUUID(),
    testName: "",
    examinationDate,
    resultSource: "",
    result: "",
    remarks: "",
    resultStatus: BHC_RESULT_STATUS,
  };
}

export function restoreBhcLaboratoryTests(payload = {}) {
  const rows = Array.isArray(payload.laboratoryTests) ? payload.laboratoryTests : [];
  return rows.map((entry) => ({
    id: entry?.id || crypto.randomUUID(),
    testName: String(entry?.testName || ""),
    examinationDate: String(entry?.examinationDate || ""),
    resultSource: String(entry?.resultSource || ""),
    result: String(entry?.result || ""),
    remarks: String(entry?.remarks || ""),
    resultStatus: BHC_RESULT_STATUS,
  }));
}

function validDate(value, today) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return false;
  return value <= today;
}

export function bhcLaboratoryErrors(tests = [], { today = todayIso() } = {}) {
  const errors = {};
  const rows = Array.isArray(tests) ? tests : [];
  if (rows.length > MAX_BHC_LAB_RESULTS) {
    errors.laboratoryTests = `Record up to ${MAX_BHC_LAB_RESULTS} laboratory results.`;
  }
  rows.forEach((entry, index) => {
    const key = `laboratoryTests.${index}`;
    const testName = String(entry?.testName || "");
    if (!testName.trim()) errors[`${key}.testName`] = "Enter a test name.";
    else if (testName.length > 255) errors[`${key}.testName`] = "Use up to 255 characters.";
    const examinationDate = String(entry?.examinationDate || "");
    if (!examinationDate) errors[`${key}.examinationDate`] = "Enter the date performed.";
    else if (!validDate(examinationDate, today)) errors[`${key}.examinationDate`] = "Use a real date that is not in the future.";
    const resultSource = String(entry?.resultSource || "");
    if (!resultSource.trim()) errors[`${key}.resultSource`] = "Enter where this result came from.";
    else if (resultSource.length > 150) errors[`${key}.resultSource`] = "Use up to 150 characters.";
    const result = String(entry?.result || "");
    if (!result.trim()) errors[`${key}.result`] = "Enter the laboratory result.";
    else if (result.length > 10000) errors[`${key}.result`] = "Use up to 10,000 characters.";
    const remarks = String(entry?.remarks || "");
    if (remarks.length > 1000) errors[`${key}.remarks`] = "Use up to 1,000 characters.";
    if (entry?.resultStatus && entry.resultStatus !== BHC_RESULT_STATUS) {
      errors[`${key}.resultStatus`] = "BHC results are saved as Result Available.";
    }
  });
  return errors;
}

export function bhcLaboratorySummary(entry = {}) {
  return [
    entry.testName || "Unnamed test",
    BHC_RESULT_STATUS,
    entry.result || "",
    entry.examinationDate ? `Performed ${entry.examinationDate}` : "",
    entry.resultSource ? `Source ${entry.resultSource}` : "",
    entry.remarks ? `Remarks ${entry.remarks}` : "",
  ].filter(Boolean).join(" · ");
}

/** Unfinished BHC prenatal draft rows. They stay recoverable until moved or removed. */
export function legacyMaternalLaboratoryEntries(maternalData = {}) {
  const entries = Array.isArray(maternalData?.laboratoryEntries) ? maternalData.laboratoryEntries : [];
  return entries.flatMap((entry, index) => {
    const test = String(entry?.test || "").trim();
    const result = String(entry?.result || "").trim();
    const datePerformed = String(entry?.datePerformed || entry?.date || "").trim();
    if (!test && !result && !datePerformed) return [];
    return [{ index, test, testName: test ? labTestLabel(test) : "", result, datePerformed }];
  });
}

export function bhcResultFromLegacyEntry(entry, { resultSource, examinationDate = "" } = {}) {
  return {
    ...newBhcLaboratoryResult(entry?.datePerformed || examinationDate),
    testName: entry?.testName || labTestLabel(entry?.test || ""),
    result: entry?.result || "",
    resultSource: String(resultSource || ""),
  };
}
