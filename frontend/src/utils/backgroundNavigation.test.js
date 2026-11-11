import assert from "node:assert/strict";
import test from "node:test";
import { saveDraftBeforeNavigation } from "./backgroundNavigation.js";

test("Background navigation stays blocked when the server save fails", async () => {
  const events = [];
  const error = await saveDraftBeforeNavigation({
    flush: async () => { events.push("server failed"); return false; },
    protectLocal: async () => { events.push("local unavailable"); return false; },
    notifyLocal: () => events.push("notified"),
    requireServer: true,
  });
  assert.match(error, /couldn't be saved/i);
  assert.deepEqual(events, ["server failed", "local unavailable"]);
});

test("a server save permits navigation without a local fallback", async () => {
  assert.equal(await saveDraftBeforeNavigation({
    flush: async () => true,
    protectLocal: () => assert.fail("server already has the draft"),
    notifyLocal: () => assert.fail("no offline notification"),
    requireServer: true,
  }), "");
});

test("failed local protection still blocks leave when server save failed", async () => {
  assert.match(await saveDraftBeforeNavigation({
    flush: async () => false,
    protectLocal: async () => true,
    notifyLocal: () => assert.fail("device leave path removed"),
    requireServer: true,
  }), /couldn't be saved/i);
});

test("total save failure never reports that navigation is safe", async () => {
  for (const requireServer of [false, true]) {
    assert.ok(await saveDraftBeforeNavigation({
      flush: async () => false,
      protectLocal: async () => false,
      notifyLocal: () => assert.fail("nothing was saved"),
      requireServer,
    }));
  }
});

test("a rejected save propagates to the workspace error handler", async () => {
  await assert.rejects(saveDraftBeforeNavigation({
    flush: async () => { throw new Error("Save unavailable"); },
    protectLocal: () => assert.fail("unexpected recovery"),
    notifyLocal: () => assert.fail("nothing saved"),
    requireServer: true,
  }), /Save unavailable/);
});
