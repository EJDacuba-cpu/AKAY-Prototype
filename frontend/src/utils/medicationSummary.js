import { getRecordDateValue } from "./healthRecordPrograms.js";

const text = (value) => String(value ?? "").trim();

function timeOf(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

/**
 * Medicines recorded as dispensed on a patient's visits, for the Overview's
 * Medications dropdown. Display only: this lists what a visit's record says
 * was given, not what the patient is taking now, and it carries no dose or
 * frequency because AKAY does not record them.
 *
 * @returns {{ count: number, visits: { recordId: string, date: string,
 *   items: { id: string, name: string, amount: string, remarks: string }[] }[] }}
 *   Visits are newest first; visits with no named medicine are left out.
 */
export function summarizeMedicines(records) {
  const visits = (Array.isArray(records) ? records : [])
    .filter(Boolean)
    .map((record) => {
      const rows = record.dispensedMedicines || record.dispensed_medicines;
      const items = (Array.isArray(rows) ? rows : [])
        .filter(Boolean)
        .map((row, index) => ({
          id: text(row.id) || `${text(record.id)}-${index}`,
          name: text(row.medicineName || row.medicine_name_snapshot || row.name),
          amount: [text(row.quantity), text(row.unit)].filter(Boolean).join(" "),
          remarks: text(row.remarks),
        }))
        .filter((item) => item.name);
      return { recordId: text(record.id), date: text(getRecordDateValue(record)), items };
    })
    .filter((visit) => visit.items.length > 0)
    .sort((a, b) => timeOf(b.date) - timeOf(a.date));

  return { count: visits.reduce((total, visit) => total + visit.items.length, 0), visits };
}
