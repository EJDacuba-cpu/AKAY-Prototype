import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../ui/card";

const VITAL_LABELS = ["BP", "Temperature", "Pulse", "Respiratory rate", "SpO2", "Weight", "Height"];

export default function RhuPreviousVitalsReference({ vitals = [], sendingBhc, recordedAt }) {
  const date = recordedAt ? new Date(recordedAt) : null;
  const recorded = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Not recorded";
  return (
    <Card className="ehr-consult__sheet">
      <CardHeader>
        <CardTitle>Previous BHC vital signs</CardTitle>
        <CardDescription>Source: {sendingBhc || "Not recorded"} · Recorded: {recorded}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {VITAL_LABELS.map((label) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium text-neutral-600">{label}</dt>
              <dd className="break-words text-sm tabular-nums text-ink-900">{vitals.find((vital) => vital.label === label)?.value || "Not recorded"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
