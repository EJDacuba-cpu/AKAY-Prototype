/**
 * Staged reveal of a finding's detail: area highlight, then the leader line,
 * then the popover. Times are ms since the finding became active.
 */
export const REVEAL_TIMINGS = { line: 150, popover: 450 };
export const REVEAL_PHASES = ["idle", "highlight", "line", "popover"];

export function revealPhaseAt(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "idle";
  if (elapsedMs < REVEAL_TIMINGS.line) return "highlight";
  if (elapsedMs < REVEAL_TIMINGS.popover) return "line";
  return "popover";
}

/** True when `phase` is at or past `target`. */
export function phaseReached(phase, target) {
  return REVEAL_PHASES.indexOf(phase) >= REVEAL_PHASES.indexOf(target);
}
