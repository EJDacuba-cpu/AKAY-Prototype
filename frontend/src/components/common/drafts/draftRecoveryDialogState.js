export function draftRecoveryDialogReducer(phase, event) {
  if (event.blocked) return phase;
  if (event.type === "request-discard") return "confirm-discard";
  if (["close", "keep-draft", "reset"].includes(event.type)) return "decision";
  return phase;
}
