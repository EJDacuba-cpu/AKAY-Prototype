import { useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "../../ui/chart";
import { cn } from "../../../lib/utils";

const CHART_HEIGHT = "h-[280px]";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export default function BhcReportCharts({ charts = [], className }) {
  const [primary, secondary] = charts;
  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-12", className)}>
      <ChartCard chart={primary} className="lg:col-span-8" />
      <ChartCard chart={secondary} className="lg:col-span-4" />
    </div>
  );
}

function ChartCard({ chart, className }) {
  const animate = !usePrefersReducedMotion();
  const gradientId = `fill-${useId().replace(/:/g, "")}`;
  if (!chart) return null;

  return (
    <Card className={cn("rounded-card shadow-card print:hidden", className)}>
      <CardHeader>
        <CardTitle>{chart.title}</CardTitle>
        <CardDescription>{chart.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasChartValues(chart) ? (
          <ChartContainer config={chart.config} className={cn("aspect-auto w-full", CHART_HEIGHT)}>
            {chart.kind === "bar" ? (
              <BarChart data={chart.data} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tickMargin={8} interval={0} tickFormatter={shortTick} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" periodLabel={chart.periodLabel} />} />
                <Bar
                  dataKey={chart.valueKey}
                  fill={`var(--color-${chart.valueKey})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={animate}
                />
              </BarChart>
            ) : chart.kind === "donut" ? (
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel periodLabel={chart.periodLabel} nameKey="key" />} />
                <Pie
                  data={chart.data}
                  dataKey={chart.valueKey}
                  nameKey="key"
                  innerRadius={62}
                  outerRadius={88}
                  strokeWidth={4}
                  paddingAngle={2}
                  isAnimationActive={animate}
                >
                  {chart.data.map((item) => (
                    <Cell key={item.key} fill={item.fill} stroke="var(--color-surface)" />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="key" />} />
              </PieChart>
            ) : (
              <AreaChart data={chart.data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${chart.valueKey})`} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={`var(--color-${chart.valueKey})`} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" periodLabel={chart.periodLabel} />} />
                <Area
                  type="monotone"
                  dataKey={chart.valueKey}
                  stroke={`var(--color-${chart.valueKey})`}
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                  isAnimationActive={animate}
                />
              </AreaChart>
            )}
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
      <p className="text-sm font-medium text-neutral-600">No data in this period</p>
      <p className="text-xs text-neutral-500">Counts stay at zero until matching records are saved.</p>
    </div>
  );
}

function hasChartValues(chart) {
  return Array.isArray(chart?.data) && chart.data.some((item) => Number(item[chart.valueKey]) > 0);
}

function shortTick(value) {
  const label = String(value || "");
  return label.length > 16 ? `${label.slice(0, 14)}…` : label;
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
