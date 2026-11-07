import { test } from "node:test";
import assert from "node:assert/strict";
import { formDraftOwnerContext, formDraftRequestOptions } from "./formDraftRequest.js";

test("explicit commit options add only opaque headers without changing the mutation body", () => {
  const user = { id: 1, role: "bhc", workingFacilityKey: "bhc:2" };
  const body = { name: "Saved input" };
  const options = formDraftRequestOptions({ body, draftOwnerContext: formDraftOwnerContext(user), draftCommit: { id: "id", version: 2, transaction_uuid: "transaction" } }, user);
  assert.equal(options.body, body);
  assert.equal(options.headers["X-Form-Draft-Id"], "id");
  assert.equal(options.headers["X-Form-Draft-Version"], "2");
  assert.equal(options.headers["X-Form-Draft-Transaction"], "transaction");
  assert.deepEqual(body, { name: "Saved input" });
});

test("a late save cannot be retried as a different account or working facility", () => {
  const user = { id: 1, role: "bhc", workingFacilityKey: "bhc:2" };
  const options = { draftOwnerContext: formDraftOwnerContext(user) };
  for (const changed of [{ ...user, id: 2 }, { ...user, workingFacilityKey: "bhc:3" }, {}]) {
    assert.throws(() => formDraftRequestOptions(options, changed), { code: "DRAFT_SESSION_CHANGED" });
  }
  assert.throws(() => formDraftRequestOptions({ draftCommit: { id: "id" } }, user));
  const legacy = { method: "POST", body: { example: "unchanged" } };
  assert.equal(formDraftRequestOptions(legacy, user), legacy);
});
