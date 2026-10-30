import RestrictedArea from "./RestrictedArea";
import LockedPlaceholder from "./LockedPlaceholder";
import useAccess from "../../../hooks/useAccess";
import { ACCESS_MODULES } from "../../../config/accessModules";

/**
 * Renders `children` only when the module's permission is held; otherwise a blurred, inert `placeholder`.
 * `permission` overrides the module's own; `permissions` replaces the signed-in user's list (admin preview).
 */
export default function ModuleGate({ module, permission, permissions, placeholder, className, compact, children }) {
  const access = useAccess();
  const required = permission || ACCESS_MODULES[module]?.permission;
  const allowed = permissions ? permissions.includes(required) : access.can(required);

  return (
    <RestrictedArea
      locked={!allowed}
      label={ACCESS_MODULES[module]?.label}
      placeholder={placeholder ?? <LockedPlaceholder />}
      className={className}
      compact={compact}
    >
      {children}
    </RestrictedArea>
  );
}
