import { Line, LineChart, XAxis, YAxis } from "recharts";

import TbTrackingChart from "../../health-records/TbTrackingChart";
import { Card } from "../../../ui/card";
import { Button } from "../../../ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../../../ui/chart";
import { FieldList } from "./ProfileSection";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  bloodPressureTrendPoints,
  fbsTrendPoints,
  tbAdherenceTrendPoints,
} from "../../../../utils/clinicalTrendSeries";

const BP_CONFIG = {
  systolic: { label: "Systolic", color: "var(--color-ink-700)" },
  diastolic: { label: "Diastolic", color: "var(--color-brand-700, #B70011)" },
};

const FBS_CONFIG = {
  value: { label: "FBS", color: "var(--color-ink-700)" },
};

const TB_CONFIG = {
  adherencePercent: { label: "Adherence %", color: "var(--color-ink-700)" },
};

function ChartEmpty({ title, detail }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-1 border border-dashed border-neutral-200 bg-white px-4 py-8 text-center">
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      <p className="text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function TrendChart({ config, data, children, yUnit = "" }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <LineChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
        <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={yUnit ? 48 : 40}
          tickFormatter={(value) => (yUnit ? `${value}` : value)}
          label={yUnit ? { value: yUnit, angle: -90, position: "insideLeft", offset: 8, style: { fill: "#6b7280", fontSize: 11 } } : undefined}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        {children}
      </LineChart>
    </ChartContainer>
  );
}

function MeasurementChart({ entry }) {
  if (entry.key === "hypertension") {
    const points = bloodPressureTrendPoints(entry.records);
    if (!points.length) {
      return <ChartEmpty title="No blood pressure history yet" detail="Saved systolic and diastolic readings will appear here. Missing visits are left blank." />;
    }
    return (
      <TrendChart config={BP_CONFIG} data={points} yUnit="mmHg">
        <Line type="monotone" dataKey="systolic" stroke="var(--color-systolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        <Line type="monotone" dataKey="diastolic" stroke="var(--color-diastolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </TrendChart>
    );
  }
  if (entry.key === "diabetes_mellitus") {
    const points = fbsTrendPoints(entry.records);
    if (!points.length) {
      return <ChartEmpty title="No FBS history yet" detail="Recorded fasting blood sugar values will appear here with their original units." />;
    }
    const unit = points.at(-1)?.unit || "mg/dL";
    return (
      <TrendChart config={FBS_CONFIG} data={points} yUnit={unit}>
        <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </TrendChart>
    );
  }
  if (entry.key === "tb") {
    const points = tbAdherenceTrendPoints(entry.records);
    const latest = (entry.records || []).at(-1);
    return (
      <div className="space-y-4">
        {points.length ? (
          <TrendChart config={TB_CONFIG} data={points} yUnit="%">
            <Line type="monotone" dataKey="adherencePercent" stroke="var(--color-adherencePercent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </TrendChart>
        ) : (
          <ChartEmpty title="No documented adherence trend yet" detail="Undocumented doses are not treated as missed, and missing percents are not shown as zero." />
        )}
        {latest?.tbData || latest?.tb_data ? (
          <TbTrackingChart
            tbData={latest.tbData || latest.tb_data}
            caseNumber={entry.facts?.find((fact) => fact.label === "Case No.")?.value || ""}
          />
        ) : null}
      </div>
    );
  }
  return null;
}

function visitLabel(record) {
  return formatShortDate(record.dateOfVisit || record.date_of_visit || record.dateRecorded || record.date_recorded) || "Visit";
}

export default function ClinicalTrackingPanel({ entry, onViewRecords, onViewRecord }) {
  const history = [...(entry.records || [])].reverse();
  return (
    <Card className="rounded-lg border-neutral-200 p-5 shadow-none">
      <h3 className="text-sm font-bold text-[#111827]">{entry.label} Tracking</h3>
      <p className="mt-1 text-xs text-neutral-500">{entry.status} · read-only clinical history</p>
      <div className="mt-4 max-w-xl">
        <FieldList rows={[
          ...entry.facts.map((fact) => [fact.label, fact.type === "date" ? formatShortDate(fact.value) : fact.value]),
          ["Last visit", entry.lastVisit ? formatShortDate(entry.lastVisit) : ""],
          ["Next visit", entry.nextVisit ? formatShortDate(entry.nextVisit) : ""],
        ]} />
      </div>
      <div className="mt-4">
        <MeasurementChart entry={entry} />
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Consultation history</h4>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No saved health records for this tracking card yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 border border-neutral-200">
            {history.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{visitLabel(record)}</span>
                {onViewRecord && record.id ? (
                  <Button type="button" variant="link" size="sm" onClick={() => onViewRecord(record.id)} className="h-auto p-0 text-xs">
                    Open record
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="button" variant="link" size="sm" onClick={() => onViewRecords?.(entry.key)} className="mt-4 h-auto rounded-lg p-0 text-xs">
        View health records
      </Button>
    </Card>
  );
}
