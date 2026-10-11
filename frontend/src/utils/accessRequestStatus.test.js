import test from "node:test";
import assert from "node:assert/strict";
import { STATUS_OPTIONS, resetRequestStatus, inviteStatus } from "./accessRequestStatus.js";

const NOW = new Date("2026-10-12T08:00:00Z");
const inHours = (h) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();
const inMinutes = (m) => new Date(NOW.getTime() + m * 60 * 1000).toISOString();
const active = { status: "active" };
const inactive = { status: "inactive" };
const labelOf = (status) => STATUS_OPTIONS.find((option) => option.value === status).label;

const resetRow = (over) => ({ status: "pending", delivery: null, completed_via: null, expires_at: null, user: active, ...over });
const inviteRow = (over) => ({
  status: "pending",
  delivery: "sent",
  completed_via: null,
  expires_at: null,
  temp_password_expires_at: null,
  user: active,
  ...over,
});

// Every fixture carries the display_status the backend computes for that row (`display`),
// so the frontend and backend mappings cannot silently disagree.
// [name, row, backend display_status, reason, actions]
const RESET_ROWS = [
  ["pending", resetRow({ status: "pending" }), "pending", "Awaiting approval", ["approve", "decline"]],
  ["approved + failed", resetRow({ status: "approved", delivery: "failed" }), "pending", "Email not sent", ["resend", "copy"]],
  ["expired", resetRow({ status: "expired" }), "pending", "Link expired", ["resend"]],
  [
    "approved + sent",
    resetRow({ status: "approved", delivery: "sent", expires_at: inMinutes(45) }),
    "in_progress",
    "Link sent · expires in 45 min",
    ["resend", "copy"],
  ],
  [
    "approved + copied",
    resetRow({ status: "approved", delivery: "copied", expires_at: inMinutes(45) }),
    "in_progress",
    "Link shared by the MHO · expires in 45 min",
    ["resend", "copy"],
  ],
  [
    "approved before delivery was recorded (delivery null)",
    resetRow({ status: "approved", delivery: null, expires_at: inMinutes(45) }),
    "in_progress",
    "Link sent · expires in 45 min",
    ["resend", "copy"],
  ],
  ["completed via link", resetRow({ status: "completed", completed_via: "link" }), "complete", "Password set", []],
  [
    "completed via invite",
    resetRow({ status: "completed", completed_via: "invite" }),
    "complete",
    "Completed through the account invite",
    [],
  ],
  [
    "completed via temporary password",
    resetRow({ status: "completed", completed_via: "temporary_password" }),
    "complete",
    "Completed through a temporary password",
    [],
  ],
  ["rejected", resetRow({ status: "rejected" }), "cancelled", "Declined", []],
  ["pending, account inactive", resetRow({ status: "pending", user: inactive }), "cancelled", "Account deactivated", []],
  [
    "approved, account inactive",
    resetRow({ status: "approved", delivery: "sent", user: inactive }),
    "cancelled",
    "Account deactivated",
    [],
  ],
  ["expired, account inactive", resetRow({ status: "expired", user: inactive }), "cancelled", "Account deactivated", []],
  [
    "completed on an inactive account stays complete",
    resetRow({ status: "completed", completed_via: "link", user: inactive }),
    "complete",
    "Password set",
    [],
  ],
];

for (const [name, row, status, reason, actions] of RESET_ROWS) {
  test(`reset request: ${name}`, () => {
    assert.deepEqual(resetRequestStatus(row, NOW), { status, label: labelOf(status), reason, actions });
  });
}

test("reset request: status equals the backend display_status for every F2 row", () => {
  for (const [name, row, display] of RESET_ROWS) {
    assert.equal(resetRequestStatus(row, NOW).status, display, name);
  }
});

const INVITE_ROWS = [
  [
    "pending + failed",
    inviteRow({ status: "pending", delivery: "failed" }),
    "pending",
    "Email not sent",
    ["resend", "copy", "editEmail", "temporaryPassword"],
  ],
  ["expired", inviteRow({ status: "expired" }), "pending", "Link expired", ["resend", "editEmail", "temporaryPassword"]],
  [
    "temporary, past its expiry",
    inviteRow({ status: "temporary", delivery: null, temp_password_expires_at: inMinutes(-5) }),
    "pending",
    "Temporary password expired",
    ["resend", "temporaryPassword"],
  ],
  [
    "temporary, no expiry (cannot sign in, so expired)",
    inviteRow({ status: "temporary", delivery: null, temp_password_expires_at: null }),
    "pending",
    "Temporary password expired",
    ["resend", "temporaryPassword"],
  ],
  [
    "pending + sent",
    inviteRow({ status: "pending", delivery: "sent", expires_at: inHours(41) }),
    "in_progress",
    "Link sent · expires in 41 h",
    ["resend", "copy", "editEmail", "temporaryPassword"],
  ],
  [
    "pending + copied",
    inviteRow({ status: "pending", delivery: "copied", expires_at: inHours(41) }),
    "in_progress",
    "Link shared by the MHO · expires in 41 h",
    ["resend", "copy", "editEmail", "temporaryPassword"],
  ],
  [
    "temporary, still valid",
    inviteRow({ status: "temporary", delivery: null, temp_password_expires_at: inHours(10) }),
    "in_progress",
    "Temporary password issued",
    ["temporaryPassword"],
  ],
  ["completed via link", inviteRow({ status: "completed", completed_via: "link" }), "complete", "Password set", []],
  [
    "completed via temporary password",
    inviteRow({ status: "completed", completed_via: "temporary_password" }),
    "complete",
    "Temporary password changed",
    [],
  ],
  [
    "completed via reset",
    inviteRow({ status: "completed", completed_via: "reset" }),
    "complete",
    "Completed through a password reset",
    [],
  ],
  ["pending, account inactive", inviteRow({ status: "pending", user: inactive }), "cancelled", "Account deactivated", []],
  ["expired, account inactive", inviteRow({ status: "expired", user: inactive }), "cancelled", "Account deactivated", []],
  [
    "temporary, account inactive",
    inviteRow({ status: "temporary", temp_password_expires_at: inHours(10), user: inactive }),
    "cancelled",
    "Account deactivated",
    [],
  ],
  [
    "completed on an inactive account stays complete",
    inviteRow({ status: "completed", completed_via: "link", user: inactive }),
    "complete",
    "Password set",
    [],
  ],
];

for (const [name, row, status, reason, actions] of INVITE_ROWS) {
  test(`invite: ${name}`, () => {
    assert.deepEqual(inviteStatus(row, NOW), { status, label: labelOf(status), reason, actions });
  });
}

test("invite: status equals the backend display_status for every F2 row", () => {
  for (const [name, row, display] of INVITE_ROWS) {
    assert.equal(inviteStatus(row, NOW).status, display, name);
  }
});

test("the spec example: a failed invite email is Pending with all four actions", () => {
  assert.deepEqual(inviteStatus({ status: "pending", delivery: "failed", user: { status: "active" } }, NOW), {
    status: "pending",
    label: "Pending",
    reason: "Email not sent",
    actions: ["resend", "copy", "editEmail", "temporaryPassword"],
  });
});

test("status options carry the four labels", () => {
  assert.deepEqual(STATUS_OPTIONS, [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In progress" },
    { value: "complete", label: "Complete" },
    { value: "cancelled", label: "Cancelled" },
  ]);
});

test("expires in: hours when an hour or more is left, minutes below that", () => {
  const sent = (over) => resetRow({ status: "approved", delivery: "sent", ...over });
  assert.equal(resetRequestStatus(sent({ expires_at: inHours(41) }), NOW).reason, "Link sent · expires in 41 h");
  assert.equal(resetRequestStatus(sent({ expires_at: inMinutes(25) }), NOW).reason, "Link sent · expires in 25 min");
  assert.equal(inviteStatus(inviteRow({ delivery: "sent", expires_at: inHours(41) }), NOW).reason, "Link sent · expires in 41 h");
  assert.equal(inviteStatus(inviteRow({ delivery: "sent", expires_at: inMinutes(25) }), NOW).reason, "Link sent · expires in 25 min");
});

test("expires in: a time already past shows 0 min, never a negative number", () => {
  const result = resetRequestStatus(resetRow({ status: "approved", delivery: "sent", expires_at: inMinutes(-30) }), NOW);
  assert.equal(result.status, "in_progress");
  assert.equal(result.reason, "Link sent · expires in 0 min");
});

test("expires in: a missing expiry leaves the reason without a time", () => {
  assert.equal(inviteStatus(inviteRow({ delivery: "sent", expires_at: null }), NOW).reason, "Link sent");
});

test("the inactive-account check wins over a failed delivery", () => {
  const result = inviteStatus(inviteRow({ status: "pending", delivery: "failed", user: inactive }), NOW);
  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.actions, []);
});

test("now defaults to the current time", () => {
  const soon = new Date(Date.now() + 25 * 60 * 1000 + 30 * 1000).toISOString();
  assert.match(inviteStatus(inviteRow({ delivery: "sent", expires_at: soon })).reason, /^Link sent · expires in 2[5-6] min$/);
});
