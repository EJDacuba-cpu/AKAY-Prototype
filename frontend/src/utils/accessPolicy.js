import { ALL_PERMISSIONS, LICENSED_PERMISSIONS, PERMISSION_CATALOG } from "./actionPermissions.js";

// Any role may hold any duty available at its facility. Prerequisites mirror ActionPermissions::REQUIRES.

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

export function setPermission(permissions, key, on) {
  return on ? withRequirements([...permissions, key]) : withoutDependents(permissions, [key]);
}

/** Pre-save review rows. Added and Removed compare against the role defaults; Licensed marks licensed acts on a non-licensed role. */
export function reviewPermissions({ permissions, defaults = [], licensedRole = false }) {
  return {
    rows: permissions.map(key => ({
      key,
      ...PERMISSION_CATALOG[key],
      added: !defaults.includes(key),
      licensed: !licensedRole && LICENSED_PERMISSIONS.includes(key),
    })),
    removed: defaults.filter(key => !permissions.includes(key)),
  };
}
