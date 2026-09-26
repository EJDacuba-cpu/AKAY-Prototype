// frontend/scripts/ehr-restyle.mjs
// One-off: rewrite legacy slate / hex / rounded / shadow classes to the
// medical-ehr-minimalism equivalents. Idempotent. Removed in the last task.
import fs from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/ehr-restyle.mjs <file...>");
  process.exit(1);
}

const HEX_TO_TOKEN = {
  b91c1c: "red-600",
  "991b1b": "red-700",
  "7f1d1d": "red-800",
  fef2f2: "red-50",
  fecaca: "red-200",
  "0f172a": "gray-900",
  f8fafc: "gray-50",
  "94a3b8": "gray-400",
  "475569": "gray-600",
  "64748b": "gray-500",
  e2e8f0: "gray-200",
  cbd5e1: "gray-300",
};

// Each rule: [pattern, replacer, label]. Applied to the whole file text.
const RULES = [
  [
    /-\[#([0-9a-fA-F]{6})\]/g,
    (match, hex) => {
      const token = HEX_TO_TOKEN[hex.toLowerCase()];
      return token ? `-${token}` : match;
    },
    "hex",
  ],
  [/\bslate-(\d{2,3})\b/g, "gray-$1", "slate"],
  [/\brounded-(t|b|l|r|tl|tr|bl|br)-(?:md|lg|xl|2xl|3xl)\b/g, "rounded-$1-none", "rounded-side"],
  [/\brounded-(?:md|lg|xl|2xl|3xl)\b/g, "rounded-none", "rounded"],
  [/(?<=[\s"'`])rounded(?=[\s"'`])/g, "rounded-none", "rounded-bare"],
  [/\bhover:-translate-y-0\.5\b/g, "", "lift"],
  [/\bbackdrop-blur(?:-[a-z0-9]+)?\b/g, "", "blur"],
  // Shadows: drop the flat-by-token ones (with any variant prefix). shadow-lg/xl
  // stay: they mark floating layers.
  [/(?:[\w-]+:)*shadow-(?:xs|sm|md)(?:\/\d+)?\b/g, "", "shadow"],
  [/\bshadow-black\/\[[^\]]+\]/g, "", "shadow-tint"],
];

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const counts = {};
  const lines = before.split("\n").map((line) => {
    let next = line;
    for (const [pattern, replacer, label] of RULES) {
      const replaced = next.replace(pattern, replacer);
      if (replaced !== next) counts[label] = (counts[label] || 0) + 1;
      next = replaced;
    }
    // Only touch spacing on lines we changed, and never indentation.
    if (next !== line) next = next.replace(/(?<=\S) {2,}(?=\S)/g, " ");
    return next;
  });
  const after = lines.join("\n");
  if (after !== before) fs.writeFileSync(file, after);
  console.log(`${file}: ${JSON.stringify(counts)}`);
}
