import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailableAlternatives,
  isNoProviderAvailableError,
  isPreferredProviderInvalidError,
  isPreferredProviderUnavailableError,
} from "./referralGateErrors.js";

const noProvider = { status: 422, payload: { code: "NO_PROVIDER_AVAILABLE" } };
const preferredUnavailable = {
  status: 409,
  payload: {
    code: "PREFERRED_PROVIDER_UNAVAILABLE",
    provider: { id: 7, name: "Dr. Preferred", remarks: "Back Monday" },
    available_alternatives: [{ id: 9, name: "Dr. Free" }],
  },
};
const preferredInvalid = {
  status: 422,
  payload: { code: "PREFERRED_PROVIDER_INVALID" },
};

test("DOC-14 block is recognised", () => {
  assert.equal(isNoProviderAvailableError(noProvider), true);
  assert.equal(isPreferredProviderUnavailableError(noProvider), false);
  assert.equal(isPreferredProviderInvalidError(noProvider), false);
});

test("Decision A warning is recognised and is distinct from the hard block", () => {
  assert.equal(isPreferredProviderUnavailableError(preferredUnavailable), true);
  // Critical: a Decision A warning must never be treated as DOC-14, or the UI
  // would offer Continue Anyway on an unconditional block.
  assert.equal(isNoProviderAvailableError(preferredUnavailable), false);
});

test("invalid preference is distinct from both other outcomes", () => {
  assert.equal(isPreferredProviderInvalidError(preferredInvalid), true);
  assert.equal(isNoProviderAvailableError(preferredInvalid), false);
  assert.equal(isPreferredProviderUnavailableError(preferredInvalid), false);
});

test("unrelated failures match no gate predicate", () => {
  for (const error of [
    {},
    undefined,
    { status: 500 },
    { status: 409, payload: { code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" } },
    { status: 422, payload: { errors: { urgency_level: ["required"] } } },
  ]) {
    assert.equal(isNoProviderAvailableError(error), false);
    assert.equal(isPreferredProviderUnavailableError(error), false);
    assert.equal(isPreferredProviderInvalidError(error), false);
  }
});

test("alternatives are always an array", () => {
  assert.deepEqual(getAvailableAlternatives(preferredUnavailable), [
    { id: 9, name: "Dr. Free" },
  ]);
  assert.deepEqual(getAvailableAlternatives(noProvider), []);
  assert.deepEqual(getAvailableAlternatives({}), []);
});
