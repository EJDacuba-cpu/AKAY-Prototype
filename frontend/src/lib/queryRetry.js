/**
 * Shared React Query retry policy for AKAY reads.
 * Retry transient failures once; never retry rate limits or terminal 4xx.
 */
export function shouldRetryQuery(failureCount, error) {
  const status = Number(error?.status);
  if (status === 429) return false;
  if (status >= 400 && status < 500) return false;
  return failureCount < 1;
}
