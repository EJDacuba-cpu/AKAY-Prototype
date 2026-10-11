import {
  ALL_PERMISSIONS,
  CLINICAL_DESIGNATIONS,
  LICENSED_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_PRESETS,
  RHU_ONLY_PERMISSIONS,
  SENSITIVE_PERMISSIONS,
} from "./actionPermissions.js";

// Mirrors ActionPermissions::scope/overrides/overrideTier. Any designation may hold any duty;
// duties outside the designation's usual scope are overrides the admin must acknowledge.

const normalized = designation => String(designation || "").trim().toLowerCase();
export const isClinicalDesignation = designation => CLINICAL_DESIGNATIONS.includes(normalized(designation));

export function designationScope(designation, role) {
  if (role === "admin") return [];
  if (isClinicalDesignation(designation)) return ALL_PERMISSIONS.filter(p => role === "rhu_staff" || !RHU_ONLY_PERMISSIONS.includes(p));
  return normalized(designation) === "logistics" ? PERMISSION_PRESETS.inventory.permissions : PERMISSION_PRESETS.encoder.permissions;
}

/** null when in scope; otherwise "override" | "sensitive" | "critical" (a licensed act outside midwife/nurse/doctor). */
export function overrideTier(permission, designation, role) {
  if (designationScope(designation, role).includes(permission)) return null;
  if (LICENSED_PERMISSIONS.includes(permission) && !isClinicalDesignation(designation)) return "critical";
  return SENSITIVE_PERMISSIONS.includes(permission) || LICENSED_PERMISSIONS.includes(permission) ? "sensitive" : "override";
}

export function facilityNote(permission, role) {
  return RHU_ONLY_PERMISSIONS.includes(permission) && role !== "rhu_staff" ? "Only used on RHU screens; this account's home is a BHC." : null;
}

const requirementsOf = key => PERMISSION_CATALOG[key]?.requires || [];
const ordered = set => ALL_PERMISSIONS.filter(p => set.has(p));

export function withRequirements(permissions) {
  const next = new Set(permissions);
  for (let grew = true; grew;) {
    grew = false;
    for (const key of [...next]) for (const required of requirementsOf(key)) if (!next.has(required)) { next.add(required); grew = true; }
  }
  return ordered(next);
}

function withoutDependents(permissions, removed) {
  const gone = new Set(removed);
  for (let grew = true; grew;) {
    grew = false;
    for (const key of permissions) if (!gone.has(key) && requirementsOf(key).some(r => gone.has(r))) { gone.add(key); grew = true; }
  }
  return permissions.filter(p => !gone.has(p));
}

const presetCovered = (key, permissions) => PERMISSION_PRESETS[key].permissions.every(p => permissions.includes(p));

export function activePresets(permissions) {
  return Object.keys(PERMISSION_PRESETS).filter(key => presetCovered(key, permissions));
}

/** Presets an existing account appears to hold, dropping any that another held preset fully contains (Encoder inside Clinical). */
export function initialPresetSelection(permissions) {
  const active = activePresets(permissions);
  const inside = (a, b) => PERMISSION_PRESETS[a].permissions.every(p => PERMISSION_PRESETS[b].permissions.includes(p));
  return active.filter(key => !active.some(other => other !== key && inside(key, other) && !inside(other, key)));
}

/**
 * Presets stack. Turning one on adds its defaults; turning it off removes only defaults no other selected
 * preset covers, so overlapping duties and individually ticked extras survive.
 */
export function togglePreset({ permissions, presets }, key) {
  if (!presets.includes(key)) return { permissions: withRequirements([...permissions, ...PERMISSION_PRESETS[key].permissions]), presets: [...presets, key] };
  const others = presets.filter(k => k !== key);
  const kept = new Set(others.flatMap(k => PERMISSION_PRESETS[k].permissions));
  const next = withoutDependents(permissions, PERMISSION_PRESETS[key].permissions.filter(p => !kept.has(p)));
  return { permissions: next, presets: others.filter(k => presetCovered(k, next)) };
}

export function setPermission({ permissions, presets }, key, on) {
  const next = on ? withRequirements([...permissions, key]) : withoutDependents(permissions, [key]);
  return { permissions: next, presets: presets.filter(k => presetCovered(k, next)) };
}

export function reviewPermissions({ designation, role, permissions, presets = [], previous = null }) {
  const defaults = new Set(presets.flatMap(k => PERMISSION_PRESETS[k]?.permissions || []));
  const rows = permissions.map(key => {
    const tier = overrideTier(key, designation, role);
    return {
      key,
      ...PERMISSION_CATALOG[key],
      tier,
      source: tier ? "override" : defaults.has(key) ? "default" : "standard",
      added: Boolean(previous) && !previous.includes(key),
      facilityNote: facilityNote(key, role),
    };
  });
  const overrides = rows.filter(row => row.tier);
  return {
    rows,
    overrides,
    critical: overrides.filter(row => row.tier === "critical"),
    sensitive: overrides.filter(row => row.tier === "sensitive"),
    added: rows.filter(row => row.added).map(row => row.key),
    removed: previous ? previous.filter(key => !permissions.includes(key)) : [],
    hasCritical: overrides.some(row => row.tier === "critical"),
    requiresAcknowledgement: overrides.length > 0,
  };
}
