import assert from "node:assert/strict";
import test from "node:test";
import { saveDraftBeforeNavigation } from "./backgroundNavigation.js";

test("Background navigation stays blocked when only a device copy was saved", async () => {
  const events = [];
  const error = await saveDraftBeforeNavigation({
    flush: async () => { events.push("server failed"); return false; },
    protectLocal: async () => { events.push("device saved"); return true; },
    notifyLocal: () => events.push("leaving with device copy"),
    requireServer: true,
  });
  assert.ok(error, "must keep the workspace open until its return draft is on the server");
  assert.deepEqual(events, ["server failed", "device saved"]);
});

test("a server save permits navigation without writing another local copy", async () => {
  assert.equal(await saveDraftBeforeNavigation({
    flush: async () => true,
    protectLocal: () => assert.fail("server already has the draft"),
    notifyLocal: () => assert.fail("no offline notification"),
    requireServer: true,
  }), "");
});

test("ordinary Leave and Resume Later still permits protected device recovery", async () => {
  let notified = false;
  assert.equal(await saveDraftBeforeNavigation({
    flush: async () => false,
    protectLocal: async () => true,
    notifyLocal: () => { notified = true; },
  }), "");
  assert.equal(notified, true);
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
