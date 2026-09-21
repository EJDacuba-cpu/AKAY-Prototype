import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptConsultationUuid,
  ensureConsultationUuid,
  normalizeConsultationUuid,
} from "./consultationIdentity.js";
import { createIdempotencyKey, createUuid } from "./idempotency.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXISTING = "33333333-3333-4333-8333-333333333333";

/** A generator that records every call, so "never minted" is provable. */
function countingGenerator() {
  let calls = 0;
  const generate = () => {
    calls += 1;
    return `44444444-4444-4444-8444-${String(calls).padStart(12, "0")}`;
  };
  return { generate, calls: () => calls };
}

test("createUuid produces an RFC 4122 v4 uuid", () => {
  for (let index = 0; index < 50; index += 1) {
    assert.match(createUuid(), UUID_V4);
  }
});

test("createUuid falls back to getRandomValues when randomUUID is absent", () => {
  const original = globalThis.crypto.randomUUID;
  try {
    // Simulate an older browser / insecure context.
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    assert.match(createUuid(), UUID_V4);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: original,
      configurable: true,
    });
  }
});

test("idempotency keys are unchanged in format and still independent values", () => {
  const key = createIdempotencyKey();
  assert.match(key, UUID_V4);
  assert.notEqual(key, createIdempotencyKey());
});

test("a consultation identity is minted when setup hands over and none exists", () => {
  const { generate, calls } = countingGenerator();
  const uuid = ensureConsultationUuid("", generate);
  assert.equal(calls(), 1);
  assert.equal(uuid, "44444444-4444-4444-8444-000000000001");
});

test("it is minted ONCE: navigation, Back to Setup, and re-entry keep it", () => {
  const { generate, calls } = countingGenerator();
  let current = ensureConsultationUuid("", generate);
  const born = current;

  // Next, Previous, Back to Setup and Next again, autosave, manual save,
  // program changes, reconnect - every one re-enters through the same rule.
  for (let step = 0; step < 25; step += 1) {
    current = ensureConsultationUuid(current, generate);
  }

  assert.equal(current, born);
  assert.equal(calls(), 1, "never minted a second time");
});

test("an existing identity is normalized, not replaced", () => {
  const { generate, calls } = countingGenerator();
  assert.equal(ensureConsultationUuid(` ${EXISTING.toUpperCase()} `, generate), EXISTING);
  assert.equal(calls(), 0);
});

test("a resumed server draft adopts its own identity", () => {
  const { generate, calls } = countingGenerator();
  assert.equal(
    adoptConsultationUuid({ consultationUuid: EXISTING, payload: {} }, generate),
    EXISTING,
  );
  assert.equal(calls(), 0);
});

test("a recovered device copy adopts its own identity, from the payload if needed", () => {
  const { generate, calls } = countingGenerator();
  assert.equal(
    adoptConsultationUuid({ payload: { consultationUuid: EXISTING } }, generate),
    EXISTING,
  );
  assert.equal(calls(), 0);
});

test("the draft-level identity wins over a stale payload value", () => {
  const other = "55555555-5555-4555-8555-555555555555";
  assert.equal(
    adoptConsultationUuid({ consultationUuid: EXISTING, payload: { consultationUuid: other } }),
    EXISTING,
  );
});

test("only a legacy draft with no identity is given one", () => {
  const { generate, calls } = countingGenerator();
  const uuid = adoptConsultationUuid({ consultationUuid: "", payload: {} }, generate);
  assert.equal(calls(), 1);
  assert.match(uuid, /^44444444-/);
});

test("normalization treats blanks and non-strings as no identity", () => {
  for (const value of ["", "   ", null, undefined, 42, {}]) {
    assert.equal(normalizeConsultationUuid(value), "");
  }
  assert.equal(normalizeConsultationUuid(EXISTING.toUpperCase()), EXISTING);
});
