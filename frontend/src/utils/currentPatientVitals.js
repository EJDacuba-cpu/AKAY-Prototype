const timeZone = "Asia/Manila";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const vitalFields = [
  "systolicBp", "diastolicBp", "temperature", "pulse", "spo2",
  "respiratoryRate", "weight", "height",
];

export function hasVitalValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function getVitalRecordDate(record = {}) {
  // Prefer the full timestamp: dateOfVisit may be a sliced UTC date from
  // the existing normalizer. Creation/update dates are not measurement dates.
  const raw = String(
    record.dateRecorded || record.date_recorded ||
    record.dateOfVisit || record.date_of_visit || "",
  ).trim();
  if (!raw) return null;

  let timestamp = raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    timestamp += `T${record.timeOfVisit || "00:00"}`;
  }
  // A date/time without an offset is a clinic-local calendar value.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) timestamp += "+08:00";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getCurrentVitalRecord(records = [], now = new Date()) {
  const today = dayFormatter.format(now);
  let latest = null;
  let latestTime = -Infinity;

  for (const record of records) {
    if (!record || !vitalFields.some((key) => hasVitalValue(record[key]))) continue;
    const date = getVitalRecordDate(record);
    if (!date || dayFormatter.format(date) !== today) continue;
    if (date.getTime() > latestTime) {
      latest = record;
      latestTime = date.getTime();
    }
  }

  return latest;
}
