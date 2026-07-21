import assert from "node:assert/strict";
import test from "node:test";
import { validateApiBaseUrl } from "./environment.js";

test("accepts an HTTPS production API URL", () => {
  assert.equal(
    validateApiBaseUrl("https://api.example.test/api/", {
      isProduction: true,
    }),
    "https://api.example.test/api",
  );
});

test("accepts a same-origin root-relative API path", () => {
  assert.equal(
    validateApiBaseUrl("/api", { isProduction: true }),
    "/api",
  );
});

test("rejects a missing API URL", () => {
  assert.throws(
    () => validateApiBaseUrl("", { isProduction: true }),
    /VITE_API_BASE_URL is required/,
  );
});

test("rejects an insecure absolute production API URL", () => {
  assert.throws(
    () =>
      validateApiBaseUrl("http://api.example.test/api", {
        isProduction: true,
      }),
    /must use HTTPS/,
  );
});
