function assignedId(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function sameAssignedId(left, right) {
  const a = assignedId(left);
  const b = assignedId(right);
  return Boolean(a) && a === b;
}

/**
 * RHU staff may rewrite identity only for patients this RHU owns.
 * Referred BHC patients stay view-only until receive stamps rural_health_unit_id.
 */
export function canModifyRhuPatient(user, patient) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  if (!permissions.includes("patients.register")) return false;
  return sameAssignedId(
    user?.ruralHealthUnitId ?? user?.rural_health_unit_id,
    patient?.ruralHealthUnitId ?? patient?.rural_health_unit_id,
  );
}
