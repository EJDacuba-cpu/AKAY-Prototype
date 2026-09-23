import { ALL_PERMISSIONS, PERMISSION_PRESETS } from "./actionPermissions.js";

export function compatiblePermissions(designation, role) {
  const clinical = ["nurse", "midwife", "doctor"].includes(String(designation).toLowerCase());
  if (clinical) return ALL_PERMISSIONS.filter(p => role === "rhu_staff" || p !== "rhu.manage");
  if (String(designation).toLowerCase() === "logistics") return PERMISSION_PRESETS.inventory.permissions;
  return PERMISSION_PRESETS.encoder.permissions;
}

export function suggestedPreset(designation, role) {
  if (String(designation).toLowerCase() === "logistics") return "inventory";
  if (["nurse", "midwife", "doctor"].includes(String(designation).toLowerCase())) return role === "rhu_staff" ? "rhu" : "clinical";
  return "encoder";
}

export function accessProfile(user) {
  if (["admin", "Admin"].includes(user.role)) return "Admin / MHO";
  const p = user.permissions;
  if (!Array.isArray(p)) return "Legacy · review access";
  if (p.includes("consultations.finalize")) return "Clinical Staff";
  if (p.includes("rhu.manage")) return "RHU Staff";
  if (p.includes("inventory.manage")) return "Inventory Staff";
  if (p.includes("consultations.encode")) return "Encoder";
  return p.length ? "Custom" : "No access assigned";
}
