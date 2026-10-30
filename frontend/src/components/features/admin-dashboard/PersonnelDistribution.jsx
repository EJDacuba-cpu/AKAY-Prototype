import { useState } from "react";

const GROUPS = {
  bhc: [{ key: "midwife", label: "Midwife" }, { key: "encoder", label: "Encoder" }, { key: "bhw", label: "BHW" }],
  rhu: [{ key: "intake_staff", label: "RHU Staff" }, { key: "doctor", label: "Doctor" }, { key: "nurse", label: "Nurse" }],
};

export default function PersonnelDistribution({ counts = {} }) {
  const [category, setCategory] = useState("bhc");
  const roles = GROUPS[category];
  const values = roles.map((role) => ({ ...role, count: counts[role.key] || 0 }));
  const total = values.reduce((sum, role) => sum + role.count, 0);
  const step = Math.max(1, Math.ceil(Math.max(...values.map((role) => role.count)) / 4));
  const maximum = step * 4;
  const ticks = Array.from({ length: 5 }, (_, index) => index * step);

  return (
    <section aria-labelledby="personnel-distribution-title" className="min-w-0 rounded-xl border border-[#E8ECF0] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="personnel-distribution-title" className="text-sm font-bold text-[var(--color-text)]">Personnel Overview</h2>
          <p id="personnel-distribution-description" className="mt-0.5 text-xs text-[var(--color-text-secondary)]">Personnel distribution by role</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-text-secondary)]">
            Total Assigned Personnel: <strong className="font-semibold tabular-nums text-[var(--color-text)]">{total}</strong>
          </p>
          <div role="group" aria-label="Personnel facility category" className="inline-flex rounded-full bg-neutral-100 p-1">
            {["bhc", "rhu"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                aria-controls="personnel-distribution-plot"
                onClick={() => setCategory(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info-700 ${category === value ? "bg-white text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <figure id="personnel-distribution-plot" aria-labelledby="personnel-distribution-title" aria-describedby="personnel-distribution-description">
        <div aria-hidden="true" className="mt-6 grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
          <div className="relative h-32 text-[10px] tabular-nums text-[var(--color-text-secondary)]">
            {ticks.map((tick, index) => (
              <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${index * 25}%` }}>{tick}</span>
            ))}
          </div>
          <div className="relative h-32">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {ticks.map((tick) => <span key={tick} className="block border-t border-[#E8ECF0]" />)}
            </div>
            <div className="relative grid h-full grid-cols-3 gap-3">
              {values.map((role) => (
                <div key={role.key} className="flex h-full items-end justify-center">
                  <div className="relative w-12 max-w-[60%] rounded-t-md bg-info-500 sm:w-16" style={{ height: `${(role.count / maximum) * 100}%` }}>
                    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--color-text)]">{role.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-start-2 mt-2 grid grid-cols-3 gap-3 text-center text-xs text-[var(--color-text-secondary)]">
            {values.map((role) => <span key={role.key}>{role.label}</span>)}
          </div>
        </div>
        <dl className="sr-only" aria-label={`Assigned ${category.toUpperCase()} personnel by role`}>
          {values.map((role) => <div key={role.key}><dt>{role.label}</dt><dd>{role.count}</dd></div>)}
        </dl>
        <figcaption className="sr-only">Active and inactive accounts with valid home assignments and a listed designation.</figcaption>
      </figure>
    </section>
  );
}
