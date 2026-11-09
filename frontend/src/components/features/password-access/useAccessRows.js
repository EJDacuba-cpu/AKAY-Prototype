import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { DEFAULT_FILTERS } from "./AccessRequestTable";

const SEARCH_DELAY_MS = 300;

export const INITIAL_ACCESS_ROWS = { rows: [], loading: true, refreshing: false, hasLoaded: false, error: "" };

export function accessRowsReducer(state, action) {
  switch (action.type) {
    case "start":
      return { ...state, loading: !state.hasLoaded, refreshing: state.hasLoaded, error: "" };
    case "success":
      return { rows: action.rows, loading: false, refreshing: false, hasLoaded: true, error: "" };
    case "failure":
      if ([401, 403].includes(Number(action.status))) return { ...INITIAL_ACCESS_ROWS, loading: false, error: action.message };
      // A successful empty response is usable content too. Later errors are toasted by the hook.
      return { ...state, loading: false, refreshing: false, error: state.hasLoaded ? "" : action.message };
    default:
      return state;
  }
}

/**
 * Rows, filters and per-row action state for one Password & Invites tab. The first load shows the
 * loading overlay; later loads (filters, after an action) refresh in place so the toolbar keeps focus.
 * `runAction(row, fn)` runs one row action, then reloads the tab.
 * A failed action or a failed load is reported through `onActionError(message)` (the tabs show it as a toast).
 */
export default function useAccessRows(fetchRows, onActionError) {
  const [state, dispatch] = useReducer(accessRowsReducer, INITIAL_ACCESS_ROWS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    dispatch({ type: "start" });
    try {
      const next = await fetchRows({ search, status: filters.status, perPage: 50 });
      if (request !== requestRef.current) return;
      hasLoadedRef.current = true;
      dispatch({ type: "success", rows: next });
    } catch (failure) {
      if (request === requestRef.current) {
        const message = failure.message || "Unable to load this list.";
        dispatch({ type: "failure", message, status: failure.status });
        if (hasLoadedRef.current) onActionError?.(message);
        if ([401, 403].includes(Number(failure.status))) hasLoadedRef.current = false;
      }
    }
  }, [fetchRows, search, filters.status, onActionError]);

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
  }

  return {
    ...state, filters, updateFilters, busyId, runAction, refresh,
  };
}
