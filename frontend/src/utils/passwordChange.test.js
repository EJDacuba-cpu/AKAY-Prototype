import test from "node:test";
import assert from "node:assert/strict";
import { needsPasswordChange } from "./passwordChange.js";

test("a flagged user is sent to the change page from any other route", () => {
  assert.equal(needsPasswordChange({ must_change_password: true }, "/bhc/dashboard"), true);
});
test("a flagged user is not redirected away from the change page itself", () => {
  assert.equal(needsPasswordChange({ must_change_password: true }, "/change-password"), false);
});
test("an unflagged user is never redirected", () => {
  assert.equal(needsPasswordChange({ must_change_password: false }, "/bhc/dashboard"), false);
  assert.equal(needsPasswordChange({}, "/bhc/dashboard"), false);
});
test("no user means no redirect", () => {
  assert.equal(needsPasswordChange(null, "/bhc/dashboard"), false);
  assert.equal(needsPasswordChange(undefined, "/bhc/dashboard"), false);
});
