import { createElement } from "react";
import toast from "react-hot-toast";

// A separate document keeps modal/shell overflow and other forms' print CSS out
// of the selected document. Blob frames are allowed by AKAY's existing CSP.
export const PRINT_DOCUMENT_STYLES = `
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important;
    height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body { font-family: Inter, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111827; }
  [data-akay-print-document] { display: block !important; position: static !important;
    width: 100% !important; max-width: none !important; margin: 0 !important;
    padding: 0 !important; background: white !important; color: #111827 !important; }
  [data-akay-print-document] * { box-sizing: border-box; color: #111827 !important;
    text-shadow: none !important; box-shadow: none !important; animation: none !important;
    transition: none !important; overflow-wrap: anywhere; }
  .no-print, .print\\:hidden, button, [role="tooltip"] { display: none !important; }
  .print-only, .print\\:block { display: block !important; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { vertical-align: top; white-space: normal; padding: 4pt 6pt;
    border-bottom: 1px solid #d1d5db; }
  th { text-align: left; font-weight: 700; }
  td.num, th.num { text-align: right; }
  .akay-summary-print-table th:first-child { width: 44%; }
  .akay-summary-print-table th:nth-child(2) { width: 12%; }
  .akay-summary-print-table th:last-child { width: 44%; }
  .akay-summary-print-table th:nth-child(2),
  .akay-summary-print-table td:nth-child(2) { text-align: center; }
  p, li, td, th { font-size: 10pt !important; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4, caption { break-after: avoid; page-break-after: avoid; }
  p { orphans: 3; widows: 3; }
  img, svg { max-width: 100%; break-inside: avoid; }
  [data-akay-print-document].bhc-record-print { font-size: 10pt; }
  .bhc-print-inline, .bhc-print-narrative { min-width: 0; }
  .bhc-print-table { table-layout: fixed; }
  .bhc-print-keep { break-inside: auto; }
  /* Admin sections contain small, fixed role/status tables (at most four data
     rows); keep their headings, scope labels and totals together. */
  #admin-account-report-print section { break-inside: avoid; }
  .referral-print-area > div { width: 100% !important; max-width: 125mm !important;
    margin: 0 auto !important; padding: 0 !important; border: 0 !important;
    font-family: Inter, Arial, sans-serif !important; font-size: 10pt !important; line-height: 1.5 !important; }
  .referral-print-area { break-inside: avoid; }
`;

let activePrint = null;

function within(promise, message, timeout = 30000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); }),
  ]).finally(() => clearTimeout(timer));
}

export function checkPrintSource(source) {
  if (!source?.isConnected || !source.textContent.trim()) {
    throw new Error("The selected document is unavailable. Reload it and retry printing.");
  }
  if (source.dataset.printState === "loading") {
    throw new Error("The document is still loading. Wait for it to finish, then retry printing.");
  }
  if (source.dataset.printState === "error") {
    throw new Error(source.dataset.printError || "Required document data could not be loaded. Retry printing to reload it.");
  }
}

function absoluteStyle(css, base) {
  return css.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (_, quote, url) =>
    `url("${new URL(url, base).href}")`);
}

export async function waitForPrintAssets(doc) {
  await Promise.all(Array.from(doc.images, async (img) => {
    img.loading = "eager";
    if (!img.complete) {
      await new Promise((resolve, reject) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", () => reject(new Error("A document image could not be loaded. Retry printing.")), { once: true });
      });
    }
    if (!img.naturalWidth) throw new Error("A document image could not be loaded. Retry printing.");
    if (img.decode) await img.decode();
  }));
  // Resolve styles/layout first so all fonts actually used by this document load.
  void doc.body.offsetHeight;
  if (doc.fonts) {
    await doc.fonts.ready;
    if (Array.from(doc.fonts).some((font) => font.status === "error")) {
      throw new Error("A document font could not be loaded. Retry printing.");
    }
  }
}

/** Read-only preparation may update the cloned document (e.g. secure QR data). */
export async function printDocument(selector, { title = "AKAY document", prepare, validate, onRetry } = {}) {
  if (activePrint) return false;
  const job = {};
  activePrint = job;
  const previousFocus = document.activeElement;
  const progress = toast.loading("Preparing document for printing…");
  let frame;
  let url;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("pointerdown", dispose, true);
    window.removeEventListener("keydown", dispose, true);
    window.removeEventListener("focus", dispose);
    frame?.remove();
    if (url) URL.revokeObjectURL(url);
    if (activePrint === job) activePrint = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };

  try {
    validate?.();
    const source = document.querySelector(selector);
    checkPrintSource(source);
    const sourceKey = source.dataset.printKey;
    const clone = source.cloneNode(true);
    clone.setAttribute("data-akay-print-document", "");
    clone.removeAttribute("hidden");
    clone.querySelectorAll("script, button, .no-print, [role=tooltip]").forEach((node) => node.remove());
    if (prepare) await within(prepare(clone), "Required document data could not be loaded. Retry printing.");

    const doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = "en";
    for (const style of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      // Only isolated, document-specific CSS belongs in the print frame.
      if (style.hasAttribute("data-print-shell-style")) continue;
      const copy = style.cloneNode(true);
      if (copy.tagName === "LINK") copy.href = style.href;
      else copy.textContent = absoluteStyle(style.textContent, document.baseURI);
      doc.head.appendChild(copy);
    }
    const css = doc.createElement("style");
    css.textContent = PRINT_DOCUMENT_STYLES;
    doc.head.appendChild(css);
    doc.body.appendChild(doc.importNode(clone, true));
    url = URL.createObjectURL(new Blob(["<!doctype html>" + doc.documentElement.outerHTML], { type: "text/html" }));
    frame = document.createElement("iframe");
    frame.title = "Prepared print document";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:186mm;height:1000px;border:0;pointer-events:none";
    const loaded = new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = () => reject(new Error("The browser blocked the print document. Allow printing and retry."));
    });
    frame.src = url;
    document.body.appendChild(frame);
    await within(loaded, "The browser blocked the print document. Allow printing and retry.");
    const printWindow = frame.contentWindow;
    const printDoc = frame.contentDocument;
    if (!printWindow || !printDoc?.querySelector("[data-akay-print-document]")) {
      throw new Error("The browser blocked the print document. Allow printing and retry.");
    }
    // A stylesheet failure must not silently produce unformatted output.
    if (Array.from(printDoc.querySelectorAll('link[rel="stylesheet"]')).some((link) => !link.sheet)) {
      throw new Error("The print styles could not be loaded. Retry printing.");
    }
    await within(waitForPrintAssets(printDoc), "Document images or fonts are still unavailable. Retry printing.");
    validate?.();
    checkPrintSource(source);
    if (document.querySelector(selector) !== source || source.dataset.printKey !== sourceKey) {
      throw new Error("The selected document changed while preparing. Retry printing the current selection.");
    }
    let opened = false;
    printWindow.addEventListener("beforeprint", () => { opened = true; }, { once: true });
    printWindow.addEventListener("afterprint", dispose, { once: true });
    // Chrome and Firefox dispatch afterprint on both completion and cancellation.
    printWindow.focus();
    printWindow.print();
    toast.dismiss(progress);
    if (!opened) {
      throw new Error("The browser did not open the print dialog. Allow printing and retry.");
    }
    // Some browsers omit afterprint. The next interaction in the app can only
    // occur after its native dialog has closed, so it also releases the frame.
    if (!disposed) {
      window.addEventListener("pointerdown", dispose, { once: true, capture: true });
      window.addEventListener("keydown", dispose, { once: true, capture: true });
      window.addEventListener("focus", dispose, { once: true });
    }
    return true;
  } catch (error) {
    dispose();
    toast.dismiss(progress);
    toast((notification) => createElement("div", { role: "alert" },
      createElement("p", null, error.message || "Unable to prepare this document for printing."),
      createElement("button", {
        type: "button",
        className: "mt-2 font-semibold underline",
        onClick: async () => {
          toast.dismiss(notification.id);
          try {
            await onRetry?.();
            // Let React commit refreshed data before taking another snapshot.
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await printDocument(selector, { title, prepare, validate, onRetry });
          } catch {
            toast.error("Required document data could not be reloaded. Use the document's retry action, then print again.");
          }
        },
      }, "Retry printing"),
      createElement("button", { type: "button", className: "ml-3 underline", onClick: () => toast.dismiss(notification.id) }, "Dismiss"),
    ), { duration: Infinity });
    return false;
  }
}
