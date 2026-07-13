import { useEffect, useRef, useState } from "react";

export default function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [restoredAt, setRestoredAt] = useState(null);
  const wasOffline = useRef(false);

  useEffect(() => {
    function handleOffline() {
      wasOffline.current = true;
      setIsOnline(false);
    }

    function handleOnline() {
      setIsOnline(true);
      if (wasOffline.current) {
        setRestoredAt(Date.now());
      }
      wasOffline.current = false;
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return { isOnline, restoredAt };
}
