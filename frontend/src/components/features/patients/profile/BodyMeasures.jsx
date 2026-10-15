import { Ruler, Scale } from "lucide-react";

import { formatShortDate } from "../../../../utils/patientProfile";

const TICKS = Array.from({ length: 11 }, (_, index) => index * 10);

/**
 * Stadiometer beside the body figure: a vertical rule with ticks and the
 * latest recorded height at the head mark. The figure is a generic body for
 * the patient's sex and age, so the rule labels the measurement - it is not
 * drawn to scale against the picture.
 */
export function HeightRuler({ height, isLoading = false, className = "" }) {
  return (
    <div className={`flex min-h-0 items-stretch gap-2 ${className}`}>
      <div aria-hidden="true" className="relative w-2.5 shrink-0">
        <span className="absolute inset-y-0 left-0 w-px bg-neutral-300" />
        <span className="absolute left-0 top-0 h-px w-2.5 bg-ink-600" />
        <span className="absolute bottom-0 left-0 h-px w-2.5 bg-neutral-400" />
        {TICKS.slice(1, -1).map((top) => (
          <span
            key={top}
            className={`absolute left-0 h-px bg-neutral-300 ${top % 50 === 0 ? "w-2" : "w-1"}`}
            style={{ top: `${top}%` }}
          />
        ))}
      </div>
      <div className="-mt-1 min-w-0">
        <p className="flex items-center gap-1 text-[11px] font-medium text-neutral-500">
          <Ruler size={12} aria-hidden="true" />
          Height
        </p>
        {isLoading ? <p role="status" className="text-xs text-neutral-500">Loading...</p> : height ? (
          <>
            <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums leading-5 text-neutral-900">
              {height.display}
              <span className="ml-0.5 text-[11px] font-normal text-neutral-500">cm</span>
            </p>
            <p className="whitespace-nowrap text-[11px] tabular-nums text-neutral-500">{formatShortDate(height.date, "")}</p>
          </>
        ) : (
          <p className="whitespace-nowrap text-xs text-neutral-500">Not recorded</p>
        )}
      </div>
    </div>
  );
}

function WeightBars({ history }) {
  if (history.length < 2) return null;
  const values = history.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return (
    <ol aria-label="Recent weights" className="flex h-10 items-end gap-1">
      {history.map((point, index) => {
        const latest = index === history.length - 1;
        // 35-100% of the box, so the lightest reading still shows as a bar.
        const height = 35 + ((point.value - min) / span) * 65;
        const label = `${point.value} kg, ${formatShortDate(point.date, "date not recorded")}`;
        return (
          <li key={`${point.date.toISOString()}-${index}`} title={label} className="flex h-full w-3 items-end">
            <span className="sr-only">{label}</span>
            <span
              aria-hidden="true"
              className={`block w-full rounded-sm ${latest ? "bg-ink-600" : "bg-neutral-200"}`}
              style={{ height: `${height}%` }}
            />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Under the body figure, like the scale the patient stands on: the latest
 * weight, the change since the previous reading, a few recent weights as
 * bars, and the latest BMI. Numbers only - no judgement of the change.
 */
export function WeightAndBmi({ weight, bmi }) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      <div className="flex min-w-0 items-end gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] font-medium text-neutral-500">
            <Scale size={12} aria-hidden="true" />
            Weight
          </p>
          {weight ? (
            <>
              <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums leading-5 text-neutral-900">
                {weight.latest.value}
                <span className="ml-0.5 text-[11px] font-normal text-neutral-500">kg</span>
              </p>
              <p className="whitespace-nowrap text-[11px] tabular-nums text-neutral-500">
                {weight.change
                  ? `${weight.change.display} kg since ${formatShortDate(weight.change.since, "last visit")}`
                  : formatShortDate(weight.latest.date, "")}
              </p>
            </>
          ) : (
            <p className="text-xs text-neutral-500">Not recorded</p>
          )}
        </div>
        {weight && <WeightBars history={weight.history} />}
      </div>

      <div className="min-w-0">
        <p className="text-[11px] font-medium text-neutral-500">BMI</p>
        {bmi ? (
          <>
            <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums leading-5 text-neutral-900">{bmi.value}</p>
            <p className="whitespace-nowrap text-[11px] text-neutral-500">
              {[bmi.category, formatShortDate(bmi.date, "")].filter(Boolean).join(" · ")}
            </p>
          </>
        ) : (
          <p className="text-xs text-neutral-500">Not recorded</p>
        )}
      </div>
    </div>
  );
}
