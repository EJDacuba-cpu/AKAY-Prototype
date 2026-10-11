/**
 * Writes text to the clipboard. Returns false instead of throwing when the Clipboard API is
 * missing (plain http) or refuses, so the caller can show the text for a manual copy.
 */
export async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
