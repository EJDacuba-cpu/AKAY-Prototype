import { patientName } from "../services/familyRegistry.js";

// Head first, then oldest to youngest (missing birth dates last), then by name.
export function sortMembers(members = [], headId) {
  return [...members].sort((a, b) =>
    Number(b.id === headId) - Number(a.id === headId)
    || (a.birthDate || "9999-12-31").localeCompare(b.birthDate || "9999-12-31")
    || patientName(a).localeCompare(patientName(b)));
}

// Edges come only from saved data: mother/father links and explicit spouse/sibling rows.
// Relationship-to-head labels never create an edge.
export function buildFamilyGraph(household) {
  const members = household?.members || [];
  const ids = new Set(members.map((member) => member.id));
  const edges = new Map();
  for (const member of members) {
    for (const parent of [member.motherPatientId, member.fatherPatientId]) {
      if (parent && parent !== member.id && ids.has(parent)) edges.set(`parent:${parent}:${member.id}`, { from: parent, to: member.id, type: "parent" });
    }
  }
  for (const row of household?.relationships || []) {
    if (["spouse", "sibling"].includes(row.type) && row.patientId !== row.relativeId && ids.has(row.patientId) && ids.has(row.relativeId)) {
      edges.set(`${row.type}:${row.id}`, { from: row.patientId, to: row.relativeId, type: row.type, id: row.id });
    }
  }
  return { members: sortMembers(members, household?.headPatientId), edges: [...edges.values()] };
}
