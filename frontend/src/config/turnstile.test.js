import assert from "node:assert/strict";
import test from "node:test";
import {
  loginErrorMessage,
  resolveTurnstileSiteKey,
  shouldResetTurnstile,
} from "./turnstile.js";

test("production refuses official dummy site keys", () => {
  assert.equal(
    resolveTurnstileSiteKey("1x00000000000000000000AA", { isProduction: true }),
    "",
  );
  assert.equal(
    resolveTurnstileSiteKey("1x00000000000000000000AA", { isProduction: false }),
    "1x00000000000000000000AA",
  );
});

test("missing or blank site keys are treated as unconfigured", () => {
  assert.equal(resolveTurnstileSiteKey("", { isProduction: true }), "");
  assert.equal(resolveTurnstileSiteKey("  ", { isProduction: false }), "");
});

test("production keeps a real site key", () => {
  assert.equal(
    resolveTurnstileSiteKey("0x4AAAAAABakay-login-site-key", { isProduction: true }),
    "0x4AAAAAABakay-login-site-key",
  );
});

test("login errors keep temporary-password and captcha wording", () => {
  assert.equal(
    loginErrorMessage({ code: "TEMP_PASSWORD_EXPIRED" }),
    "This temporary password has expired. Ask the MHO for a new one.",
  );
  assert.equal(
    loginErrorMessage({ code: "CAPTCHA_FAILED" }),
    "Bot verification failed. Refresh the check and try again.",
  );
  assert.equal(
    loginErrorMessage({ code: "CAPTCHA_UNAVAILABLE" }),
    "Bot protection is temporarily unavailable. Please try again in a moment.",
  );
  assert.equal(
    loginErrorMessage({ errors: { turnstile_token: ["Complete the bot check before signing in."] } }),
    "Complete the bot check before signing in.",
  );
  assert.equal(
    loginErrorMessage({ message: "The provided credentials are incorrect." }),
    "The provided credentials are incorrect.",
  );
});

test("a consumed captcha is reset except when login is throttled", () => {
  assert.equal(shouldResetTurnstile({ code: "LOGIN_FAILED" }), true);
  assert.equal(shouldResetTurnstile({ code: "CAPTCHA_FAILED" }), true);
  assert.equal(shouldResetTurnstile({ code: "LOGIN_THROTTLED" }), false);
});
