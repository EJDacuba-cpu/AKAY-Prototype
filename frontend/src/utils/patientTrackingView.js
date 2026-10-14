import { getConsultationPrograms } from "./consultationPrograms.js";
import { getRecordDateValue, isTbRecord } from "./healthRecordPrograms.js";

const LAB_TESTS = [
  ["Hemoglobin", ["hemoglobin"]],
  ["CBC", ["cbc"]],
  ["HBsAg", ["hbsag", "HBsAg", "hbsAg"]],
  ["Blood type", ["bloodType", "blood_type"]],
  ["HIV", ["hiv"]],
  ["Syphilis", ["syphilis"]],
  ["Urinalysis", ["urinalysis"]],
];

const text = (value) => String(value ?? "").trim();
const maternalOf = (record) => record.maternalData || record.maternal_data || {};

function firstValue(object = {}, keys = []) {
  for (const key of keys) {
    if (text(object?.[key])) return object[key];
  }
  return "";
}

function utcDay(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(text(value))?.[0];
  if (!day) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeOf(value) {
  return utcDay(value)?.getTime() ?? -Infinity;
}

function newestFirst(records = []) {
  return [...records].sort((a, b) =>
    timeOf(getRecordDateValue(b)) - timeOf(getRecordDateValue(a)) ||
    Number(b.id || 0) - Number(a.id || 0),
  );
}

function latestMaternalValue(records, keys) {
  for (const record of records) {
    const maternalValue = firstValue(maternalOf(record), keys);
    const value = text(maternalValue) !== "" ? maternalValue : firstValue(record, keys);
    if (text(value)) return value;
  }
  return "";
}

function doseDate(record, kind, dose) {
  const maternal = maternalOf(record);
  const sources = kind === "td"
    ? [maternal.tetanusDiphtheriaStatus, maternal.tetanus_diphtheria_status]
    : [maternal.tetanusToxoidStatus, maternal.tetanus_toxoid_status];
  const keys = [
    `${kind}${dose}`,
    `${kind}${dose}Date`,
    `${kind}${dose}_date`,
    `${kind}${dose}DateGiven`,
  ];
  for (const source of [...sources, maternal, record]) {
    const value = firstValue(source, keys);
    if (!value) continue;
    if ([true, "true", "yes", "given"].includes(value)) return getRecordDateValue(record);
    return value;
  }
  const visit = maternal.immunizationThisVisit || {};
  if (text(visit.type).toLowerCase() === kind && text(visit.doseStatus).toLowerCase() === `${kind}${dose}`) {
    return visit.dateGiven || getRecordDateValue(record);
  }
  return "";
}

/** Read-only facts from finalized Maternal consultations; no episode end is inferred. */
export function buildMaternalTracking(records = [], now = new Date()) {
  const ordered = newestFirst(records);
  const lmp = latestMaternalValue(ordered, ["lmp"]);
  const edd = latestMaternalValue(ordered, ["expectedDeliveryDate", "expected_delivery_date"]);
  const gravida = latestMaternalValue(ordered, ["gravida"]);
  const para = latestMaternalValue(ordered, ["para"]);
  const tpalParts = ["term", "preterm", "abortion", "living"]
    .map((key) => latestMaternalValue(ordered, [key]));
  const tpal = latestMaternalValue(ordered, ["tpal"]) ||
    (tpalParts.every((value) => text(value) !== "") ? tpalParts.join("-") : "");
  const lmpDay = utcDay(lmp);
  const eddDay = utcDay(edd);
  const today = utcDay(now instanceof Date
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : now);
  const elapsedDays = lmpDay && today ? Math.max(0, Math.floor((today - lmpDay) / 86_400_000)) : null;
  const pregnancyDays = lmpDay && eddDay && eddDay > lmpDay
    ? Math.round((eddDay - lmpDay) / 86_400_000)
    : null;

  const labs = LAB_TESTS.map(([label, keys]) => {
    const candidates = ordered.flatMap((record) => {
      const maternal = maternalOf(record);
      const value = firstValue(maternal.laboratoryResults || maternal.laboratory_results, keys);
      if (!text(value)) return [];
      const date = firstValue(maternal.laboratoryResultDates || maternal.laboratory_result_dates, keys) || getRecordDateValue(record);
      return [{ value: text(value), date }];
    });
    candidates.sort((a, b) => timeOf(b.date) - timeOf(a.date));
    return { label, value: candidates[0]?.value || "", date: candidates[0]?.date || "" };
  });

  const doses = [1, 2, 3, 4, 5].map((dose) => {
    const dates = { tt: "", td: "" };
    for (const kind of ["tt", "td"]) {
      const recorded = ordered.map((record) => doseDate(record, kind, dose)).filter(Boolean);
      recorded.sort((a, b) => timeOf(a) - timeOf(b));
      dates[kind] = recorded[0] || "";
    }
    return { dose, ...dates };
  });

  return {
    lmp,
    edd,
    gp: text(gravida) || text(para) ? `G${text(gravida) || "–"} P${text(para) || "–"}` : "",
    tpal,
    aog: elapsedDays === null ? latestMaternalValue(ordered, ["aog"]) : `${Math.floor(elapsedDays / 7)} weeks ${elapsedDays % 7} days`,
    progress: elapsedDays === null || !pregnancyDays ? null : Math.min(100, Math.round((elapsedDays / pregnancyDays) * 100)),
    progressLabel: elapsedDays === null || !pregnancyDays ? "" : `${Math.floor(elapsedDays / 7)}w ${elapsedDays % 7}d of ${Math.floor(pregnancyDays / 7)}w`,
    lastVisit: getRecordDateValue(ordered[0] || {}),
    labs,
    doses,
  };
}

const PROGRAM_LABELS = { Maternal: "Maternal Care", "Family Planning": "Family Planning", EPI: "EPI" };

/** Only persisted dispensation rows are shown; planned items are excluded. */
export function buildDispensedMedicineRows(records = []) {
  return newestFirst(records).flatMap((record) => {
    const medicines = record.dispensedMedicines || record.dispensed_medicines || [];
    const programs = getConsultationPrograms(record).map((key) => PROGRAM_LABELS[key] || key);
    if (isTbRecord(record)) programs.push("TB DOTS");
    const labels = programs.length ? [...new Set(programs)] : [text(record.category) || "General Consultation"];
    return medicines.filter(Boolean).map((item, index) => ({
      id: text(item.id) || `${text(record.id)}-${index}`,
      recordId: text(record.id),
      date: item.dateDispensed || item.created_at || getRecordDateValue(record),
      name: text(item.medicineName || item.medicine_name_snapshot || item.name),
      quantity: [text(item.quantity), text(item.unit)].filter(Boolean).join(" "),
      programs: labels,
      dispensedBy: text(item.dispensedByName || item.dispenser?.name),
    })).filter((item) => item.name);
  }).sort((a, b) => timeOf(b.date) - timeOf(a.date));
}
