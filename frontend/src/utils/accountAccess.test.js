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
const inviteMenu = (row) => menuSections("invite", inviteStatus(row, now).actions);
const resetMenu = (row) => menuSections("reset", resetRequestStatus(row, now).actions);

/** [[label, [[action, enabled], ...]], ...] so a test reads as the menu does. */
const view = (sections) => sections.map((section) => [section.label, section.items.map((item) => [item.action, item.enabled])]);

test("an open invite: every invite control is active", () => {
  assert.deepEqual(view(inviteMenu(openInvite)), [
    [null, [["resend", true], ["copy", true]]],
    [OTHER, [["temporaryPassword", true]]],
  ]);
});

test("an expired invite: Copy link is greyed, the rest active", () => {
  assert.deepEqual(view(inviteMenu({ ...openInvite, status: "expired" })), [
    [null, [["resend", true], ["copy", false]]],
    [OTHER, [["temporaryPassword", true]]],
  ]);
});

test("an active temporary password: only Generate temporary password is active", () => {
  const invite = { ...openInvite, status: "temporary", temp_password_expires_at: hoursFromNow(30) };
  assert.deepEqual(view(inviteMenu(invite)), [
    [null, [["resend", false], ["copy", false]]],
    [OTHER, [["temporaryPassword", true]]],
  ]);
});

test("a pending reset request: Approve and Decline are active", () => {
  assert.deepEqual(view(resetMenu(resetRow())), [
    [null, [["approve", true], ["decline", true], ["resend", false], ["copy", false]]],
  ]);
});

test("an approved reset request: Resend link and Copy link are active", () => {
  const row = resetRow({ status: "approved", delivery: "sent", expires_at: hoursFromNow(1) });
  assert.deepEqual(view(resetMenu(row)), [
    [null, [["approve", false], ["decline", false], ["resend", true], ["copy", true]]],
  ]);
});

test("an expired reset request: only Resend link is active", () => {
  const sections = resetMenu(resetRow({ status: "expired" }));
  assert.deepEqual(sections[0].items.filter((item) => item.enabled).map((item) => item.action), ["resend"]);
});

test("complete, declined and cancelled rows keep the menu with every control greyed", () => {
  const allDisabled = (sections) => sections.every((section) => section.items.every((item) => !item.enabled));
  assert.ok(allDisabled(inviteMenu({ ...openInvite, status: "completed" })));
  assert.ok(allDisabled(inviteMenu({ ...openInvite, user: { status: "inactive" } })));
  assert.ok(allDisabled(resetMenu(resetRow({ status: "rejected" }))));
  assert.ok(allDisabled(resetMenu(resetRow({ user: null }))));
  assert.equal(inviteMenu({ ...openInvite, status: "completed" }).flatMap((section) => section.items).length, 3);
});

test("Edit email is never listed", () => {
  const listed = [...menuSections("invite", ["editEmail"]), ...menuSections("reset", ["editEmail"])]
    .flatMap((section) => section.items.map((item) => item.action));
  assert.ok(!listed.includes("editEmail"));
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
