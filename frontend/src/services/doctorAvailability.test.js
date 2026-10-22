import test from "node:test";
import assert from "node:assert/strict";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  normalizeAvailability,
  normalizeProvider,
} from "./doctorAvailabilityModel.js";
import { isOfficialProvider } from "../utils/doctorRoster.js";

test("normalizeProvider keeps official userId from snake or camel case", () => {
  assert.equal(normalizeProvider({ id: 4, user_id: 12, name: "Dr. Official" }).userId, "12");
  assert.equal(normalizeProvider({ id: 5, userId: 9, name: "Dr. Official" }).userId, "9");
  assert.equal(isOfficialProvider(normalizeProvider({ id: 4, user_id: 12 })), true);
});

test("covering providers stay unlinked", () => {
  const covering = normalizeProvider({
    id: 1,
    user_id: null,
    name: "Dr. Covering",
    availability_status: AVAILABILITY_AVAILABLE,
  });
  assert.equal(covering.userId, null);
  assert.equal(isOfficialProvider(covering), false);
  assert.equal(normalizeProvider({ id: 2, name: "Dr. Locum" }).userId, null);
});

test("availability aggregate still comes from the server payload", () => {
  const summary = normalizeAvailability({
    rural_health_unit_id: 3,
    available_count: 1,
    total_count: 2,
    status: AVAILABILITY_UNAVAILABLE,
    can_submit_referral: true,
    providers: [{ id: 8, user_id: 4, name: "Dr. Official", availability_status: AVAILABILITY_AVAILABLE }],
  });
  assert.equal(summary.availableCount, 1);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.canSubmitReferral, true);
  assert.equal(summary.providers[0].userId, "4");
});
