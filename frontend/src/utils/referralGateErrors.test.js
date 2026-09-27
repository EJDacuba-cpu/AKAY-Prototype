import assert from "node:assert/strict";
import test from "node:test";

import { isNoProviderAvailableError } from "./referralGateErrors.js";

test("DOC-14 block is recognised", () => {
  assert.equal(
    isNoProviderAvailableError({ status: 422, payload: { code: "NO_PROVIDER_AVAILABLE" } }),
    true,
  );
});

test("unrelated failures do not match the gate predicate", () => {
  for (const error of [
    {},
    undefined,
    { status: 500 },
    { status: 409, payload: { code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" } },
    { status: 422, payload: { errors: { urgency_level: ["required"] } } },
  ]) {
    assert.equal(isNoProviderAvailableError(error), false);
  }
});
