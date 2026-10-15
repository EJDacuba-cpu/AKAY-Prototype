import { useSyncExternalStore } from "react";
import { getCurrentUser } from "../utils/auth";
import { canAccessModule } from "../config/accessModules";

const CHANGE_EVENTS = ["akay:auth-changed", "akay:facility-changed"];

function subscribe(onChange) {
  CHANGE_EVENTS.forEach(name => window.addEventListener(name, onChange));
  return () => CHANGE_EVENTS.forEach(name => window.removeEventListener(name, onChange));
}

// A string snapshot stays referentially stable between reads of the same user, as useSyncExternalStore requires.
function snapshot() {
  const user = getCurrentUser();
  return user ? `${user.role}|${(user.permissions || []).join(",")}` : "|";
}

/** The signed-in user's effective permissions at their working facility; re-renders when they change. */
export default function useAccess() {
  const [role, list] = useSyncExternalStore(subscribe, snapshot, snapshot).split("|");
  const permissions = list ? list.split(",") : [];
  const isAdmin = role === "admin";
  const can = permission => isAdmin || (Boolean(permission) && permissions.includes(permission));
  return { permissions, isAdmin, can, canModule: module => canAccessModule({ role, permissions }, module) };
}
