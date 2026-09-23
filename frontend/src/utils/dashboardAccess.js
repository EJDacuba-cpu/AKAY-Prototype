export function dashboardAccess(user = {}) {
  const permissions = user?.permissions || [];
  return {
    patients: permissions.includes("patients.register"),
    clinical: permissions.includes("clinical.history"),
    inventory: permissions.includes("inventory.view"),
  };
}

export async function loadAuthorizedDashboardCollections(user, loaders) {
  const access = dashboardAccess(user);
  const [patients, healthRecords, referrals] = await Promise.all([
    access.patients ? loaders.patients() : [],
    access.clinical ? loaders.healthRecords() : [],
    access.clinical ? loaders.referrals() : [],
  ]);
  return { patients, healthRecords, referrals, access };
}

export function navigationAllowed(user, path = "") {
  if (user?.role === "admin") return true;
  const permissions = user?.permissions || [];
  const permission = /health-records|follow-ups|referrals|qr-scanner/.test(path)
    ? "clinical.history"
    : /patients/.test(path) ? "patients.register"
      : /reports/.test(path) ? "reports.view"
        : /medicine/.test(path) ? "inventory.view" : null;
  return !permission || permissions.includes(permission);
}
