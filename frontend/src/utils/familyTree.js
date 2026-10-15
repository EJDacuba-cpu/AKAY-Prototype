// Layout only: relationships must already be explicit. No surname, civil-status
// or relationship-to-head inference belongs here.
export function layoutFamilyTree(members, edges, headId) {
  const width = 216, height = 112, gap = 88, rowGap = 100, padding = 32;
  const groupOf = new Map(members.map(member => [member.id, member.id]));
  const root = id => {
    while (groupOf.get(id) !== id) id = groupOf.get(id);
    return id;
  };
  for (const edge of edges.filter(item => item.type === "spouse")) groupOf.set(root(edge.to), root(edge.from));
  const groups = new Map();
  for (const member of members) {
    const key = root(member.id);
    if (!groups.has(key)) groups.set(key, { id: key, members: [], level: 0 });
    groups.get(key).members.push(member);
  }
  const parentEdges = edges.filter(edge => edge.type === "parent");
  // Repeated relaxation handles arbitrary insertion order and multiple parents.
  // A bounded pass prevents invalid imported graphs from hanging the UI.
  for (let pass = 0; pass < groups.size; pass++) {
    let changed = false;
    for (const edge of parentEdges) {
      const parent = groups.get(root(edge.from)), child = groups.get(root(edge.to));
      if (parent !== child && child.level <= parent.level) { child.level = parent.level + 1; changed = true; }
    }
    if (!changed) break;
  }
  const rows = new Map();
  for (const group of groups.values()) {
    group.members.sort((a, b) => Number(b.id === headId) - Number(a.id === headId));
    if (!rows.has(group.level)) rows.set(group.level, []);
    rows.get(group.level).push(group);
  }
  const rowWidth = row => row.reduce((total, group) => total + group.members.length * width + (group.members.length - 1) * gap, 0) + Math.max(0, row.length - 1) * gap;
  const canvasWidth = Math.max(640, ...[...rows.values()].map(rowWidth)) + padding * 2;
  const nodes = [];
  [...rows.entries()].sort(([a], [b]) => a - b).forEach(([level, row]) => {
    let x = (canvasWidth - rowWidth(row)) / 2;
    for (const group of row) for (const member of group.members) {
      nodes.push({ ...member, x, y: padding + level * (height + rowGap), width, height });
      x += width + gap;
    }
  });
  return { nodes, width: canvasWidth, height: Math.max(240, ...nodes.map(node => node.y + height + padding)) };
}
