import test from "node:test";
import assert from "node:assert/strict";
import { meetsPasswordRules, passwordRules } from "./passwordRules.js";

const unmet = (password) => passwordRules(password).filter((rule) => !rule.met).map((rule) => rule.key);

test("a strong password meets every rule", () => {
  assert.deepEqual(unmet("Abcdefg1"), []);
  assert.equal(meetsPasswordRules("Abcdefg1"), true);
});
test("a password without upper and lower case fails the case rule", () => {
  assert.deepEqual(unmet("abcdefg1"), ["case"]);
  assert.equal(meetsPasswordRules("abcdefg1"), false);
});
test("a password without a number fails the number rule", () => assert.deepEqual(unmet("Abcdefgh"), ["number"]));
test("a short password fails the length rule", () => assert.deepEqual(unmet("Ab1"), ["length"]));
test("an empty password meets nothing", () => {
  assert.equal(meetsPasswordRules(""), false);
  assert.equal(unmet("").length, 3);
});
test("the rules keep their order and labels", () => {
  assert.deepEqual(passwordRules("").map((rule) => [rule.key, rule.label]), [
    ["length", "At least 8 characters"],
    ["case", "Upper and lower case"],
    ["number", "At least one number"],
  ]);
});
