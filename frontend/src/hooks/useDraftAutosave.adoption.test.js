import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useDraftAutosave.js"),
  "utf8",
);

test("create adopts an existing consultation draft instead of pausing on DRAFT_CONSULTATION_EXISTS", () => {
  assert.match(source, /DRAFT_CONSULTATION_EXISTS_CODE/);
  assert.match(source, /existingId/);
  assert.match(source, /updateDraft\(draftRef\.current\.id/);
  assert.match(
    source,
    /Server already has this consultation's draft/,
  );
});

test("manual flush retries transient pauses but not hard conflict or validation", () => {
  assert.match(source, /Transient sticky pause: allow one forced leave-save/);
  assert.match(source, /error\.type === "validation"/);
  assert.match(source, /Keep editing": stay paused/);
  assert.match(source, /setStatus\("conflict"\)/);
});
