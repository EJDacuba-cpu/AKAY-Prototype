import test from "node:test";
import assert from "node:assert/strict";
import { accountAccessBlocks, actionLabel, RESET_CONFIRM } from "./accountAccess.js";

const now = new Date("2026-10-12T08:00:00Z");
const hoursFromNow = (hours) => new Date(now.getTime() + hours * 3600000).toISOString();
const active = { status: "Active" };
const owner = { status: "active" };

const openInvite = { status: "pending", delivery: "sent", expires_at: hoursFromNow(40), user: owner };
const resetRow = (extra) => ({ status: "pending", delivery: null, expires_at: null, user: owner, ...extra });

test("an open invite: Resend invite primary, Copy link and Edit email links, temporary password fallback", () => {
  const { message, blocks } = accountAccessBlocks({ account: active, invite: openInvite, resetRequest: null }, now);
  assert.equal(message, null);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "invite");
  assert.equal(blocks[0].primary, "resend");
  assert.deepEqual(blocks[0].links, ["copy", "editEmail"]);
  assert.equal(blocks[0].fallback, "temporaryPassword");
  assert.equal(blocks[0].status.status, "in_progress");
});

test("an expired invite keeps Resend invite as primary", () => {
  const invite = { ...openInvite, status: "expired" };
  const [block] = accountAccessBlocks({ account: active, invite, resetRequest: null }, now).blocks;
  assert.equal(block.primary, "resend");
  assert.deepEqual(block.links, ["editEmail"]);
  assert.equal(block.fallback, "temporaryPassword");
  assert.equal(block.status.status, "pending");
});

test("an active temporary password offers only a new one", () => {
  const invite = { ...openInvite, status: "temporary", temp_password_expires_at: hoursFromNow(30) };
  const [block] = accountAccessBlocks({ account: active, invite, resetRequest: null }, now).blocks;
  assert.equal(block.primary, null);
  assert.deepEqual(block.links, []);
  assert.equal(block.fallback, "temporaryPassword");
});

test("a complete invite shows its reason and no controls", () => {
  const invite = { ...openInvite, status: "completed", completed_via: "temporary_password" };
  const [block] = accountAccessBlocks({ account: active, invite, resetRequest: null }, now).blocks;
  assert.equal(block.status.status, "complete");
  assert.equal(block.status.reason, "Temporary password changed");
  assert.equal(block.primary, null);
  assert.deepEqual(block.links, []);
  assert.equal(block.fallback, null);
});

test("a pending reset request: Approve primary, Decline link", () => {
  const [block] = accountAccessBlocks({ account: active, invite: null, resetRequest: resetRow() }, now).blocks;
  assert.equal(block.kind, "reset");
  assert.equal(block.primary, "approve");
  assert.deepEqual(block.links, ["decline"]);
  assert.equal(block.fallback, null);
});

test("an approved reset request: Resend link primary, Copy link", () => {
  const resetRequest = resetRow({ status: "approved", delivery: "sent", expires_at: hoursFromNow(1) });
  const [block] = accountAccessBlocks({ account: active, invite: null, resetRequest }, now).blocks;
  assert.equal(block.primary, "resend");
  assert.deepEqual(block.links, ["copy"]);
});

test("both open: invite block first, then reset block", () => {
  const { blocks } = accountAccessBlocks({ account: active, invite: openInvite, resetRequest: resetRow() }, now);
  assert.deepEqual(blocks.map((block) => block.kind), ["invite", "reset"]);
});

test("an inactive account shows the deactivated message and no blocks", () => {
  const result = accountAccessBlocks({ account: { status: "Inactive" }, invite: openInvite, resetRequest: resetRow() }, now);
  assert.equal(result.message, "Account deactivated. No access actions.");
  assert.deepEqual(result.blocks, []);
});

test("no invite and no reset request: password set by the user", () => {
  const result = accountAccessBlocks({ account: active, invite: null, resetRequest: null }, now);
  assert.equal(result.message, "Password set by the user.");
  assert.deepEqual(result.blocks, []);
});

test("labels and reset confirmation copy", () => {
  assert.equal(actionLabel("invite", "resend"), "Resend invite");
  assert.equal(actionLabel("reset", "resend"), "Resend link");
  assert.equal(actionLabel("invite", "temporaryPassword"), "Generate temporary password");
  assert.equal(actionLabel("reset", "approve"), "Approve");
  assert.equal(RESET_CONFIRM.decline.title, "Decline this reset request?");
  assert.equal(RESET_CONFIRM.approve.confirmText, "Approve and send link");
});
