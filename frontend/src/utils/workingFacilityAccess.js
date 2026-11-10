/**
 * Working-facility switching is only for RHU-based nurses with more than one
 * currently authorized facility (home RHU plus active BHC assignments).
 * Prefer staff_role + account role over the effective facility `role`, which
 * becomes "bhc" after a nurse switches into an assigned BHC.
 */
export function canShowWorkingFacilitySelector(user) {
  if (!user || user.role === "admin" || user.backendRole === "admin") return false;
  const choices = user.authorized_facilities || [];
  if (choices.length <= 1) return false;
  const accountRole = user.backendRole || user.accountRole;
  return user.staff_role === "nurse" && accountRole === "rhu";
}
