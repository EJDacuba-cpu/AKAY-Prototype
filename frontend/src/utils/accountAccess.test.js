import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_CONFIRM, actionLabel, menuSections } from "./accountAccess.js";
import { inviteStatus, resetRequestStatus } from "./accessRequestStatus.js";

const now = new Date("2026-10-12T08:00:00Z");
const hoursFromNow = (hours) => new Date(now.getTime() + hours * 3600000).toISOString();
const owner = { status: "active" };

const openInvite = { status: "pending", delivery: "sent", expires_at: hoursFromNow(40), user: owner };
const resetRow = (extra) => ({ status: "pending", delivery: null, expires_at: null, user: owner, ...extra });

const OTHER = "Other ways to sign in";
const inviteMenu = (row) => menuSections(inviteStatus(row, now).actions);
const resetMenu = (row) => menuSections(resetRequestStatus(row, now).actions);

test("an open invite: Resend, Copy link, then Other ways to sign in with Generate temporary password", () => {
  assert.deepEqual(inviteMenu(openInvite), [
    { label: null, actions: ["resend", "copy"] },
    { label: OTHER, actions: ["temporaryPassword"] },
  ]);
});

test("an expired invite: Resend, then Generate temporary password", () => {
  assert.deepEqual(inviteMenu({ ...openInvite, status: "expired" }), [
    { label: null, actions: ["resend"] },
    { label: OTHER, actions: ["temporaryPassword"] },
  ]);
});

test("an active temporary password: only Generate temporary password", () => {
  const invite = { ...openInvite, status: "temporary", temp_password_expires_at: hoursFromNow(30) };
  assert.deepEqual(inviteMenu(invite), [{ label: OTHER, actions: ["temporaryPassword"] }]);
});

test("Edit email is never listed", () => {
  const sections = menuSections(["resend", "copy", "editEmail", "temporaryPassword"]);
  assert.ok(sections.every((section) => !section.actions.includes("editEmail")));
});

test("a pending reset request: Approve, Decline", () => {
  assert.deepEqual(resetMenu(resetRow()), [{ label: null, actions: ["approve", "decline"] }]);
});

test("an approved reset request: Resend link, Copy link", () => {
  const row = resetRow({ status: "approved", delivery: "sent", expires_at: hoursFromNow(1) });
  assert.deepEqual(resetMenu(row), [{ label: null, actions: ["resend", "copy"] }]);
});

test("complete, declined and cancelled rows have no menu", () => {
  assert.deepEqual(inviteMenu({ ...openInvite, status: "completed" }), []);
  assert.deepEqual(inviteMenu({ ...openInvite, user: { status: "inactive" } }), []);
  assert.deepEqual(resetMenu(resetRow({ status: "rejected" })), []);
  assert.deepEqual(resetMenu(resetRow({ user: null })), []);
});

test("confirmation copy", () => {
  assert.equal(ACTION_CONFIRM.invite.temporaryPassword.description, "Any invite link stops working.");
  assert.equal(ACTION_CONFIRM.reset.decline.title, "Decline this reset request?");
  assert.equal(ACTION_CONFIRM.reset.approve.confirmText, "Approve and send link");
  assert.equal(ACTION_CONFIRM.invite.resend.title, "Resend invite?");
  assert.equal(ACTION_CONFIRM.reset.resend.title, "Resend reset link?");
  assert.equal(ACTION_CONFIRM.invite.copy.confirmText, "Copy link");
  assert.ok(ACTION_CONFIRM.invite.resend.description.includes("{email}"));
});

test("labels", () => {
  assert.equal(actionLabel("invite", "resend"), "Resend invite");
  assert.equal(actionLabel("reset", "resend"), "Resend link");
  assert.equal(actionLabel("invite", "temporaryPassword"), "Generate temporary password");
  assert.equal(actionLabel("reset", "approve"), "Approve");
  assert.equal(actionLabel("reset", "decline"), "Decline");
  assert.equal(actionLabel("invite", "copy"), "Copy link");
});
