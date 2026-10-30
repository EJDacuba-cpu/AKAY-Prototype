export function dashboardAccess(user = {}) {
  const permissions = user?.permissions || [];
  return {
    patients: permissions.includes("patients.register"),
    clinical: permissions.includes("clinical.history"),
    inventory: permissions.includes("inventory.view"),
  };
}

export function navigationAllowed(user, path = "") {
  if (user?.role === "admin") return true;
  const permissions = user?.permissions || [];
  if (
    ["bhc", "rhu"].includes(user?.role) &&
    new RegExp(`^/${user.role}/patients(?:/[^/]+)?$`).test(path) &&
    path !== `/${user.role}/patients/add` &&
    permissions.includes("clinical.history")
  ) return true;
  if (/^\/(bhc|rhu)\/families(?:\/|$)/.test(path)) return permissions.includes("families.view");
  if (user?.role === "rhu" && /^\/rhu\/(incoming-referrals|qr-scanner|referrals\/[^/]+)(?:\/|$)/.test(path)) {
    return permissions.includes("rhu.intake") || permissions.includes("rhu.manage");
  }
  if (user?.role === "rhu" && /^\/rhu\/follow-ups(?:\/|$)/.test(path)) {
    return permissions.includes("followups.manage");
  }
  const permission = /health-records|follow-ups|referrals|qr-scanner|programs/.test(path)
    ? "clinical.history"
    : /patients/.test(path) ? "patients.register"
      : /reports/.test(path) ? "reports.view"
        : /medicine/.test(path) ? "inventory.view" : null;
  return !permission || permissions.includes(permission);
}
