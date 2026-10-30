/**
 * Runs `doFetch` with a deadline. Only the deadline produces the timeout
 * error; an abort from the caller's own `signal` (e.g. a cancelled query) is
 * rethrown unchanged so it is never reported as a slow server.
 *
 * `doFetch` receives the signal to hand to fetch(). It aborts on either the
 * deadline or the caller's signal, so a timed-out request is actually
 * cancelled even when the caller supplied a signal of its own.
 */
export async function fetchWithTimeout(doFetch, { signal, timeoutMs, createTimeoutError }) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  let timedOut = false;

  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await doFetch(controller.signal);
  } catch (error) {
    if (timedOut) throw createTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
