import test from "node:test";
import assert from "node:assert/strict";
import { getNotificationCategory } from "./notificationCategory.js";

test("Admin access alerts stay in System even if a name or message contains clinical keywords", () => {
  for (const type of ["password_reset_request", "account_invite_delivery_failed"]) {
    for (const message of ["Referral User", "No Show User", "Medicine User", "Expired link"]) {
      assert.equal(getNotificationCategory({ type, message }), "system");
    }
  }
});

test("existing BHC/RHU notification classification is preserved", () => {
  for (const [type, category] of [["incoming_referral", "referrals"], ["follow_up_due_today", "followups"],
    ["account_created", "system"], ["referral_hold_available", "referrals"], ["medicine", "medicine"]]) {
    assert.equal(getNotificationCategory({ type }), category);
  }
});
