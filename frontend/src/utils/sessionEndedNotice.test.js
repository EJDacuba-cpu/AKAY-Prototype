import test from "node:test";
import assert from "node:assert/strict";
import { sessionEndedNotice } from "./sessionEndedNotice.js";

test("session-replaced shows the single-session kick banner", () => {
  assert.equal(
    sessionEndedNotice({ sessionEnded: true, sessionReason: "session-replaced" }),
    "You have been signed out because your account was logged in on another device.",
  );
});

test("session-expired keeps its own wording", () => {
  assert.equal(
    sessionEndedNotice({ sessionEnded: true, sessionReason: "session-expired" }),
    "Your session has expired. Please sign in again.",
  );
});

test("generic session-invalid keeps the previous wording", () => {
  assert.equal(
    sessionEndedNotice({ sessionEnded: true, sessionReason: "session-invalid" }),
    "Your session is no longer valid. Please sign in again.",
  );
});
