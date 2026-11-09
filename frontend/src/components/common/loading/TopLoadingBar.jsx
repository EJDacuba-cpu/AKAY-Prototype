import { useEffect, useRef, useState } from "react";

export function TopLoadingBar({
  active = true,
  complete = false,
  className = "",
}) {
  const [visible, setVisible] = useState(active);
  const [progress, setProgress] = useState(active ? 8 : 0);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];

    function queue(callback, delay) {
      const timer = window.setTimeout(callback, delay);
      timersRef.current.push(timer);
    }

    if (!active) {
      setVisible(false);
      setProgress(0);

      return () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
      };
    }

    setVisible(true);

    if (complete) {
      setProgress((current) => Math.max(current, 92));
      queue(() => setProgress(100), 45);
      queue(() => setVisible(false), 300);
      queue(() => setProgress(0), 480);
      return () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
      };
    }

    setProgress(8);
    queue(() => setProgress(35), 60);
    queue(() => setProgress(70), 300);
    queue(() => setProgress(86), 780);

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, complete]);

  return (
    <div
      className={`h-[3px] w-full overflow-hidden bg-rose-50/40 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      } ${className}`}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-[#FEE2E2] via-[#DC2626] to-[#FCA5A5] opacity-80 shadow-[0_0_14px_rgba(220,38,38,0.12)] transition-[width] duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

