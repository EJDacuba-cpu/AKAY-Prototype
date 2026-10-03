import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_REVEAL, revealFocusReducer } from "./revealFocus.js";

const chest = { key: "front:chest", region: "chest", side: "front" };
const hand = { key: "front:right_hand", region: "right_hand", side: "front" };
const back = { key: "back:upper_back", region: "upper_back", side: "back" };
const rowA = { id: "row-a" };
const rowB = { id: "row-b" };

const pinnedOn = (area, source = "row", el) => ({ focus: { source, ...area, el }, pinned: true });

test("INITIAL_REVEAL has no focus and is not pinned", () => {
  assert.deepEqual(INITIAL_REVEAL, { focus: null, pinned: false });
});

test("hover sets focus from a row (with its element) or a marker", () => {
  assert.deepEqual(revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "row", area: chest, el: rowA }), {
    focus: { source: "row", ...chest, el: rowA },
    pinned: false,
  });
  assert.deepEqual(revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "marker", area: hand }), {
    focus: { source: "marker", ...hand, el: undefined },
    pinned: false,
  });
});

test("hover on another area replaces an unpinned focus", () => {
  const state = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "row", area: chest, el: rowA });
  const next = revealFocusReducer(state, { type: "hover", source: "marker", area: hand });
  assert.equal(next.focus.key, hand.key);
  assert.equal(next.focus.source, "marker");
});

test("leave with a matching source and key clears focus", () => {
  const marker = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "marker", area: hand });
  assert.deepEqual(revealFocusReducer(marker, { type: "leave", source: "marker", key: hand.key }), INITIAL_REVEAL);
  const row = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "row", area: chest, el: rowA });
  assert.deepEqual(revealFocusReducer(row, { type: "leave", source: "row", key: chest.key, el: rowA }), INITIAL_REVEAL);
});

test("leave with a different key, source or element is ignored", () => {
  const row = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "row", area: chest, el: rowA });
  assert.equal(revealFocusReducer(row, { type: "leave", source: "row", key: hand.key, el: rowA }), row);
  assert.equal(revealFocusReducer(row, { type: "leave", source: "row", key: chest.key, el: rowB }), row);
  assert.equal(revealFocusReducer(row, { type: "leave", source: "marker", key: chest.key }), row);
  assert.equal(revealFocusReducer(INITIAL_REVEAL, { type: "leave", source: "row", key: chest.key, el: rowA }), INITIAL_REVEAL);
});

test("hover and leave are ignored while pinned, including a marker blur", () => {
  const pinned = pinnedOn(chest, "marker");
  assert.equal(revealFocusReducer(pinned, { type: "hover", source: "row", area: hand, el: rowA }), pinned);
  assert.equal(revealFocusReducer(pinned, { type: "hover", source: "marker", area: hand }), pinned);
  // Clicking a marker focuses it; moving focus into the popover blurs it.
  assert.equal(revealFocusReducer(pinned, { type: "leave", source: "marker", key: chest.key }), pinned);
  const pinnedRow = pinnedOn(chest, "row", rowA);
  assert.equal(revealFocusReducer(pinnedRow, { type: "leave", source: "row", key: chest.key, el: rowA }), pinnedRow);
});

test("click pins the area on the side shown", () => {
  assert.deepEqual(
    revealFocusReducer(INITIAL_REVEAL, { type: "click", source: "row", area: chest, el: rowA, currentSide: "front" }),
    pinnedOn(chest, "row", rowA),
  );
  const hovered = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "marker", area: hand });
  assert.deepEqual(
    revealFocusReducer(hovered, { type: "click", source: "marker", area: hand, currentSide: "front" }),
    pinnedOn(hand, "marker"),
  );
});

test("clicking the pinned area again unpins and clears focus", () => {
  assert.deepEqual(
    revealFocusReducer(pinnedOn(chest, "marker"), { type: "click", source: "row", area: chest, el: rowA, currentSide: "front" }),
    INITIAL_REVEAL,
  );
  assert.deepEqual(
    revealFocusReducer(pinnedOn(chest, "row", rowA), { type: "click", source: "marker", area: chest, currentSide: "front" }),
    INITIAL_REVEAL,
  );
});

test("clicking another area while pinned switches the pin", () => {
  assert.deepEqual(
    revealFocusReducer(pinnedOn(chest, "row", rowA), { type: "click", source: "marker", area: hand, currentSide: "front" }),
    pinnedOn(hand, "marker"),
  );
});

test("clicking an other-side area focuses it unpinned (flip hint only) and never flips", () => {
  const next = revealFocusReducer(INITIAL_REVEAL, { type: "click", source: "row", area: back, el: rowB, currentSide: "front" });
  assert.deepEqual(next, { focus: { source: "row", ...back, el: rowB }, pinned: false });
  // From a pinned area, too: the pin is dropped for the hint.
  assert.deepEqual(
    revealFocusReducer(pinnedOn(chest), { type: "click", source: "row", area: back, el: rowB, currentSide: "front" }),
    { focus: { source: "row", ...back, el: rowB }, pinned: false },
  );
});

test("dismiss and reset clear focus and the pin", () => {
  for (const type of ["dismiss", "reset"]) {
    assert.deepEqual(revealFocusReducer(pinnedOn(chest), { type }), INITIAL_REVEAL);
    const hovered = revealFocusReducer(INITIAL_REVEAL, { type: "hover", source: "row", area: chest, el: rowA });
    assert.deepEqual(revealFocusReducer(hovered, { type }), INITIAL_REVEAL);
  }
});

test("unknown actions return the state unchanged", () => {
  const state = pinnedOn(chest);
  assert.equal(revealFocusReducer(state, { type: "nope" }), state);
});
