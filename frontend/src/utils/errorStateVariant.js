import { isConnectionError } from "../services/apiClient";

/** Which `ConnectionErrorState` variant a failed request should show. */
export function errorStateVariant(error) {
  if (error?.status === 403) return "forbidden";
  if (error?.isTimeout) return "timeout";
  if (isConnectionError(error)) return "offline";
  return "error";
}
