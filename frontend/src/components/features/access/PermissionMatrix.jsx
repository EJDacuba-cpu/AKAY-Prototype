import { RotateCcw } from "lucide-react";
import { LICENSED_PERMISSIONS, PERMISSION_CATALOG, PERMISSION_GROUPS } from "../../../utils/actionPermissions";
import { AccessChip } from "./AccessChips";

/** Checklist of the duties available at the account's facility, grouped by module. Role defaults arrive pre-ticked. */
export default function PermissionMatrix({ permissions, available, defaults, licensedRole, onChange, onReset }) {
  const groups = PERMISSION_GROUPS
    .map(group => ({ ...group, keys: available.filter(key => PERMISSION_CATALOG[key].group === group.key) }))
    .filter(group => group.keys.length);
  const selected = available.filter(key => permissions.includes(key)).length;

  function row(key) {
    const checked = permissions.includes(key);
    const info = PERMISSION_CATALOG[key];
    return (
      <label key={key} className={`flex items-start gap-2.5 rounded-md p-2 text-sm ${checked ? "bg-slate-50" : ""}`}>
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={event => onChange(key, event.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-800">{info.label}</span>
            {checked && !defaults.includes(key) && <AccessChip kind="added" />}
            {checked && !licensedRole && LICENSED_PERMISSIONS.includes(key) && <AccessChip kind="licensed" />}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">{info.note}</span>
          {info.requires && (
            <span className="mt-0.5 block text-[11px] text-slate-400">
              Also ticks {info.requires.map(required => PERMISSION_CATALOG[required].label).join(", ")}.
            </span>
          )}
        </span>
      </label>
    );
  }

  return (
    <div role="group" aria-labelledby="access-matrix-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="access-matrix-title" className="text-sm font-semibold text-slate-900">Access · {selected} of {available.length} selected</h2>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <RotateCcw size={13} aria-hidden="true" /> Reset to role defaults
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(group => (
          <div key={group.key} className="rounded-lg border border-slate-200 p-2">
            <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
            <div className="mt-1 space-y-0.5">{group.keys.map(row)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
