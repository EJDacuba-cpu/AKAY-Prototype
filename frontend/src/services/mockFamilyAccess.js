// Prototype permissions live only in this browser. Never send these keys to the
// Laravel permissions endpoint; the server does not implement Families yet.
export const FAMILY_PERMISSIONS = ["families.view", "families.manage"];
const STORAGE_KEY = "akay.mock-family-access.v1";
export const backendPermissions = permissions => (permissions || []).filter(key => !FAMILY_PERMISSIONS.includes(key));
export const suggestedFamilyPermissions = staffRole => ["bhw", "midwife", "encoder"].includes(staffRole) ? [...FAMILY_PERMISSIONS] : [];

export function familyAccessKey(user) {
  if (!user?.id || !["bhc", "rhu"].includes(user.role)) return null;
  const facility = user.working_facility_key || `${user.role}:${user.role === "bhc" ? user.barangay_health_center_id : user.rural_health_unit_id}`;
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

export function withFamilyAccess(user) {
  return user ? { ...user, permissions: [...backendPermissions(user.permissions), ...readFamilyAccess(user)] } : user;
}

// Suggestions are applied only inside the admin's unsaved account form. They
// grant nothing until that admin explicitly saves the account's access.
export function withFamilyRoleSuggestions(data) {
  return {
    ...data,
    available: { ...data?.available, bhc: [...(data?.available?.bhc || []), ...FAMILY_PERMISSIONS], rhu: [...(data?.available?.rhu || []), ...FAMILY_PERMISSIONS] },
    roles: (data?.roles || []).map(role => ({ ...role, defaults: [...role.defaults, ...suggestedFamilyPermissions(role.key)] })),
  };
}
