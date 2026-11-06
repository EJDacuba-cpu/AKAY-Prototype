import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import { SegmentedFilter } from "../../common";
import {
  ACTIVITY_PERIODS,
  formatChartTick,
  formatChartTooltipDate,
  sliceActivitySeries,
} from "../../../utils/bhcDashboard";
import { cn } from "../../../lib/utils";

// Fixed px height — Recharts 3 ResponsiveContainer renders null when measured height <= 0.
const CHART_FRAME = "h-[220px] w-full";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CHART_CONFIG = {
  count: { label: "Visits", color: "var(--color-ink-700)" },
};

export default function PatientVisitActivityChart({ series = [], className }) {
  const [period, setPeriod] = useState("7");
  const data = useMemo(() => sliceActivitySeries(series, period), [series, period]);
  const animate = !usePrefersReducedMotion();
  const hasSeries = Array.isArray(data) && data.length > 0;

  return (
    <Card className={cn("clinical-activity-chart flex flex-col rounded-card shadow-card", className)}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>Patient Visit Activity</CardTitle>
          <CardDescription>Daily check-ins at this RHU.</CardDescription>
        </div>
        <SegmentedFilter
          label="Chart period"
          value={period}
          onChange={setPeriod}
          options={ACTIVITY_PERIODS}
        />
      </CardHeader>
      <CardContent>
        {hasSeries ? (
          <div className={CHART_FRAME}>
            <ChartContainer
              config={CHART_CONFIG}
              className="aspect-auto! h-full! w-full! justify-stretch"
            >
              <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={formatChartTick}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  domain={[0, (dataMax) => Math.max(1, Number(dataMax) || 0)]}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(value) => formatChartTooltipDate(value)}
                      formatter={(value) => `${value} visit${Number(value) === 1 ? "" : "s"}`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  fill="var(--color-count)"
                  fillOpacity={0.08}
                  strokeWidth={2}
                  isAnimationActive={animate}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <ChartEmpty />
        )}
      </CardContent>
    </Card>
  );
}

function ChartEmpty() {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", CHART_FRAME)}>
      <BarChart3 className="text-neutral-300" size={28} />
      <p className="text-sm font-medium text-neutral-600">Visit activity unavailable</p>
      <p className="text-xs text-neutral-500">No date series loaded for this facility yet.</p>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
