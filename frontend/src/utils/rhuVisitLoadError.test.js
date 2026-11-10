import assert from "node:assert/strict";
import test from "node:test";
import { rhuVisitLoadError, visitUnavailableError } from "./rhuVisitLoadError.js";

test("timeout and network failures stay retryable with load copy", () => {
  const timeout = rhuVisitLoadError({ isTimeout: true, code: "TIMEOUT", message: "The server is taking too long to respond. Please try again in a moment." });
  assert.equal(timeout.kind, "load");
  assert.equal(timeout.title, "Unable to load consultation");
  assert.equal(timeout.retryable, true);
  assert.equal(timeout.variant, "timeout");

  const network = rhuVisitLoadError({ isNetworkError: true, code: "NETWORK_ERROR" });
  assert.equal(network.retryable, true);
  assert.equal(network.title, "Unable to load consultation");
  assert.equal(network.variant, "unreachable");
});

test("invalid or closed visit states are not retryable", () => {
  const unavailable = rhuVisitLoadError(visitUnavailableError("Start this consultation from Today's Queue."));
  assert.equal(unavailable.kind, "unavailable");
  assert.equal(unavailable.title, "Consultation not available");
  assert.equal(unavailable.retryable, false);
});

test("unauthorized visit loads do not offer retry", () => {
  const forbidden = rhuVisitLoadError({ status: 403, message: "This action is unauthorized." });
  assert.equal(forbidden.kind, "forbidden");
  assert.equal(forbidden.retryable, false);
  assert.equal(forbidden.variant, "forbidden");

  const unauthenticated = rhuVisitLoadError({ status: 401 });
  assert.equal(unauthenticated.retryable, false);
  assert.equal(unauthenticated.kind, "forbidden");
});
