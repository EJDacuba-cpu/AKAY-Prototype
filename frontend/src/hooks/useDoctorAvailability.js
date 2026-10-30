import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProviderUnavailability,
  createRhuProvider,
  deactivateRhuProvider,
  deleteProviderUnavailability,
  updateProviderUnavailability,
  EMPTY_AVAILABILITY,
  getDoctorAvailability,
  getProviderUnavailability,
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
  const { rhuId, ...queryOptions } = options;
  const query = useQuery({
    queryKey: [...queryKeys.providerAvailability(), rhuId || "default"],
    queryFn: () => getDoctorAvailability(rhuId),
    staleTime: AVAILABILITY_STALE_TIME,
    ...queryOptions,
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
      queryClient.invalidateQueries({
        queryKey: ["rhu-provider-unavailability"],
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

  const createUnavailability = useMutation({
    mutationFn: ({ providerId, ...payload }) =>
      createProviderUnavailability(providerId, payload),
    onSuccess: invalidate,
  });

  const updateUnavailability = useMutation({
    mutationFn: ({ providerId, id, ...payload }) =>
      updateProviderUnavailability(providerId, id, payload),
    onSuccess: invalidate,
  });

  const removeUnavailability = useMutation({
    mutationFn: ({ providerId, id }) =>
      deleteProviderUnavailability(providerId, id),
    onSuccess: invalidate,
  });

  return {
    create,
    update,
    deactivate,
    createUnavailability,
    updateUnavailability,
    removeUnavailability,
    invalidate,
  };
}

/**
 * The unavailability API is per provider, so the all-doctors calendar fans out
 * one month query per doctor. It reuses providerUnavailability() keys, so a
 * mutation's invalidation refreshes it and a single-doctor view reads the same
 * cache entries.
 */
export function useAllProviderUnavailability(providers = [], range = {}) {
  const { from, to } = range;
  return useQueries({
    queries: providers.map((provider) => ({
      queryKey: queryKeys.providerUnavailability(provider.id, from, to),
      queryFn: () => getProviderUnavailability(provider.id, { from, to }),
      enabled: Boolean(provider.id && from && to),
      staleTime: AVAILABILITY_STALE_TIME,
    })),
    combine: (results) => ({
      rows: results.flatMap((result, index) =>
        (result.data || []).map((row) => ({
          ...row,
          doctorName: providers[index]?.name || "",
        })),
      ),
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
    }),
  });
}

export function useProviderUnavailability(providerId, range = {}, options = {}) {
  const { from, to } = range;
  const query = useQuery({
    queryKey: queryKeys.providerUnavailability(providerId, from, to),
    queryFn: () => getProviderUnavailability(providerId, { from, to }),
    enabled: Boolean(providerId && from && to),
    staleTime: AVAILABILITY_STALE_TIME,
    ...options,
  });

  return { ...query, rows: query.data || [] };
}
