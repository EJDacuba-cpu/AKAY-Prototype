import { Check } from "lucide-react";
import { PERMISSION_PRESETS } from "../../../utils/actionPermissions";
import { overrideTier } from "../../../utils/accessPolicy";
import { TierChip } from "./AccessChips";

/** Stackable role presets: each card toggles its default duties in the matrix below. */
export default function PresetPicker({ presets, designation, role, suggested, onToggle }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">Role presets</legend>
      <p className="mt-1 text-xs text-slate-500">Select one or more. A preset ticks its default duties; select it again to remove them.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(PERMISSION_PRESETS).map(([key, preset]) => {
          const pressed = presets.includes(key);
          const tiers = preset.permissions.map(p => overrideTier(p, designation, role)).filter(Boolean);
          const worst = tiers.includes("critical") ? "critical" : tiers.includes("sensitive") ? "sensitive" : "override";
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(key)}
              className={`rounded-lg border p-4 text-left transition-colors ${pressed ? "border-red-600 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <span className="flex items-start justify-between gap-2">
                <strong className="text-sm">{preset.label}{key === suggested ? " · Suggested" : ""}</strong>
                <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${pressed ? "border-red-700 bg-red-700 text-white" : "border-slate-300 bg-white"}`}>
                  {pressed && <Check size={13} strokeWidth={3} />}
                </span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">{preset.description}</span>
              {tiers.length > 0 && (
                <span className="mt-2 inline-flex">
                  <TierChip tier={worst}>Includes {tiers.length} override{tiers.length === 1 ? "" : "s"}</TierChip>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
