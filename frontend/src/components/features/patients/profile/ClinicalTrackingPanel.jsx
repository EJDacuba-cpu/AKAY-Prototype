import { useMemo, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";

import TbTrackingChart from "../../health-records/TbTrackingChart";
import { Card } from "../../../ui/card";
import { Button } from "../../../ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../../../ui/chart";
import { FieldList } from "./ProfileSection";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  TREND_WINDOW_ALL,
  TREND_WINDOW_OPTIONS,
  bloodPressureTrendPoints,
  fbsChartPoints,
  limitTrendPoints,
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

function ChartLegend({ items }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-600">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function TrendWindowControls({ value, onChange }) {
  return (
    <div role="group" aria-label="Chart history range" className="mb-3 flex flex-wrap gap-1">
      {TREND_WINDOW_OPTIONS.map((option) => (
        <Button
          key={String(option.value)}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`h-7 rounded-lg border px-2.5 text-[11px] ${
            value === option.value ? "border-neutral-500 bg-neutral-50 text-ink-900" : "border-neutral-200 bg-white text-neutral-600"
          }`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function TrendChart({ config, data, children, yUnit = "", labelFormatter, formatter }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full min-w-0">
      <LineChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
        <XAxis
          dataKey="dateLabel"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={18}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={yUnit ? 48 : 40}
          tickFormatter={(value) => (yUnit ? `${value}` : value)}
          label={yUnit ? { value: yUnit, angle: -90, position: "insideLeft", offset: 8, style: { fill: "#6b7280", fontSize: 11 } } : undefined}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={labelFormatter}
              formatter={formatter}
            />
          }
        />
        {children}
      </LineChart>
    </ChartContainer>
  );
}

function bpTooltipLabel(_label, payload) {
  const point = payload?.[0]?.payload;
  return point?.tooltipLabel || point?.dateLabel || _label || "";
}

function bpTooltipFormatter(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${value} mmHg`;
}

function fbsTooltipLabel(_label, payload) {
  const point = payload?.[0]?.payload;
  return point?.tooltipLabel || point?.dateLabel || _label || "";
}

function MeasurementChart({ entry, window }) {
  if (entry.key === "hypertension") {
    const points = limitTrendPoints(bloodPressureTrendPoints(entry.records), window);
    if (!points.length) {
      return <ChartEmpty title="No blood pressure history yet" detail="Saved systolic and diastolic readings will appear here. Visits without BP stay off the chart." />;
    }
    return (
      <div>
        <ChartLegend items={[
          { label: "Systolic", color: "var(--color-ink-700)" },
          { label: "Diastolic", color: "var(--color-brand-700, #B70011)" },
        ]} />
        <TrendChart config={BP_CONFIG} data={points} yUnit="mmHg" labelFormatter={bpTooltipLabel} formatter={bpTooltipFormatter}>
          <Line type="monotone" dataKey="systolic" name="Systolic" stroke="var(--color-systolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="var(--color-diastolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </TrendChart>
      </div>
    );
  }
  if (entry.key === "diabetes_mellitus") {
    const points = limitTrendPoints(fbsChartPoints(entry.records), window);
    if (!points.length) {
      return <ChartEmpty title="No FBS history yet" detail="Recorded fasting blood sugar values appear with their original units. Incompatible units are not combined." />;
    }
    const unit = points.at(-1)?.unit || "mg/dL";
    return (
      <div>
        <ChartLegend items={[{ label: `FBS (${unit})`, color: "var(--color-ink-700)" }]} />
        <TrendChart
          config={FBS_CONFIG}
          data={points}
          yUnit={unit}
          labelFormatter={fbsTooltipLabel}
          formatter={(value) => `${value} ${unit}`}
        >
          <Line type="monotone" dataKey="value" name="FBS" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </TrendChart>
      </div>
    );
  }
  if (entry.key === "tb") {
    const points = limitTrendPoints(tbAdherenceTrendPoints(entry.records), window);
    const latest = (entry.records || []).at(-1);
    return (
      <div className="flex flex-col gap-4">
        {points.length ? (
          <div>
            <ChartLegend items={[{ label: "Adherence %", color: "var(--color-ink-700)" }]} />
            <TrendChart config={TB_CONFIG} data={points} yUnit="%">
              <Line type="monotone" dataKey="adherencePercent" stroke="var(--color-adherencePercent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </TrendChart>
          </div>
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

function nextVisitDisplay(value) {
  if (!value) return "Not scheduled";
  return formatShortDate(value) || "Not scheduled";
}

export default function ClinicalTrackingPanel({ entry, onViewRecords, onViewRecord }) {
  const [window, setWindow] = useState(TREND_WINDOW_ALL);
  const history = useMemo(() => [...(entry.records || [])].reverse(), [entry.records]);
  const showTrendWindow = entry.key === "hypertension" || entry.key === "diabetes_mellitus" || entry.key === "tb";

  return (
    <Card className="rounded-lg border-neutral-200 bg-white p-5 shadow-none">
      <h3 className="text-sm font-bold text-[#0B1C30]">{entry.label} Tracking</h3>
      <p className="mt-1 text-xs text-neutral-500">{entry.status} · read-only clinical history</p>
      <div className="mt-4 max-w-xl">
        <FieldList rows={[
          ...entry.facts.map((fact) => [fact.label, fact.type === "date" ? formatShortDate(fact.value) : fact.value]),
          ["Last visit", entry.lastVisit ? formatShortDate(entry.lastVisit) : ""],
          ["Next visit", nextVisitDisplay(entry.nextVisit)],
        ]} />
      </div>
      <div className="mt-4 min-w-0">
        {showTrendWindow ? <TrendWindowControls value={window} onChange={setWindow} /> : null}
        <MeasurementChart entry={entry} window={window} />
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Consultation history</h4>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No saved health records for this tracking card yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 border border-neutral-200">
            {history.map((record, index) => (
              <li key={record.id ?? `visit-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
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
