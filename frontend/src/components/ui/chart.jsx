import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "../../lib/utils";

const ChartContext = React.createContext(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

export function ChartContainer({ id, className, children, config, ...props }) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-neutral-500 [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-neutral-200 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-neutral-200 [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-neutral-200 [&_.recharts-radial-bar-background-sector]:fill-neutral-100 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-neutral-100 [&_.recharts-reference-line_[stroke='#ccc']]:stroke-neutral-200 [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }) {
  const colorConfig = Object.entries(config || {}).filter(([, item]) => item?.color || item?.theme);
  if (!colorConfig.length) return null;

  const rules = colorConfig
    .map(([key, item]) => {
      const color = item.color;
      return color ? `  --color-${key}: ${color};` : "";
    })
    .filter(Boolean)
    .join("\n");

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${rules}\n}`,
      }}
    />
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  formatter,
  color,
  nameKey,
  periodLabel,
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  const tooltipLabel = hideLabel
    ? null
    : labelFormatter
      ? labelFormatter(label, payload)
      : label;

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-[10px] border border-neutral-200 bg-white px-2.5 py-2 text-xs shadow-md",
        className,
      )}
    >
      {tooltipLabel ? (
        <div className="font-medium text-neutral-900">
          {tooltipLabel}
          {periodLabel ? (
            <span className="mt-0.5 block font-normal text-neutral-500">{periodLabel}</span>
          ) : null}
        </div>
      ) : periodLabel ? (
        <div className="font-normal text-neutral-500">{periodLabel}</div>
      ) : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = config?.[key] || {};
          const indicatorColor = color || item.payload?.fill || item.color || itemConfig.color;
          const displayName = itemConfig.label || item.name;
          const displayValue = formatter
            ? formatter(item.value, displayName, item, index, payload)
            : item.value;

          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn(
                    "shrink-0 rounded-[2px]",
                    indicator === "dot" ? "size-2" : "h-2.5 w-1",
                  )}
                  style={{ backgroundColor: indicatorColor }}
                />
              )}
              <span className="flex-1 truncate text-neutral-500">{displayName}</span>
              <span className="font-medium tabular-nums text-neutral-900">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export function ChartLegendContent({ className, hideIcon = false, payload, nameKey, verticalAlign = "bottom" }) {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-3",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        const itemConfig = config?.[key] || config?.[item.value] || {};
        return (
          <div key={item.value} className="flex items-center gap-1.5 text-neutral-600">
            {!hideIcon && (
              <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            )}
            <span>{itemConfig.label || item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export { useChart };
