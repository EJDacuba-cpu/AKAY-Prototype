/**
 * useAsyncOperation Hook - Handle async operations with loading/error states
 * @hook
 *
 * @param {Function} operation - Async operation to perform
 * @param {object} [options={}] - Options: { onSuccess, onError }
 *
 * @returns {Object} { execute, loading, error, data }
 *
 * @example
 * const { execute, loading } = useAsyncOperation(
 *   (id) => deletePatient(id),
 *   { onSuccess: () => refetch() }
 * );
 */
import { useState, useCallback } from "react";

export default function useAsyncOperation(operation, options = {}) {
  const { onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(
    async (...args) => {
      try {
        setLoading(true);
        setError(null);

        const result = await operation(...args);

        setData(result);
        onSuccess?.(result);

        return result;
      } catch (err) {
        const errorMessage = err?.message || "An error occurred";
        setError(errorMessage);
        onError?.(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [operation, onSuccess, onError],
  );

  return {
    execute,
    loading,
    error,
    data,
  };
}
