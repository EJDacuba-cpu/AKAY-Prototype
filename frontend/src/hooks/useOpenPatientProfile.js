import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { getPatientProfilePrefetch } from "../services/patientProfileQueries";
import { getCurrentUser } from "../utils/auth";
import {
  clearProfileOpen,
  endProfileOpen,
  getProfileOpenPatientId,
  subscribeProfileOpen,
  tryBeginProfileOpen,
} from "../utils/patientProfileOpenGate";
import { prefetchPatientProfile } from "../utils/prefetchPatientProfile";

function samePatient(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/**
 * Opens a patient profile only after its data has loaded, so the profile never
 * mounts empty. A shared gate allows only one active open across BHC/RHU
 * directory controls. While loading, `openingPatientId` is set (callers show
 * Opening... on that patient and disable conflicting profile actions).
 */
export default function useOpenPatientProfile(role) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [errorPatientId, setErrorPatientId] = useState(null);
  const mountedRef = useRef(true);
  const openTokenRef = useRef(null);
  const openPatientRef = useRef(null);

  const openingPatientId = useSyncExternalStore(
    subscribeProfileOpen,
    getProfileOpenPatientId,
    () => null,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Successful navigation releases the shared open lock. Skip the mount pass so
  // newly rendered directory cards do not clear an in-flight open.
  const locationKeyRef = useRef(location.key);
  useEffect(() => {
    if (locationKeyRef.current === location.key) return;
    locationKeyRef.current = location.key;
    clearProfileOpen();
    openTokenRef.current = null;
    openPatientRef.current = null;
  }, [location.key]);

  const openProfile = useCallback(
    async (patientId, to) => {
      const id = patientId == null ? "" : String(patientId).trim();
      if (!id || !to) return false;

      const token = tryBeginProfileOpen(id);
      if (token == null) return false;

      openTokenRef.current = token;
      openPatientRef.current = id;
      if (mountedRef.current) {
        setError(null);
        setErrorPatientId(null);
      }

      try {
        const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
        await prefetchPatientProfile(
          queryClient,
          getPatientProfilePrefetch(role, id, { canViewHistory }),
        );
        // Drop stale completions if this open was cleared or superseded.
        if (openTokenRef.current !== token || !samePatient(openPatientRef.current, id)) {
          endProfileOpen(token);
          return false;
        }
        navigate(to);
        // Keep the lock until location.key changes so conflicting buttons stay disabled.
        return true;
      } catch (caught) {
        endProfileOpen(token);
        if (openTokenRef.current === token) {
          openTokenRef.current = null;
          openPatientRef.current = null;
        }
        if (mountedRef.current) {
          setError(caught || new Error("Could not load patient profile"));
          setErrorPatientId(id);
        }
        return false;
      }
    },
    [navigate, queryClient, role],
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorPatientId(null);
  }, []);

  const isOpeningPatient = useCallback(
    (patientId) => samePatient(openingPatientId, patientId),
    [openingPatientId],
  );

  const isProfileOpenBlocked = useCallback(
    (patientId) => openingPatientId != null && !samePatient(openingPatientId, patientId),
    [openingPatientId],
  );

  return {
    openProfile,
    opening: openingPatientId != null,
    openingPatientId,
    isOpeningPatient,
    isProfileOpenBlocked,
    error,
    errorPatientId,
    clearError,
  };
}
