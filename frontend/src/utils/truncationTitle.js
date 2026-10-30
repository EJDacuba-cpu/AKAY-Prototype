// Fixed-size tables cut long text with an ellipsis. On hover, give the cut element a title with its full text.
export function setTitleIfTruncated(event) {
  const cell = event.target.closest?.("td");
  let element = event.target;

  while (element && element !== event.currentTarget) {
    if (!element.title && element.scrollWidth > element.clientWidth) {
      element.title = element.textContent.trim();
      return;
    }
    if (element === cell) return;
    element = element.parentElement;
  }
}
