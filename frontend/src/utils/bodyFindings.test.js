import test from "node:test";
import assert from "node:assert/strict";
import { formatBodyFindings, getBodyRegionLabel, normalizeBodyFindings } from "./bodyFindings.js";

test("normalizeBodyFindings drops unknown regions and blank findings", () => {
  const result = normalizeBodyFindings([
    { id: "a", region: "head", finding: "  Headache ", note: " frontal " },
    { id: "b", region: "tail", finding: "Pain" },
    { id: "c", region: "chest", finding: "   " },
    null,
  ]);
  assert.deepEqual(result, [{ id: "a", region: "head", finding: "Headache", note: "frontal" }]);
});

test("normalizeBodyFindings returns [] for non-arrays and assigns missing ids", () => {
  assert.deepEqual(normalizeBodyFindings(null), []);
  assert.deepEqual(normalizeBodyFindings("head"), []);
  const [item] = normalizeBodyFindings([{ region: "abdomen", finding: "Abdominal pain" }]);
  assert.ok(item.id);
  assert.equal(item.note, "");
});

test("normalizeBodyFindings enforces backend length and count limits", () => {
  const [item] = normalizeBodyFindings([{ id: "x", region: "pelvis", finding: "a".repeat(200), note: "b".repeat(600) }]);
  assert.equal(item.finding.length, 150);
  assert.equal(item.note.length, 500);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), region: "left_leg", finding: "Swelling" }));
  assert.equal(normalizeBodyFindings(many).length, 50);
});

test("formatBodyFindings reads as a summary line", () => {
  assert.equal(
    formatBodyFindings([
      { id: "1", region: "head", finding: "Headache", note: "2 days" },
      { id: "2", region: "right_leg", finding: "Swelling" },
    ]),
    "Head: Headache (2 days); Right leg: Swelling",
  );
  assert.equal(formatBodyFindings([]), "");
  assert.equal(getBodyRegionLabel("pelvis"), "Pelvic / reproductive");
});
