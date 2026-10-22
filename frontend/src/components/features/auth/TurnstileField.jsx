import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TURNSTILE_ACTION, TURNSTILE_SCRIPT_SRC } from "../../../config/turnstile";

let scriptPromise;

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile is only available in the browser."));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-akay-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.akayTurnstile = "true";
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export const TurnstileField = forwardRef(function TurnstileField(
  { siteKey, onToken, onExpire, onError },
  ref,
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onToken, onExpire, onError });
  callbacksRef.current = { onToken, onExpire, onError };

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;

    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || !turnstile?.render) {
          if (!cancelled && !turnstile?.render) callbacksRef.current.onError?.();
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          size: "flexible",
          action: TURNSTILE_ACTION,
          appearance: "always",
          callback: (token) => callbacksRef.current.onToken?.(token),
          "expired-callback": () => callbacksRef.current.onExpire?.(),
          "error-callback": () => callbacksRef.current.onError?.(),
          "timeout-callback": () => callbacksRef.current.onExpire?.(),
        });
      })
      .catch(() => {
        if (!cancelled) callbacksRef.current.onError?.();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return (
    <div className="min-h-[65px]" aria-label="Bot verification">
      <div ref={containerRef} />
    </div>
  );
});
