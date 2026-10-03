import { useState } from "react";

import { formatLongDate } from "../../../../utils/formatters";
import {
  BACKGROUND_SECTION_LABELS,
  allConflictsResolved,
  backgroundChangeRows,
} from "../../../../utils/backgroundUpdate";

/**
 * Shown on Review & Confirm after the save answered 409: an edited Patient
 * Background section changed since the clinician opened it. Each conflicting
 * section shows the latest saved version beside theirs; they choose per
 * section, apply, then confirm the save again.
 */
export default function BackgroundConflictPanel({ conflicts, update, onApply }) {
  const [choices, setChoices] = useState({});
  const ready = allConflictsResolved(conflicts, choices);

  return (
    <div role="alert" className="mb-4 rounded-none border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-4">
      <p className="text-[13px] font-bold text-amber-900">Patient Background changed since you opened it</p>
      <p className="mt-0.5 text-[12.5px] text-amber-900">
        Another save updated the sections below. Choose which version to keep for each, then save again.
      </p>

      <div className="mt-3 space-y-3">
        {conflicts.map(({ section, current, updatedAt }) => {
          const rows = backgroundChangeRows(current, update?.sections?.[section], section);
          return (
            <fieldset key={section} className="rounded-none border border-amber-200 bg-white p-3">
              <legend className="px-1 text-[12.5px] font-semibold text-gray-900">
                {BACKGROUND_SECTION_LABELS[section]}
              </legend>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="py-1 pr-3 font-semibold">Field</th>
                      <th className="py-1 pr-3 font-semibold">
                        Latest saved{updatedAt ? ` (${formatLongDate(updatedAt, "")})` : ""}
                      </th>
                      <th className="py-1 font-semibold">Your changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 align-top">
                    {rows.length ? (
                      rows.map((row) => (
                        <tr key={row.key}>
                          <td className="py-1 pr-3 text-gray-500">{row.label}</td>
                          <td className="py-1 pr-3 text-gray-900">{row.before || "—"}</td>
                          <td className="py-1 text-gray-900">{row.after || "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-1 text-gray-500">
                          Your changes now match the latest saved version.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[12.5px]">
                {[
                  ["mine", "Keep my changes"],
                  ["latest", "Use latest"],
                ].map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`background-conflict-${section}`}
                      value={value}
                      checked={choices[section] === value}
                      onChange={() => setChoices((current) => ({ ...current, [section]: value }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-3 text-right">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onApply(choices)}
          className="rounded-none bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          Apply choices
        </button>
      </div>
    </div>
  );
}
