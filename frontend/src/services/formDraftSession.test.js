import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDraftLogout, draftLogoutDescription } from "./formDraftSession.js";

test("logout flushes only the current identity and describes retained device-only copies", async () => {
  let flushed = 0;
  const details = await prepareDraftLogout("owner", {
    coordinators: [
      { options: { owner: "owner" }, flushBeforeLeave: async () => { flushed++; }, hasUnprotectedChanges: () => false },
      { options: { owner: "other" }, flushBeforeLeave: async () => { throw new Error("Wrong owner"); } },
    ],
    vault: { pendingForOwner: async () => [{ slot: "opaque" }] },
  });
  assert.equal(flushed, 1);
  assert.equal(details.deviceOnlyCount, 1);
  assert.match(draftLogoutDescription(details), /same account.*browser/);
  assert.doesNotMatch(draftLogoutDescription(details), /discard|deleted/);
});

test("logout preflight is bounded and never calls an unreadable vault an empty recovery list", async () => {
  const details = await prepareDraftLogout("owner", {
    coordinators: [{ options: { owner: "owner" }, flushBeforeLeave: () => new Promise(() => {}), hasUnprotectedChanges: () => true }],
    vault: { pendingForOwner: async () => { throw new Error("Storage unavailable"); } }, timeoutMs: 1,
  });
  assert.equal(details.hasUnprotectedInput, true);
  assert.equal(details.checkFailed, true);
  assert.match(draftLogoutDescription(details), /may be lost/);
});
