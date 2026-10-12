/**
 * Which `ConnectionErrorState` variant a failed request should show. Only a device that is really offline is told
 * so; a server that cannot be reached (network error, 502/503/504) gets its own message instead of blaming the device.
 */
export function errorStateVariant(error) {
  if (error?.status === 403) return "forbidden";
  if (error?.isOffline || error?.code === "OFFLINE") return "offline";
  if (error?.isTimeout || error?.code === "TIMEOUT") return "timeout";
  if (error?.isNetworkError || error?.code === "NETWORK_ERROR" || [502, 503, 504].includes(Number(error?.status))) {
    return "unreachable";
  }
  return "error";
}
