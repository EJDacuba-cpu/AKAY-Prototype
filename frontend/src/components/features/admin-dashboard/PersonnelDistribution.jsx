import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

const GROUPS = {
  bhc: [{ key: "midwife", label: "Midwife" }, { key: "encoder", label: "Encoder" }, { key: "bhw", label: "BHW" }],
  rhu: [{ key: "intake_staff", label: "RHU Staff" }, { key: "doctor", label: "Doctor" }, { key: "nurse", label: "Nurse" }],
};

export default function PersonnelDistribution({ counts = {} }) {
  const [category, setCategory] = useState("bhc");
  const roles = GROUPS[category];
  const values = roles.map((role) => ({ ...role, count: counts[role.key] || 0 }));
  const total = values.reduce((sum, role) => sum + role.count, 0);
  const step = Math.max(1, Math.ceil(Math.max(...values.map((role) => role.count), 0) / 4));
  const maximum = step * 4;
  const ticks = Array.from({ length: 5 }, (_, index) => index * step);

  return (
    <Card className="h-full min-w-0 rounded-card shadow-card" aria-labelledby="personnel-distribution-title">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-3 space-y-0">
        <div className="min-w-0">
          <CardTitle id="personnel-distribution-title">Staff & Role Snapshot</CardTitle>
          <CardDescription id="personnel-distribution-description">
            Assigned personnel by designation
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p aria-live="polite" aria-atomic="true" className="text-xs text-neutral-500">
            Total Assigned:{" "}
            <strong className="font-semibold tabular-nums text-neutral-900">{total}</strong>
          </p>
          <div
            role="group"
            aria-label="Personnel facility category"
            className="inline-flex rounded-full bg-neutral-100 p-1"
          >
            {["bhc", "rhu"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                aria-controls="personnel-distribution-plot"
                onClick={() => setCategory(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
                  category === value
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <figure
          id="personnel-distribution-plot"
          aria-labelledby="personnel-distribution-title"
          aria-describedby="personnel-distribution-description"
        >
          <div aria-hidden="true" className="mt-1 grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
            <div className="relative h-32 text-[10px] tabular-nums text-neutral-500">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  className="absolute right-0 translate-y-1/2"
                  style={{ bottom: `${index * 25}%` }}
                >
                  {tick}
                </span>
              ))}
            </div>
            <div className="relative h-32">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {ticks.map((tick) => (
                  <span key={tick} className="block border-t border-neutral-200" />
                ))}
              </div>
              <div className="relative grid h-full grid-cols-3 gap-3">
                {values.map((role) => (
                  <div key={role.key} className="flex h-full items-end justify-center">
                    <div
                      className="relative w-12 max-w-[60%] rounded-t-md bg-brand-600 sm:w-16"
                      style={{ height: `${maximum > 0 ? (role.count / maximum) * 100 : 0}%` }}
                    >
                      <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-xs font-semibold tabular-nums text-neutral-900">
                        {role.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-start-2 mt-2 grid grid-cols-3 gap-3 text-center text-xs text-neutral-500">
              {values.map((role) => (
                <span key={role.key}>{role.label}</span>
              ))}
            </div>
          </div>
          <dl className="sr-only" aria-label={`Assigned ${category.toUpperCase()} personnel by role`}>
            {values.map((role) => (
              <div key={role.key}>
                <dt>{role.label}</dt>
                <dd>{role.count}</dd>
              </div>
            ))}
          </dl>
          <figcaption className="sr-only">
            Active and inactive accounts with valid home assignments and a listed designation.
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
