import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const slip = readFileSync(join(here, "BhcReferralSlip.jsx"), "utf8");

test("the referral slip keeps examination findings labeled without a leading space", () => {
  assert.match(slip, />Examination findings</);
  assert.doesNotMatch(slip, /> Examination findings</);
});

test("the slip is read-only and does not repeat tracking id in the identity grid", () => {
  assert.match(slip, /readOnly/);
  assert.doesNotMatch(slip, /<Field label="Tracking ID"/);
});
