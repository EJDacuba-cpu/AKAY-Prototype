import { PERMISSION_PRESETS } from "./actionPermissions.js";
import { designationScope, overrideTier } from "./accessPolicy.js";

/** The duties a designation normally holds. Not a limit: anything else can be granted as an acknowledged override. */
export function compatiblePermissions(designation, role) {
  return designationScope(designation, role);
}

export function suggestedPreset(designation, role) {
  if (String(designation).toLowerCase() === "logistics") return "inventory";
  if (["nurse", "midwife", "doctor"].includes(String(designation).toLowerCase())) return role === "rhu_staff" ? "rhu" : "clinical";
  return "encoder";
}

export function accessProfile(user) {
  return accessSummary(user).label;
}

// Directory accounts carry the frontend role ("bhc"/"rhu"); the access policy speaks the backend's.
const BACKEND_ROLES = { bhc: "bhw", rhu: "rhu_staff" };

/** Directory label: the base profile plus how many duties sit outside the designation's scope. */
export function accessSummary(user = {}) {
  const plain = label => ({ label, overrides: 0, critical: false });
  if (["admin", "Admin"].includes(user.role)) return plain("Admin / MHO");
  const p = user.permissions;
  if (!Array.isArray(p)) return plain("Legacy · review access");
  if (!p.length) return plain("No access assigned");
  const role = user.backendRole || BACKEND_ROLES[user.role] || user.role;
  const tiers = p.map(key => overrideTier(key, user.professional_designation, role)).filter(Boolean);
  const base = baseProfile({ ...user, role }, p);
  if (!tiers.length) return plain(base);
  return { label: `${base} · +${tiers.length} override${tiers.length === 1 ? "" : "s"}`, overrides: tiers.length, critical: tiers.includes("critical") };
}

function baseProfile(user, p) {
  const suggested = PERMISSION_PRESETS[suggestedPreset(user.professional_designation, user.role)];
  if (suggested.permissions.every(key => p.includes(key))) return suggested.label;
  if (p.includes("consultations.finalize")) return "Clinical Staff";
  if (p.includes("rhu.manage")) return "RHU Staff";
  if (p.includes("inventory.manage")) return "Inventory Staff";
  if (p.includes("consultations.encode")) return "Encoder";
  return "Custom";
}
