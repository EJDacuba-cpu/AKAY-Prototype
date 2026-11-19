import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useDraftAutosave.js"),
  "utf8",
);

test("duplicate create pauses on the same path as a stale draft update", () => {
  assert.match(source, /code === DRAFT_VERSION_CONFLICT_CODE[\s\S]*?code === DRAFT_CONSULTATION_EXISTS_CODE[\s\S]*?pausedRef\.current = true/);
  assert.match(source, /await params\.updateDraft\(current\.id, \{ \.\.\.request, version: current\.version \}\)\s*: await params\.createDraft\(request\)/);
  assert.doesNotMatch(source, /createErr|existingVersion/);
});

test("only the rejected snapshot is blocked after validation fails", () => {
  assert.match(source, /rejectedSerializedRef\.current = attempted/);
  assert.match(source, /if \(nextSerialized === rejectedSerializedRef\.current\) return/);
  assert.match(source, /if \(pausedRef\.current\) return false/);
  assert.match(source, /Keep editing": stay paused/);
});

test("autosave distinguishes a retry delay and a save that still has a newer edit", () => {
  assert.match(source, /setStatus\("retrying"\)/);
  assert.match(source, /scheduleRetry\(attempts, err\.retryAfter\)/);
  assert.match(source, /const stillDirty = serializePayload\(latestPayloadRef\.current\) !== nextSerialized/);
  assert.match(source, /setStatus\(stillDirty \? "pending" : "saved"\)/);
});
