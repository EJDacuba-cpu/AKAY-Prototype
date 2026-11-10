import { QueryClient } from "@tanstack/react-query";
import { shouldRetryQuery } from "./queryRetry";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Transient failures retry once; HTTP 429 and other terminal 4xx never auto-retry.
      retry: shouldRetryQuery,
    },
  },
});
