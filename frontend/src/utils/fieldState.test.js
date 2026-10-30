import test from "node:test";
import assert from "node:assert/strict";
import { fieldState } from "./fieldState.js";

test("an untouched field shows nothing", () => assert.equal(fieldState({ touched: false }), undefined));
test("an error wins over everything", () => assert.equal(fieldState({ touched: true, error: "Enter mobile number.", checking: true }), "invalid"));
test("an error shows even before the field was left", () => assert.equal(fieldState({ touched: false, error: "Email is already taken." }), "invalid"));
test("a server check in flight shows the spinner", () => assert.equal(fieldState({ touched: true, checking: true }), "checking"));
test("a left, passing field is valid", () => assert.equal(fieldState({ touched: true }), "valid"));
test("a field waiting for server confirmation is not valid yet", () => assert.equal(fieldState({ touched: true, confirmed: false }), undefined));
