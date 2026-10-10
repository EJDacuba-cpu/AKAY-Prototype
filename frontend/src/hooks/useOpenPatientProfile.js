import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { getPatientProfilePrefetch } from "../services/patientProfileQueries";
import { getCurrentUser } from "../utils/auth";
import { prefetchPatientProfile } from "../utils/prefetchPatientProfile";

/**
 * Opens a patient profile only after its data has loaded, so the profile never
 * mounts empty. While loading, `opening` is true (the caller shows a spinner);
 * if the patient itself fails to load the user stays put and `error` is set.
 */
export default function useOpenPatientProfile(role) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // After a successful open the spinner stays until the route actually
  // changes, so the directory never flashes back between fetch and navigation.
  useEffect(() => {
    setOpening(false);
  }, [location.key]);

  const openProfile = useCallback(
    async (patientId, to) => {
      // A second click while one is loading must not start another fetch.
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setOpening(true);

      try {
        const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
        await prefetchPatientProfile(
          queryClient,
          getPatientProfilePrefetch(role, patientId, { canViewHistory }),
        );
        navigate(to);
      } catch (caught) {
        if (mountedRef.current) {
          setError(caught || new Error("Could not load patient profile"));
          setOpening(false);
        }
      } finally {
        busyRef.current = false;
      }
    },
    [navigate, queryClient, role],
  );

  const clearError = useCallback(() => setError(null), []);

  return { openProfile, opening, error, clearError };
}
