import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithTimeout } from "./requestTimeout.js";

// Resolves after `ms`, or rejects the way fetch() does when its signal aborts.
function fakeFetch(ms, value = "ok") {
  return (signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timer = setTimeout(() => resolve(value), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
}

function timeoutError() {
  const error = new Error("timed out");
  error.isTimeout = true;
  return error;
}

test("returns the response when it arrives before the deadline", async () => {
  const result = await fetchWithTimeout(fakeFetch(5, "done"), {
    timeoutMs: 200,
    createTimeoutError: timeoutError,
  });
  assert.equal(result, "done");
});

test("rejects with the timeout error when the deadline passes", async () => {
  await assert.rejects(
    fetchWithTimeout(fakeFetch(500), { timeoutMs: 10, createTimeoutError: timeoutError }),
    (error) => error.isTimeout === true,
  );
});

test("a caller abort is rethrown as-is, not reported as a timeout", async () => {
  const caller = new AbortController();
  const request = fetchWithTimeout(fakeFetch(500), {
    signal: caller.signal,
    timeoutMs: 200,
    createTimeoutError: timeoutError,
  });
  caller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError" && !error.isTimeout);
});

test("an already-aborted caller signal cancels the request immediately", async () => {
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(
    fetchWithTimeout(fakeFetch(500), {
      signal: caller.signal,
      timeoutMs: 200,
      createTimeoutError: timeoutError,
    }),
    (error) => error.name === "AbortError" && !error.isTimeout,
  );
});

test("the deadline still cancels the fetch when the caller supplied a signal", async () => {
  const caller = new AbortController();
  let fetchSignal;
  await assert.rejects(
    fetchWithTimeout(
      (signal) => {
        fetchSignal = signal;
        return fakeFetch(500)(signal);
      },
      { signal: caller.signal, timeoutMs: 10, createTimeoutError: timeoutError },
    ),
    (error) => error.isTimeout === true,
  );
  assert.equal(fetchSignal.aborted, true);
});
