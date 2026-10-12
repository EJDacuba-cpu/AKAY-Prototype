import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FILTERS } from "./AccessRequestTable";

const SEARCH_DELAY_MS = 300;

/**
 * Rows, filters and per-row action state for one Password & Invites tab. The first load shows the
 * loading overlay; later loads (filters, after an action) refresh in place so the toolbar keeps focus.
 * `runAction(row, fn)` runs one row action, then reloads the tab and calls `onChanged` (the tab counts).
 * A failed action is reported through `onActionError(message)` (the tabs show it as a toast).
 */
export default function useAccessRows(fetchRows, onChanged, onActionError) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const next = await fetchRows({ search, status: filters.status, perPage: 50 });
      if (request !== requestRef.current) return;
      setRows(next);
      setLoadError("");
    } catch (failure) {
      if (request === requestRef.current) setLoadError(failure.message || "Unable to load this list.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [fetchRows, search, filters.status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function updateFilters(next) {
    setFilters((current) => ({ ...current, ...next }));
  }

  /**
   * Returns fn's result, or undefined when another action is running or fn failed (the error goes to
   * `onActionError`). With `rethrow`, a failure is thrown to the caller instead (a form shows it).
   */
  async function runAction(row, fn, { rethrow = false } = {}) {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusyId(row.id);
    try {
      return await fn();
    } catch (failure) {
      if (rethrow) throw failure;
      onActionError?.(failure.message || "This action could not be completed.");
      return undefined;
    } finally {
      busyRef.current = false;
      setBusyId(null);
      refresh();
    }
  }

  function refresh() {
    void reload();
    onChanged?.();
  }

  return {
    rows, filters, updateFilters, loading, busyId, runAction,
    error: loadError,
  };
}
