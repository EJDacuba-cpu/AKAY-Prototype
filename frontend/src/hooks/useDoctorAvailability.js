import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRhuProvider,
  deactivateRhuProvider,
  EMPTY_AVAILABILITY,
  getDoctorAvailability,
  getRhuProviders,
  updateRhuProvider,
} from "../services/doctorAvailability";
import { queryKeys } from "../utils/queryKeys";

/**
 * TECH-02 - provider availability is live data that gates referral submission
 * (DOC-14), so it is polled more aggressively than the 2-minute global
 * default. 30s matches the referral-queue tuning already used elsewhere.
 */
const AVAILABILITY_STALE_TIME = 30_000;

export function useDoctorAvailability(options = {}) {
  const query = useQuery({
    queryKey: queryKeys.providerAvailability(),
    queryFn: getDoctorAvailability,
    staleTime: AVAILABILITY_STALE_TIME,
    ...options,
  });

  return { ...query, availability: query.data || EMPTY_AVAILABILITY };
}

export function useRhuProviders(options = {}) {
  const query = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: getRhuProviders,
    staleTime: AVAILABILITY_STALE_TIME,
    ...options,
  });

  return { ...query, providers: query.data || [] };
}

/**
 * Every roster mutation invalidates both the roster and the aggregate: the
 * DOC-19 counts are derived server-side from the roster, so a stale aggregate
 * after a write would misreport whether referrals can be submitted.
 */
export function useProviderMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.providers() }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.providerAvailability(),
      }),
    ]);

  const create = useMutation({
    mutationFn: createRhuProvider,
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, ...changes }) => updateRhuProvider(id, changes),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: deactivateRhuProvider,
    onSuccess: invalidate,
  });

  return { create, update, deactivate, invalidate };
}
