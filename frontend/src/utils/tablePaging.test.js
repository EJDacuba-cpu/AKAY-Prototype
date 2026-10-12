import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPage,
  hasMoreItems,
  nextVisibleCount,
  pageCount,
  resetKeyOf,
  sliceRows,
  tableBodyHeight,
  tableEmptyHeight,
} from "./tablePaging.js";

const rows = Array.from({ length: 25 }, (_, index) => index + 1);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test("pageCount never drops below one page and rounds up per ten rows", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(10), 1);
  assert.equal(pageCount(11), 2);
  assert.equal(pageCount(20), 2);
  assert.equal(pageCount(21), 3);
  assert.equal(pageCount(25), 3);
});

test("clampPage keeps the page inside 1..totalPages", () => {
  assert.equal(clampPage(5, 2), 2);
  assert.equal(clampPage(0, 3), 1);
  assert.equal(clampPage(Number.NaN, 3), 1);
  assert.equal(clampPage(2, 0), 1);
  assert.equal(clampPage(2.7, 3), 2);
});

test("sliceRows returns ten rows per page and falls back to the last page", () => {
  assert.deepEqual(sliceRows(rows, 1), range(1, 10));
  assert.deepEqual(sliceRows(rows, 3), range(21, 25));
  assert.deepEqual(sliceRows(rows, 9), range(21, 25));
  assert.deepEqual(sliceRows([], 1), []);
});

test("table heights follow the 44px header and 56px rows", () => {
  assert.equal(tableBodyHeight(), 604);
  assert.equal(tableEmptyHeight(), 560);
  assert.equal(tableBodyHeight(2), 156);
});

test("nextVisibleCount and hasMoreItems drive the Load more button", () => {
  assert.equal(nextVisibleCount(10, 10, 25), 20);
  assert.equal(nextVisibleCount(20, 10, 25), 25);
  assert.equal(nextVisibleCount(10, 10, 4), 4);
  assert.equal(hasMoreItems(10, 25), true);
  assert.equal(hasMoreItems(25, 25), false);
  assert.equal(hasMoreItems(30, 25), false);
});

test("resetKeyOf tells two tabs apart even when their filter objects are equal", () => {
  const defaults = { search: "", status: "All" };

  assert.notEqual(resetKeyOf("bhc", defaults), resetKeyOf("rhu", defaults));
  assert.equal(resetKeyOf("bhc", defaults), resetKeyOf("bhc", { ...defaults }));
  assert.notEqual(resetKeyOf("bhc", defaults), resetKeyOf("bhc", { ...defaults, search: "para" }));
});
