/**
 * useFetch Hook - Generic data fetching with loading/error states
 * @hook
 *
 * @param {Function} fetchFn - Async function to fetch data
 * @param {Array} [dependencies=[]] - Dependencies to refetch
 * @param {object} [options={}] - Options: { immediate: true, onSuccess, onError }
 *
 * @returns {Object} { data, loading, error, refetch }
 *
 * @example
 * const { data, loading, error } = useFetch(() => fetchPatients(), []);
 */
import { useState, useEffect, useCallback } from "react";

export default function useFetch(fetchFn, dependencies = [], options = {}) {
  const { immediate = true, onSuccess, onError } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await fetchFn();

      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const errorMessage = err?.message || "Failed to fetch data";
      setError(errorMessage);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, onSuccess, onError]);

  useEffect(() => {
    if (!immediate) return;
    refetch();
  }, dependencies);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
