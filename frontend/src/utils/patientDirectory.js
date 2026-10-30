/** RHU All Patients is a directory; registration stays on the walk-in path. */
export function showDirectoryRegisterAction(role) {
  return role !== "rhu";
}
