import { useEffect, useState } from "react";

const canMatch = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True while the CSS media query matches; false where matchMedia is unavailable. */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (canMatch() ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!canMatch()) return undefined;
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
