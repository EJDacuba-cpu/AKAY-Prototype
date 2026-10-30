// Explicit spouse/sibling rows involving one member, seen from that member's side.
export function connectionRowsFor(household, memberId) {
  return (household?.relationships || [])
    .filter((row) => row.patientId === memberId || row.relativeId === memberId)
    .map((row) => ({ id: row.id, relativeId: row.patientId === memberId ? row.relativeId : row.patientId, type: row.type }));
}

// Members who can still be linked: not the member, not already linked, not a direct parent or child.
// Ancestor chains are checked by the server.
export function candidateRelatives(household, memberId) {
  const members = household?.members || [];
  const member = members.find((item) => item.id === memberId);
  if (!member) return [];
  const taken = new Set([memberId, ...connectionRowsFor(household, memberId).map((row) => row.relativeId)]);
  for (const parent of [member.motherPatientId, member.fatherPatientId]) if (parent) taken.add(parent);
  for (const other of members) if (other.motherPatientId === memberId || other.fatherPatientId === memberId) taken.add(other.id);
  return members.filter((item) => !taken.has(item.id));
}

export const describeConnection = (type, relativeName) => `${type === "spouse" ? "Spouse" : "Sibling"} of ${relativeName}`;
