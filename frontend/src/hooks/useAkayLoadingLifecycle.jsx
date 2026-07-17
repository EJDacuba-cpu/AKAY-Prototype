import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

const AkayLoadingLifecycleContext = createContext({
  hasCompletedInitialBoot: false,
  shouldShowRouteLoading: () => false,
});

export function AkayLoadingLifecycleProvider({
  hasCompletedInitialBoot,
  children,
}) {
  const initialRouteKeyRef = useRef(null);
  const hasSeenPostInitialRouteChangeRef = useRef(false);

  const shouldShowRouteLoading = useCallback(
    (routeKey) => {
      if (!hasCompletedInitialBoot) return false;

      const normalizedRouteKey = String(routeKey || "");

      if (initialRouteKeyRef.current === null) {
        initialRouteKeyRef.current = normalizedRouteKey;
        return false;
      }

      if (
        !hasSeenPostInitialRouteChangeRef.current &&
        normalizedRouteKey === initialRouteKeyRef.current
      ) {
        return false;
      }

      if (normalizedRouteKey !== initialRouteKeyRef.current) {
        hasSeenPostInitialRouteChangeRef.current = true;
      }

      return true;
    },
    [hasCompletedInitialBoot],
  );

  const value = useMemo(
    () => ({
      hasCompletedInitialBoot,
      shouldShowRouteLoading,
    }),
    [hasCompletedInitialBoot, shouldShowRouteLoading],
  );

  return (
    <AkayLoadingLifecycleContext.Provider value={value}>
      {children}
    </AkayLoadingLifecycleContext.Provider>
  );
}

export function useAkayLoadingLifecycle() {
  return useContext(AkayLoadingLifecycleContext);
}
