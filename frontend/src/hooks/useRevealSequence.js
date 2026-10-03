import { useEffect, useState } from "react";
import { REVEAL_TIMINGS } from "../utils/revealSequence.js";

/**
 * Phase of the staged reveal for whatever `key` identifies ("idle" for null).
 * A new key restarts at "highlight", then advances to "line" and "popover" on
 * timers. `instant` jumps straight to "popover" (reduced motion, pinned, tap).
 *
 * The state remembers which key it has reached which phase for, so a key
 * change reads as "highlight" on the very first render with no effect-driven
 * reset.
 */
export default function useRevealSequence(key, { instant = false } = {}) {
  const [progress, setProgress] = useState({ key: null, phase: "idle" });

  useEffect(() => {
    if (key === null || key === undefined || instant) return undefined;
    const toLine = setTimeout(() => setProgress({ key, phase: "line" }), REVEAL_TIMINGS.line);
    const toPopover = setTimeout(() => setProgress({ key, phase: "popover" }), REVEAL_TIMINGS.popover);
    return () => {
      clearTimeout(toLine);
      clearTimeout(toPopover);
      // Forget the phase so re-activating the same key restarts the sequence.
      setProgress({ key: null, phase: "idle" });
    };
  }, [key, instant]);

  if (key === null || key === undefined) return "idle";
  if (instant) return "popover";
  return progress.key === key ? progress.phase : "highlight";
}
