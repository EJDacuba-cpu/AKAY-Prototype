// Only deferred RHU Families use browser prototype grants. BHC grants come from
// Laravel, including for RHU nurses working at an assigned BHC.
export const FAMILY_PERMISSIONS = ["families.view", "families.manage"];
const STORAGE_KEY = "akay.mock-family-access.v1";
export const backendPermissions = (permissions, tier = "bhc") => (permissions || []).filter(key => tier !== "rhu" || !FAMILY_PERMISSIONS.includes(key));

export function familyAccessKey(user) {
  if (!user?.id || user.role !== "rhu" || user.working_facility_key?.startsWith("bhc:")) return null;
  const facility = user.working_facility_key || `rhu:${user.rural_health_unit_id}`;
  return `${user.id}|${facility}`;
}

export function readFamilyAccess(user, storage = globalThis.localStorage) {
  const key = familyAccessKey(user);
  if (!key || !storage) return [];
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "{}")[key];
    const permissions = FAMILY_PERMISSIONS.filter(permission => Array.isArray(stored) && stored.includes(permission));
    return permissions.includes("families.manage") ? [...FAMILY_PERMISSIONS] : permissions;
  } catch { return []; }
}

export function saveFamilyAccess(user, permissions, storage = globalThis.localStorage) {
  const key = familyAccessKey(user);
  if (!key || !storage) return;
  let saved;
  try { saved = JSON.parse(storage.getItem(STORAGE_KEY) || "{}"); } catch { saved = {}; }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
  const selected = FAMILY_PERMISSIONS.filter(permission => permissions.includes(permission));
  saved[key] = selected.includes("families.manage") ? [...FAMILY_PERMISSIONS] : selected;
  storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("akay:auth-changed"));
}

export function withFamilyAccess(user, storage = globalThis.localStorage) {
  if (!user || user.role !== "rhu" || user.working_facility_key?.startsWith("bhc:")) return user;
  return { ...user, permissions: [...backendPermissions(user.permissions, "rhu"), ...readFamilyAccess(user, storage)] };
}

// Expose the deferred RHU prototype only in the unsaved admin checklist.
// BHC availability and all role defaults remain server owned.
export function withFamilyRoleSuggestions(data) {
  return {
    ...data,
    available: { ...data?.available, rhu: [...new Set([...(data?.available?.rhu || []), ...FAMILY_PERMISSIONS])] },
  };
}
