import { linkTypeForLabel } from "./relationshipLabels.js";

// The offer shown during registration. Staff must tick it; nothing is recorded automatically.
export function relationshipLinkOffer(label, headName) {
  const type = linkTypeForLabel(label);
  return type ? { type, text: `Record as ${type} of ${headName || "the household head"}` } : null;
}
