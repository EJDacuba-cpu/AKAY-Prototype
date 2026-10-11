import { useState } from "react";
import { ALL_PERMISSIONS, PERMISSION_CATALOG, PERMISSION_GROUPS, PERMISSION_PRESETS } from "../../../utils/actionPermissions";
import { designationScope, facilityNote, overrideTier } from "../../../utils/accessPolicy";
import { SourceChip, TierChip } from "./AccessChips";

const grouped = keys => PERMISSION_GROUPS
  .map(group => ({ ...group, keys: keys.filter(key => PERMISSION_CATALOG[key].group === group.key) }))
  .filter(group => group.keys.length);

/**
 * In-scope duties are always visible so preset clicks visibly tick them. Duties outside the designation's
 * scope sit in the collapsed Additional Permissions section, which stays open while any of them is granted.
 */
export default function PermissionMatrix({ permissions, presets, designation, role, onChange }) {
  const [opened, setOpened] = useState(false);
  const scope = designationScope(designation, role);
  const defaults = new Set(presets.flatMap(key => PERMISSION_PRESETS[key].permissions));
  const inScope = ALL_PERMISSIONS.filter(key => scope.includes(key));
  const outOfScope = ALL_PERMISSIONS.filter(key => !scope.includes(key));
  const granted = outOfScope.filter(key => permissions.includes(key)).length;

  function row(key) {
    const checked = permissions.includes(key);
    const tier = overrideTier(key, designation, role);
    const info = PERMISSION_CATALOG[key];
    const note = facilityNote(key, role);
    return (
      <label key={key} className={`flex items-start gap-2.5 rounded-md p-2 text-sm ${checked ? "bg-slate-50" : ""}`}>
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={event => onChange(key, event.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-800">{info.label}</span>
            <code className="text-[11px] text-slate-400">{key}</code>
            {tier ? <TierChip tier={tier} /> : checked && <SourceChip source={defaults.has(key) ? "default" : "standard"} />}
          </span>
          {(tier || key === "items.dispense") && <span className="mt-0.5 block text-xs text-slate-500">{info.note}</span>}
          {note && <span className="mt-0.5 block text-xs text-amber-700">{note}</span>}
          {info.requires && (
            <span className="mt-0.5 block text-[11px] text-slate-400">
              Also ticks {info.requires.map(required => PERMISSION_CATALOG[required].label).join(", ")}.
            </span>
          )}
        </span>
      </label>
    );
  }

  const columns = keys => (
    <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {grouped(keys).map(group => (
        <div key={group.key}>
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
          <div className="mt-1 space-y-0.5">{group.keys.map(row)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Module access</legend>
        <p className="mt-1 text-xs text-slate-500">Duties this designation normally holds.</p>
        {columns(inScope)}
      </fieldset>
      {outOfScope.length > 0 && (
        <details open={opened || granted > 0} onToggle={event => setOpened(event.currentTarget.open)} className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Additional Permissions · overrides{granted ? ` (${granted} granted)` : ""}
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Outside this designation's usual duties. Anything granted here is flagged and must be authorized at Review.
          </p>
          {columns(outOfScope)}
        </details>
      )}
    </div>
  );
}
