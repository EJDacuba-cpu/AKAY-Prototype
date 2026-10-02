import { Activity, HeartPulse } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { calculateBmi, formatBmi } from "../../../utils/bmi";
import {
  getCurrentVitalRecord,
  getVitalRecordDate,
  hasVitalValue,
} from "../../../utils/currentPatientVitals";

function measurement(value, unit) {
  return hasVitalValue(value) ? `${value} ${unit}` : "Not recorded";
}

export default function CurrentVitalSignsCard({ records = [], isLoading = false }) {
  const record = getCurrentVitalRecord(records);
  const bmi = record ? calculateBmi(record.weight, record.height) : null;
  const measurements = record ? [
    ["Blood pressure", hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp)
      ? `${hasVitalValue(record.systolicBp) ? record.systolicBp : "—"}/${hasVitalValue(record.diastolicBp) ? record.diastolicBp : "—"} mmHg`
      : "Not recorded"],
    ["Pulse rate", measurement(record.pulse, "bpm")],
    ["Temperature", measurement(record.temperature, "°C")],
    ["Oxygen saturation", measurement(record.spo2, "%")],
    ["Weight", measurement(record.weight, "kg")],
    ["Height", measurement(record.height, "cm")],
    ["BMI", bmi !== null && Number.isFinite(bmi) ? `${formatBmi(bmi)} kg/m²` : "Not recorded"],
    // Optional Additional Measurement: listed only when recorded.
    ...(hasVitalValue(record.fbs) ? [["FBS", measurement(record.fbs, "mg/dL")]] : []),
  ] : [];

  return (
    <Card className="bg-white rounded-none border border-gray-100 " aria-labelledby="current-vitals-title" aria-busy={isLoading}>
      <CardHeader>
        <CardTitle id="current-vitals-title" className="flex items-center gap-2">
          <HeartPulse size={16} className="shrink-0 text-gray-500" aria-hidden="true" />
          Current Vital Signs &amp; BMI
        </CardTitle>
        <p className="text-sm text-gray-500">Today’s measurements · Philippine time</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p role="status" className="py-6 text-center text-sm text-gray-500">Loading current vital signs...</p>
        ) : !record ? (
          <div className="flex flex-col items-center gap-3 rounded-none border border-gray-100 bg-white px-4 py-8 text-center ">
            <Activity size={24} className="text-gray-500" aria-hidden="true" />
            <p className="text-sm text-gray-500">No current vital signs recorded</p>
          </div>
        ) : (
          <>
            <dl className="divide-y divide-gray-200">
              {measurements.map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 first:pt-0">
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="m-0 text-sm font-semibold tabular-nums text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-500">
              Recorded {getVitalRecordDate(record).toLocaleString("en-PH", {
                timeZone: "Asia/Manila", month: "short", day: "numeric",
                year: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
