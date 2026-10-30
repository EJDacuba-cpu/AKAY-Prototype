import test from "node:test";
import assert from "node:assert/strict";
import { errorStateVariant } from "./errorStateVariant.js";

test("only a device that is really offline is called offline", () => {
  assert.equal(errorStateVariant({ isOffline: true, code: "OFFLINE" }), "offline");
});

test("a server that cannot be reached is not blamed on the device", () => {
  assert.equal(errorStateVariant({ isNetworkError: true, code: "NETWORK_ERROR" }), "unreachable");
  assert.equal(errorStateVariant({ status: 502 }), "unreachable");
  assert.equal(errorStateVariant({ status: 503 }), "unreachable");
});

test("timeouts, forbidden and other failures keep their variants", () => {
  assert.equal(errorStateVariant({ isTimeout: true, code: "TIMEOUT" }), "timeout");
  assert.equal(errorStateVariant({ status: 403 }), "forbidden");
  assert.equal(errorStateVariant({ status: 500 }), "error");
  assert.equal(errorStateVariant(null), "error");
});
