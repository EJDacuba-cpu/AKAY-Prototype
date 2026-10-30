import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listRhuVisits } from "../services/rhuVisitService";
import { queryKeys } from "../utils/queryKeys";

const REFRESH_MS = 30_000;

/**
 * The RHU's active visits, oldest first. Other desks check patients in, so the queue
 * is always stale: it reloads on mount, when the window regains focus and, while it is
 * on screen (`poll`), every 30 s. `enabled` is off for staff who may not read the queue.
 */
export default function useRhuVisits({ enabled = true, poll = true } = {}) {
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.rhuVisits(),
    queryFn: listRhuVisits,
    enabled,
    staleTime: 0,
    refetchInterval: poll ? REFRESH_MS : false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const visits = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const loading = isLoading && visits.length === 0;

  return {
    visits,
    loading,
    error: queryError ? "Unable to load today's queue" : "",
    queryError,
    refetch,
    isRefreshing: isFetching && !loading,
  };
}
