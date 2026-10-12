import test from "node:test";
import assert from "node:assert/strict";
import { SKELETON_VARIANTS, resolveSkeletonVariant } from "./skeletonVariant.js";

test("every allowed skeleton maps to itself", () => {
  for (const name of SKELETON_VARIANTS) assert.equal(resolveSkeletonVariant(name), name);
  assert.equal(SKELETON_VARIANTS.length, 11);
});

test("an unknown or missing skeleton falls back to module, never blank", () => {
  assert.equal(resolveSkeletonVariant("tabel"), "module");
  assert.equal(resolveSkeletonVariant(undefined), "module");
  assert.equal(resolveSkeletonVariant(""), "module");
});
