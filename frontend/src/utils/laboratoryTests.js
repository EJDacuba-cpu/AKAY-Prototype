export const LABORATORY_STATUSES = ["Requested", "Awaiting Result", "Result Available"];

export function newLaboratoryTest() {
  return { id: crypto.randomUUID(), testName: "", collectionDate: "", examinationDate: "", resultStatus: "Requested", result: "" };
}

export function restoreLaboratoryTests(payload = {}) {
  return Array.isArray(payload.laboratoryTests) ? payload.laboratoryTests.map(entry => ({ ...entry })) : [];
}

export function laboratoryErrors(tests = []) {
  const errors = {};
  tests.forEach((entry, index) => {
    const key = `laboratoryTests.${index}`;
    if (!String(entry.testName || "").trim()) errors[`${key}.testName`] = "Enter a test name.";
    if (String(entry.testName || "").length > 255) errors[`${key}.testName`] = "Use up to 255 characters.";
    if (!LABORATORY_STATUSES.includes(entry.resultStatus)) errors[`${key}.resultStatus`] = "Choose a result status.";
    if (entry.resultStatus === "Result Available" && !String(entry.result || "").trim()) errors[`${key}.result`] = "Enter the laboratory result.";
    if (String(entry.result || "").length > 10000) errors[`${key}.result`] = "Use up to 10,000 characters.";
  });
  return errors;
}

export function laboratorySummary(entry, maxResultLength = Infinity) {
  const result = String(entry.result || "");
  const summary = result.length > maxResultLength ? `${result.slice(0, maxResultLength)}…` : result;
  return [entry.testName || "Unnamed test", entry.resultStatus, summary,
    entry.collectionDate ? `Collected ${entry.collectionDate}` : "",
    entry.examinationDate ? `Examined ${entry.examinationDate}` : ""].filter(Boolean).join(" · ");
}

export function evidenceOptions(current = [], historical = []) {
  return [
    ...current.map(entry => ({ ...entry, reference: `current:${entry.id}`, version: 0 })),
    ...historical.map(entry => ({ ...entry, reference: `record:${entry.recordId}` })),
  ];
}
