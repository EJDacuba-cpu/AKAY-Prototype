import test from "node:test";
import assert from "node:assert/strict";
import { API_ERROR_MESSAGES, serverErrorMessage } from "./apiErrorMessages.js";

test("each cause has its plain message", () => {
  assert.equal(API_ERROR_MESSAGES.timeout, "The server is taking too long to respond. Please try again in a moment.");
  assert.equal(API_ERROR_MESSAGES.unreachable, "We couldn't reach the server. Please check your connection and try again.");
  assert.equal(API_ERROR_MESSAGES.rateLimited, "Too many requests were sent. Please wait briefly and try again.");
  assert.equal(API_ERROR_MESSAGES.generic, "Something went wrong. Please try again.");
  assert.equal(API_ERROR_MESSAGES.offline, "You are offline. Please reconnect and try again.");
});

test("a server message wins", () => {
  assert.equal(serverErrorMessage({ message: "Email is already taken." }), "Email is already taken.");
  assert.equal(serverErrorMessage({ errors: { email: ["Email is already taken."] } }), "Email is already taken.");
});

test("no server message falls back to the generic text", () => {
  assert.equal(serverErrorMessage({}), "Something went wrong. Please try again.");
  assert.equal(serverErrorMessage(null), "Something went wrong. Please try again.");
});

test("SQLSTATE and aborted-transaction messages stay generic", () => {
  assert.equal(
    serverErrorMessage({
      message: 'SQLSTATE[25P02]: In failed sql transaction: current transaction is aborted',
    }),
    API_ERROR_MESSAGES.generic,
  );
  assert.equal(
    serverErrorMessage({
      message: 'SQLSTATE[23514]: Check violation: patients_household_facility_exclusive',
    }),
    API_ERROR_MESSAGES.generic,
  );
  assert.equal(
    serverErrorMessage({
      errors: { patient_id: ["Patient information requires review before BHC registration."] },
      message: "SQLSTATE[25P02]: ignored",
    }),
    "Patient information requires review before BHC registration.",
  );
});
