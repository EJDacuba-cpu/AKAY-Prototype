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
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../../ui/chart";
import { cn } from "../../../lib/utils";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * RHU Reports Overview bento grid. Cards and charts come from buildRhuReport overview.
 * Non-overview categories keep the standard stacked report layout.
 */
export default function RhuOverviewBento({ report, periodLabel, className }) {
  const cards = Array.isArray(report?.cards) ? report.cards : [];
  const bento = report?.bento || {};
  const visitsCard = cards.find((item) => item.key === "total_visits");
  const consultationsCard = cards.find((item) => item.key === "completed_consultations");
  const referralsCard = cards.find((item) => item.key === "total_referrals");
  const diagnosesCard = cards.find((item) => item.key === "recorded_diagnoses");

  return (
    <div className={cn("no-print flex flex-col gap-3", className)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:grid-rows-[auto_auto]">
        <div className="flex flex-col gap-3 md:col-span-3">
          <KpiCard item={visitsCard} className="flex-1" />
          <KpiCard item={consultationsCard} className="flex-1" />
        </div>

        <BentoChartCard
          chart={bento.visitTrend}
          className="min-h-[280px] md:col-span-6"
          chartHeight="h-[240px]"
        >
          {(chart, animate) => <MultiAreaChart chart={chart} animate={animate} />}
        </BentoChartCard>

        <div className="flex flex-col gap-3 md:col-span-3">
          <KpiCard item={referralsCard} className="flex-1" />
          <KpiCard item={diagnosesCard} className="flex-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <BentoChartCard
          chart={bento.visitDistribution}
          className="min-h-[280px] md:col-span-5"
          chartHeight="h-[220px]"
        >
          {(chart, animate) => <DonutChart chart={chart} animate={animate} />}
        </BentoChartCard>

        <BentoChartCard
          chart={bento.clinicalPrograms}
          className="min-h-[280px] md:col-span-7"
          chartHeight="h-[220px]"
        >
          {(chart, animate) => <HorizontalProgramChart chart={chart} animate={animate} />}
        </BentoChartCard>
      </div>

      <Card className="rounded-card shadow-card">
        <CardHeader>
          <CardTitle>Overall Reporting Summary</CardTitle>
          <CardDescription>
            Aggregate RHU indicators · {periodLabel}. Counts stay in their own units.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!report?.summary?.length || report.empty ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              No matching records in this reporting period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    <th className="px-3 py-2.5">Indicator</th>
                    <th className="px-3 py-2.5 text-right">Count</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summary.map((row, index) => (
                    <tr key={`${row.label}-${row.note}-${index}`} className="border-b border-neutral-100">
                      <td className="px-3 py-2.5 font-medium text-neutral-900">{row.label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-900">{row.value}</td>
                      <td className="px-3 py-2.5 text-neutral-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ item, className }) {
  if (!item) return null;
  return (
    <article
      className={cn(
        "flex flex-col justify-center rounded-card border border-neutral-200 bg-white p-4 shadow-card",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{item.label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{item.value}</p>
      <p className="mt-1 text-xs text-neutral-500">{item.hint}</p>
    </article>
  );
}

function BentoChartCard({ chart, className, chartHeight, children }) {
  const animate = !usePrefersReducedMotion();
  if (!chart) return null;

  return (
    <Card className={cn("flex h-full flex-col rounded-card shadow-card", className)}>
      <CardHeader className="pb-2">
        <CardTitle>{chart.title}</CardTitle>
        <CardDescription>{chart.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {hasChartValues(chart) ? (
          children(chart, animate, chartHeight)
        ) : (
          <ChartEmpty className={chartHeight} />
        )}
      </CardContent>
    </Card>
  );
}

function MultiAreaChart({ chart, animate }) {
  const walkGradientId = `walk-${useId().replace(/:/g, "")}`;
  const referredGradientId = `ref-${useId().replace(/:/g, "")}`;

  return (
    <ChartContainer config={chart.config} className="aspect-auto h-[240px] w-full">
      <AreaChart data={chart.data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={walkGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-walkIn)" stopOpacity={0.28} />
            <stop offset="95%" stopColor="var(--color-walkIn)" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id={referredGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-referred)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--color-referred)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" periodLabel={chart.periodLabel} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="walkIn"
          stroke="var(--color-walkIn)"
          fill={`url(#${walkGradientId})`}
          strokeWidth={2}
          isAnimationActive={animate}
        />
        <Area
          type="monotone"
          dataKey="referred"
          stroke="var(--color-referred)"
          fill={`url(#${referredGradientId})`}
          strokeWidth={2}
          isAnimationActive={animate}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function DonutChart({ chart, animate }) {
  return (
    <ChartContainer config={chart.config} className="aspect-auto mx-auto h-[220px] w-full max-w-[320px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel periodLabel={chart.periodLabel} nameKey="key" />} />
        <Pie
          data={chart.data}
          dataKey={chart.valueKey}
          nameKey="key"
          innerRadius={58}
          outerRadius={82}
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
    </ChartContainer>
  );
}

function HorizontalProgramChart({ chart, animate }) {
  const max = Math.max(0, ...chart.data.map((row) => Number(row.value) || 0));

  return (
    <ChartContainer config={chart.config} className="aspect-auto h-[220px] w-full">
      <BarChart
        data={chart.data}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} domain={[0, max > 0 ? max : 1]} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={128}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => String(value || "")}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              periodLabel={chart.periodLabel}
              formatter={(value, _name, item) => {
                const unit = item?.payload?.unit || "count";
                return `${value} ${unit}`;
              }}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 6, 6, 0]}
          maxBarSize={28}
          isAnimationActive={animate}
        />
      </BarChart>
    </ChartContainer>
  );
}

function ChartEmpty({ className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", className || "h-[220px]")}>
      <BarChart3 className="text-neutral-300" size={28} />
      <p className="text-sm font-medium text-neutral-600">No data in this period</p>
      <p className="text-xs text-neutral-500">Counts stay at zero until matching records are saved.</p>
    </div>
  );
}

function hasChartValues(chart) {
  if (!chart || !Array.isArray(chart.data)) return false;
  if (chart.kind === "multi-area") {
    return chart.data.some((row) => Number(row.walkIn) > 0 || Number(row.referred) > 0);
  }
  const valueKey = chart.valueKey || "value";
  return chart.data.some((item) => Number(item[valueKey]) > 0);
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
