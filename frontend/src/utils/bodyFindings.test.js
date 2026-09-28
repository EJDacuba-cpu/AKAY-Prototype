import test from "node:test";
import assert from "node:assert/strict";
import {
  OTHER_LOCATION,
  formatBodyFindings,
  getBodyRegionLabel,
  getSpecificLocationOptions,
  normalizeBodyFindings,
  resolveSpecificLocation,
  splitSpecificLocation,
} from "./bodyFindings.js";

test("normalizeBodyFindings drops unknown regions and blank findings", () => {
  const result = normalizeBodyFindings([
    { id: "a", region: "head", location: " Forehead ", finding: "  Headache ", note: " frontal " },
    { id: "b", region: "tail", finding: "Pain" },
    { id: "c", region: "chest", finding: "   " },
    null,
  ]);
  assert.deepEqual(result, [{ id: "a", region: "head", location: "Forehead", finding: "Headache", note: "frontal" }]);
});

test("normalizeBodyFindings returns [] for non-arrays and assigns missing ids", () => {
  assert.deepEqual(normalizeBodyFindings(null), []);
  assert.deepEqual(normalizeBodyFindings("head"), []);
  const [item] = normalizeBodyFindings([{ region: "abdomen", finding: "Abdominal pain" }]);
  assert.ok(item.id);
  assert.equal(item.note, "");
  assert.equal(item.location, "");
});

test("normalizeBodyFindings enforces backend length and count limits", () => {
  const [item] = normalizeBodyFindings([
    { id: "x", region: "pelvis", location: "c".repeat(150), finding: "a".repeat(200), note: "b".repeat(600) },
  ]);
  assert.equal(item.finding.length, 150);
  assert.equal(item.note.length, 500);
  assert.equal(item.location.length, 100);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), region: "left_leg", finding: "Swelling" }));
  assert.equal(normalizeBodyFindings(many).length, 50);
});

test("formatBodyFindings reads as a summary line", () => {
  assert.equal(
    formatBodyFindings([
      { id: "1", region: "head", location: "Forehead", finding: "Headache", note: "2 days" },
      { id: "2", region: "right_leg", finding: "Swelling" },
    ]),
    "Head / Face - Forehead: Headache (2 days); Right leg: Swelling",
  );
  assert.equal(formatBodyFindings([]), "");
  assert.equal(getBodyRegionLabel("head"), "Head / Face");
  assert.equal(getBodyRegionLabel("pelvis"), "Pelvic / Groin");
});

test("getSpecificLocationOptions lists a region's places and ends with Other", () => {
  const options = getSpecificLocationOptions("abdomen");
  assert.equal(options[0].label, "Right upper quadrant");
  assert.deepEqual(options.at(-1), { value: OTHER_LOCATION, label: "Other / Specify" });
  assert.deepEqual(getSpecificLocationOptions("tail"), []);
});

test("hand and foot regions get their own location lists, separate from arm/leg", () => {
  const arm = getSpecificLocationOptions("right_arm").map((option) => option.label);
  const hand = getSpecificLocationOptions("right_hand").map((option) => option.label);
  const leg = getSpecificLocationOptions("right_leg").map((option) => option.label);
  const foot = getSpecificLocationOptions("right_foot").map((option) => option.label);
  assert.ok(arm.includes("Forearm") && !arm.includes("Fingers"));
  assert.ok(hand.includes("Fingers") && !hand.includes("Forearm"));
  assert.ok(leg.includes("Knee") && !leg.includes("Toes"));
  assert.ok(foot.includes("Toes") && !foot.includes("Knee"));
  assert.deepEqual(
    getSpecificLocationOptions("left_hand").map((option) => option.label),
    hand,
  );
});

test("split/resolveSpecificLocation round-trip listed and custom locations", () => {
  assert.deepEqual(splitSpecificLocation("left_leg", "Knee"), { choice: "Knee", other: "" });
  assert.deepEqual(splitSpecificLocation("left_leg", "Behind the knee"), { choice: OTHER_LOCATION, other: "Behind the knee" });
  assert.deepEqual(splitSpecificLocation("head", ""), { choice: "", other: "" });
  assert.equal(resolveSpecificLocation("Knee", "ignored"), "Knee");
  assert.equal(resolveSpecificLocation(OTHER_LOCATION, "  Behind the knee "), "Behind the knee");
  assert.equal(resolveSpecificLocation(OTHER_LOCATION, "  "), "");
  assert.equal(resolveSpecificLocation("", ""), "");
});
