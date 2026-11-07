import test from "node:test";
import assert from "node:assert/strict";
import { createDraftCheckpointScheduler } from "./draftCheckpointScheduler.js";

test("continuous typing cannot postpone the device checkpoint indefinitely", () => {
  const timers = new Map(); let serial = 0; let typed = ""; const written = [];
  const scheduler = createDraftCheckpointScheduler({ write: () => written.push(typed), schedule: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; }, cancel: (id) => timers.delete(id) });
  typed = "First"; scheduler.changed(true);
  for (let index = 0; index < 50; index++) { typed += "x"; scheduler.changed(true); }
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 1500);
  [...timers.values()][0].callback();
  assert.deepEqual(written, [typed]);
});
test("returning to unchanged defaults cancels an unnecessary checkpoint", () => {
  const timers = new Map(); let writes = 0;
  const scheduler = createDraftCheckpointScheduler({ write: () => writes++, schedule: (callback) => { timers.set(1, callback); return 1; }, cancel: (id) => timers.delete(id) });
  scheduler.changed(true); scheduler.changed(false);
  assert.equal(timers.size, 0);
  scheduler.changed(true); scheduler.close();
  assert.equal(timers.size, 0);
  assert.equal(writes, 0);
});
