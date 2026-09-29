import { useQuery } from "@tanstack/react-query";

import { getClinicalRegistry } from "../services/clinicalRegistryService";
import { queryKeys } from "../utils/queryKeys";

const EMPTY_REGISTRY = { monitored_conditions: {}, surveillance_diseases: {} };

/**
 * The clinical registry, cached for the session - it only changes on
 * deploy (a reviewed config change), never at runtime, so it is fetched
 * once and never refetched on window focus or a timer.
 */
export default function useClinicalRegistry() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.clinicalRegistry(),
    queryFn: getClinicalRegistry,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { registry: data || EMPTY_REGISTRY, isLoading, isError };
}
