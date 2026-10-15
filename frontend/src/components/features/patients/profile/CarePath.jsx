import { Check } from "lucide-react";

import { buildCarePath } from "../../../../utils/carePath";

const NODE = {
  done: "border-ink-700 bg-ink-700 text-white",
  active: "border-ink-500 bg-white text-ink-700 ring-4 ring-ink-100",
  none: "border-neutral-300 bg-white text-transparent",
};

const LABEL = {
  done: "text-neutral-900",
  active: "text-neutral-900",
  none: "text-neutral-500",
};

const DETAIL = {
  done: "text-neutral-500",
  active: "text-ink-600",
  none: "text-neutral-500",
};

/**
 * The patient's place on the BHC -> RHU -> BHC care path: three stops joined
 * by a rule that fills as far as the path has been reached. Built only from
 * referrals and RHU-set condition statuses (see utils/carePath).
 */
export default function CarePath({ referrals = [], conditions, isLoading = false, className = "" }) {
  const { steps, summary } = buildCarePath({ referrals, groups: conditions?.groups });

  return (
    <section aria-label={summary} aria-busy={isLoading || undefined} className={`min-w-0 ${className}`}>
      <ol className="grid grid-cols-3" aria-hidden="true">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          const linked = next && step.state !== "none" && next.state !== "none";
          return (
            <li key={step.key} className="relative min-w-0 pr-3">
              <div className="flex items-center">
                <span
                  className={`relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${NODE[step.state]}`}
                >
                  {step.state === "done" && <Check size={11} strokeWidth={3} />}
                  {step.state === "active" && <span className="size-1.5 rounded-full bg-ink-600" />}
                </span>
                {next && (
                  <span
                    className={`ml-1.5 h-0 flex-1 border-t ${linked ? "border-ink-500" : "border-dashed border-neutral-300"}`}
                  />
                )}
              </div>
              <p className={`mt-1.5 text-[12px] font-medium leading-4 max-sm:min-h-8 sm:truncate ${LABEL[step.state]}`}>{step.label}</p>
              <p className={`text-[11px] leading-4 tabular-nums sm:truncate ${DETAIL[step.state]}`} title={step.detail}>
                {isLoading && step.state === "none" ? "Checking..." : step.detail}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
