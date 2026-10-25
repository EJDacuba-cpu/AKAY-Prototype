import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listRhuVisits } from "../services/rhuVisitService";
import { queryKeys } from "../utils/queryKeys";

const REFRESH_MS = 30_000;

/**
 * The RHU's active visits, oldest first. Other desks check patients in, so the queue
 * is always stale: it reloads on mount, when the window regains focus and every 30 s.
 */
export default function useRhuVisits() {
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.rhuVisits(),
    queryFn: listRhuVisits,
    staleTime: 0,
    refetchInterval: REFRESH_MS,
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
