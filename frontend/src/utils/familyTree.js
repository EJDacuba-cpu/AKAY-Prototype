// Layout only: relationships must already be explicit. No surname, civil-status
// or relationship-to-head inference belongs here.
const CARD = { width: 184, height: 76, gap: 72, rowGap: 88, padding: 32 };

function layoutGroups(members, edges, headId, groupTypes) {
  const { width, height, gap, rowGap, padding } = CARD;
  const groupOf = new Map(members.map(member => [member.id, member.id]));
  const root = id => {
    while (groupOf.get(id) !== id) id = groupOf.get(id);
    return id;
  };
  for (const edge of edges.filter(item => groupTypes.includes(item.type))) groupOf.set(root(edge.to), root(edge.from));
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
  return { nodes, width: canvasWidth, height: Math.max(140, ...nodes.map(node => node.y + height + padding)) };
}

export const layoutFamilyTree = (members, edges, headId) => layoutGroups(members, edges, headId, ["spouse"]);
// The live BHC tree also keeps explicitly linked siblings side by side.
const HOUSEHOLD_GROUPS = ["spouse", "sibling"];
const LOOSE_COLUMNS = 6;

// The live BHC tree also keeps explicitly linked siblings side by side. Members with no saved
// connection are drawn as plain cards; when there are many they wrap into a grid below the tree.
export function layoutHouseholdTree(members, edges, headId) {
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const loose = members.filter((member) => !linked.has(member.id));
  if (loose.length <= LOOSE_COLUMNS) return layoutGroups(members, edges, headId, HOUSEHOLD_GROUPS);
  const tree = layoutGroups(members.filter((member) => linked.has(member.id)), edges, headId, HOUSEHOLD_GROUPS);
  const { width, height, gap, rowGap, padding } = CARD;
  const gridWidth = LOOSE_COLUMNS * width + (LOOSE_COLUMNS - 1) * gap;
  const canvasWidth = Math.max(tree.nodes.length ? tree.width : 0, gridWidth + padding * 2);
  const shift = (canvasWidth - (tree.nodes.length ? tree.width : 0)) / 2;
  const top = tree.nodes.length ? tree.height - padding + rowGap / 2 : padding;
  const gridLeft = (canvasWidth - gridWidth) / 2;
  const nodes = [
    ...tree.nodes.map((node) => ({ ...node, x: node.x + shift })),
    ...loose.map((member, index) => ({
      ...member, width, height,
      x: gridLeft + (index % LOOSE_COLUMNS) * (width + gap),
      y: top + Math.floor(index / LOOSE_COLUMNS) * (height + rowGap / 2),
    })),
  ];
  return { nodes, width: canvasWidth, height: Math.max(...nodes.map((node) => node.y + height)) + padding };
}
