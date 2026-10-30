import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tab = readFileSync(join(here, "PatientReferralsTab.jsx"), "utf8");
const chip = readFileSync(join(here, "ProfileChip.jsx"), "utf8");

test("Referrals tab uses official referral status, not health-record Referred/Pending", () => {
  assert.match(tab, /ReferralStatusChip/);
  assert.match(tab, /View Details/);
  assert.doesNotMatch(tab, /View Referral Slip/);
  assert.doesNotMatch(tab, /ProfileStatusChip/);
  assert.match(chip, /formatReferralStatus/);
  assert.match(chip, /export function ReferralStatusChip/);
});
