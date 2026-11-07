import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
import FixedTable from "../../../common/tables/FixedTable";
import { formatBmi } from "../../../../utils/bmi";
import { calculateAgeInYears } from "../../../../utils/maternalRisk";
import { nutritionBmiCategory } from "../../../../utils/nutritionCare";
import { formatShortDate } from "../../../../utils/patientProfile";

function patientBirthDate(patient = {}) {
  return patient?.birthdate || patient?.birthDate || patient?.dateOfBirth || patient?.date_of_birth || "";
}

function displayAmount(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return String(value);
}

function displayBmi(row, birthdate) {
  if (row?.bmi === null || row?.bmi === undefined || row?.bmi === "") return "—";
  const number = Number(row.bmi);
  if (!Number.isFinite(number) || number <= 0) return "—";
  const age = birthdate ? calculateAgeInYears(birthdate, row.dateRecorded || new Date()) : null;
  const category = row.bmiCategory || (Number.isFinite(age) ? nutritionBmiCategory(number, age) : "");
  const value = formatBmi(number);
  return category ? `${value} ${category}` : value;
}

function historyRows(history) {
  return [...(Array.isArray(history) ? history : [])].sort((a, b) => {
    const byDate = String(a?.dateRecorded || "").localeCompare(String(b?.dateRecorded || ""));
    if (byDate !== 0) return byDate;
    return Number(a?.healthRecordId) - Number(b?.healthRecordId);
  });
}

/**
 * Measurement history for the open Nutrition Care card.
 * BMI category is the row's own category, or the adult WHO category when age is 18 or older.
 */
export default function NutritionTrackingPanel({ history = [], status = "", patient, onViewRecords }) {
  const rows = historyRows(history);
  const birthdate = patientBirthDate(patient);

  return (
    <section aria-labelledby="nutrition-tracking-title" className="border-t border-neutral-200 bg-[#FCFDFD] px-4 py-5 @lg:px-5">
      <div className="mb-4">
        <h3 id="nutrition-tracking-title" className="text-sm font-bold text-[#111827]">Nutrition Care Tracking</h3>
        <p className="mt-1 text-xs text-neutral-500">Current status: {status || "—"}</p>
      </div>

      <Card className="rounded-lg border-neutral-200 p-4 shadow-none">
        <h4 className="mb-3 text-sm font-bold text-[#111827]">Measurement History</h4>
        {rows.length === 0 ? (
          <p className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">No measurements recorded yet.</p>
        ) : (
          <div className="overflow-hidden border border-neutral-200 bg-white">
            <FixedTable minWidth="min-w-[520px]" lockHeight={false}>
              <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th scope="col" className="px-4">Consultation date</th>
                  <th scope="col" className="px-3">Weight (kg)</th>
                  <th scope="col" className="px-3">Height/Length (cm)</th>
                  <th scope="col" className="px-3">BMI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row) => (
                  <tr key={row.healthRecordId ?? row.dateRecorded} className="h-14">
                    <th scope="row" className="px-4 text-left text-[13px] font-semibold text-ink-800">
                      {row.dateRecorded ? formatShortDate(row.dateRecorded, "—") : "—"}
                    </th>
                    <td className="px-3 text-[13px] tabular-nums text-ink-800">{displayAmount(row.weightKg)}</td>
                    <td className="px-3 text-[13px] tabular-nums text-ink-800">{displayAmount(row.heightCm)}</td>
                    <td className="px-3 text-[13px] tabular-nums text-ink-800">{displayBmi(row, birthdate)}</td>
                  </tr>
                ))}
              </tbody>
            </FixedTable>
          </div>
        )}
      </Card>

      <Button type="button" variant="link" size="sm" onClick={onViewRecords} className="mt-3 h-auto rounded-lg p-0 text-xs">
        View nutrition health records
      </Button>
    </section>
  );
}
