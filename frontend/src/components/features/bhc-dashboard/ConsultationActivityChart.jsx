import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import { SegmentedFilter } from "../../common";
import {
  ACTIVITY_PERIODS,
  chartHasValues,
  formatChartTick,
  formatChartTooltipDate,
  sliceActivitySeries,
} from "../../../utils/bhcDashboard";
import { cn } from "../../../lib/utils";

const CHART_HEIGHT = "h-[180px] min-h-[180px] flex-1";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CHART_CONFIG = {
  count: { label: "Consultations", color: "var(--color-ink-700)" },
};

export default function ConsultationActivityChart({ series = [], className }) {
  const [period, setPeriod] = useState("7");
  const data = useMemo(() => sliceActivitySeries(series, period), [series, period]);
  const animate = !usePrefersReducedMotion();
  const gradientId = `consult-fill-${useId().replace(/:/g, "")}`;

  return (
    <Card className={cn("bhc-consultation-chart flex flex-col rounded-card shadow-card", className)}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>Consultation Activity</CardTitle>
          <CardDescription>Daily encounters at this facility.</CardDescription>
        </div>
        <SegmentedFilter
          label="Chart period"
          value={period}
          onChange={setPeriod}
          options={ACTIVITY_PERIODS}
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {chartHasValues(data) ? (
          <ChartContainer config={CHART_CONFIG} className={cn("aspect-auto w-full", CHART_HEIGHT)}>
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--dashboard-chart-start, var(--color-count))" />
                  <stop offset="100%" stopColor="var(--dashboard-chart-end, var(--color-count))" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={formatChartTick}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => formatChartTooltipDate(value)}
                    formatter={(value) => `${value} encounter${Number(value) === 1 ? "" : "s"}`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={`url(#${gradientId}-line)`}
                fill="none"
                strokeWidth={2}
                isAnimationActive={animate}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartEmpty />
        )}
      </CardContent>
    </Card>
  );
}

function ChartEmpty() {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", CHART_HEIGHT)}>
      <BarChart3 className="text-neutral-300" size={28} />
      <p className="text-sm font-medium text-neutral-600">No consultations in this period</p>
      <p className="text-xs text-neutral-500">Counts stay at zero until visits are saved.</p>
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
