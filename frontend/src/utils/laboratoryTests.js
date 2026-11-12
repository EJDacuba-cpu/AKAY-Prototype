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

/** Prefer examination date, then collection date, then created-at — not last-updated alone. */
export function laboratoryClinicalDate(entry = {}) {
  return String(entry.examinationDate || entry.collectionDate || entry.createdAt || "").slice(0, 10);
}

/** Deterministic newest-relevant-first ordering for Supporting Laboratory Tests. */
export function sortLaboratoryOptionsByRelevance(options = []) {
  return [...(options || [])].sort((a, b) => {
    const dateA = laboratoryClinicalDate(a);
    const dateB = laboratoryClinicalDate(b);
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    }
    const currentA = String(a.reference || "").startsWith("current:") ? 0 : 1;
    const currentB = String(b.reference || "").startsWith("current:") ? 0 : 1;
    if (currentA !== currentB) return currentA - currentB;
    return String(b.reference || "").localeCompare(String(a.reference || ""));
  });
}

/** Newest-first ordering for patient-wide Laboratory & Diagnostic Tests. */
export function sortPatientLaboratoryTests(entries = []) {
  return [...(entries || [])].sort((a, b) => {
    const dateA = laboratoryClinicalDate(a);
    const dateB = laboratoryClinicalDate(b);
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    }
    const visitA = String(a.visitDate || a.dateRecorded || "").slice(0, 10);
    const visitB = String(b.visitDate || b.dateRecorded || "").slice(0, 10);
    if (visitA !== visitB) {
      if (!visitA) return 1;
      if (!visitB) return -1;
      return visitB.localeCompare(visitA);
    }
    return Number(b.recordId || 0) - Number(a.recordId || 0);
  });
}

export function filterPatientLaboratoryTests(entries = [], { status = "All", search = "" } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return (entries || []).filter((entry) => {
    if (status !== "All" && String(entry.resultStatus || "") !== status) return false;
    if (!needle) return true;
    return String(entry.testName || "").toLowerCase().includes(needle);
  });
}

/** Clinical diagnosis↔lab links only — never BHC sharing confirmation payload. */
export function normalizeSupportingLaboratoryTests(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((item) => String(item?.reference || "").trim())
    .filter((reference) => {
      if (!reference || seen.has(reference)) return false;
      seen.add(reference);
      return /^(current:[0-9a-f-]{36}|record:\d+)$/i.test(reference);
    })
    .slice(0, 50)
    .map((reference) => ({ reference }));
}

export function supportingLaboratorySummary(options = [], selected = []) {
  const byRef = new Map((options || []).map((entry) => [entry.reference, entry]));
  return normalizeSupportingLaboratoryTests(selected)
    .map((item) => byRef.get(item.reference))
    .filter(Boolean)
    .map((entry) => [entry.testName || "Unnamed test", entry.resultStatus].filter(Boolean).join(" · "));
}
