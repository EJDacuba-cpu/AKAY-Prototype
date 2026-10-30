export const MIN_SCALE = 0.1;
export const MAX_SCALE = 2;
const clamp = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

// Scale so all content fits (never enlarging past 1:1) and center it.
export function fitToView(content, viewport, padding = 24) {
  if (!content.width || !content.height || !viewport.width || !viewport.height) return { scale: 1, x: 0, y: 0 };
  const scale = clamp(Math.min(1, (viewport.width - padding * 2) / content.width, (viewport.height - padding * 2) / content.height));
  return { scale, x: (viewport.width - content.width * scale) / 2, y: (viewport.height - content.height * scale) / 2 };
}

// Zoom around a point in viewport coordinates so the content under it stays put.
export function zoomAt(view, factor, point) {
  const scale = clamp(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

export const panBy = (view, dx, dy) => ({ ...view, x: view.x + dx, y: view.y + dy });
