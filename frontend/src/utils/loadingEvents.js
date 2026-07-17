export const AKAY_CONTENT_LOADING_START = "akay:content-loading-start";
export const AKAY_CONTENT_LOADING_END = "akay:content-loading-end";

export function dispatchContentLoadingStart() {
  window.dispatchEvent(new CustomEvent(AKAY_CONTENT_LOADING_START));
}

export function dispatchContentLoadingEnd() {
  window.dispatchEvent(new CustomEvent(AKAY_CONTENT_LOADING_END));
}
