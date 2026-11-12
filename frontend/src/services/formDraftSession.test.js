import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDraftLogout, draftLogoutDescription } from "./formDraftSession.js";

test("logout flushes only the current identity and describes unsaved server drafts", async () => {
  let flushed = 0;
  const details = await prepareDraftLogout("owner", {
    coordinators: [
      { options: { owner: "owner" }, flushBeforeLeave: async () => { flushed++; }, hasUnprotectedChanges: () => false },
      { options: { owner: "other" }, flushBeforeLeave: async () => { throw new Error("Wrong owner"); } },
    ],
  });
  assert.equal(flushed, 1);
  assert.equal(details.deviceOnlyCount, 0);
  assert.match(draftLogoutDescription(details), /Signing out keeps saved drafts/);
  assert.doesNotMatch(draftLogoutDescription(details), /device|browser|discard|deleted/i);
});

test("logout preflight is bounded and warns when unfinished input is still open", async () => {
  const details = await prepareDraftLogout("owner", {
    coordinators: [{ options: { owner: "owner" }, flushBeforeLeave: () => new Promise(() => {}), hasUnprotectedChanges: () => true }],
    timeoutMs: 1,
  });
  assert.equal(details.hasUnprotectedInput, true);
  assert.match(draftLogoutDescription(details), /may be lost/);
});
