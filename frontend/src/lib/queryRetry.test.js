import test from "node:test";
import assert from "node:assert/strict";
import { shouldRetryQuery } from "./queryRetry.js";

test("does not retry HTTP 429 rate limits", () => {
  assert.equal(shouldRetryQuery(0, { status: 429 }), false);
});

test("does not retry terminal client errors", () => {
  assert.equal(shouldRetryQuery(0, { status: 401 }), false);
  assert.equal(shouldRetryQuery(0, { status: 403 }), false);
  assert.equal(shouldRetryQuery(0, { status: 404 }), false);
  assert.equal(shouldRetryQuery(0, { status: 422 }), false);
});

test("retries a transient failure once", () => {
  assert.equal(shouldRetryQuery(0, { status: 503 }), true);
  assert.equal(shouldRetryQuery(1, { status: 503 }), false);
  assert.equal(shouldRetryQuery(0, { isNetworkError: true }), true);
});
