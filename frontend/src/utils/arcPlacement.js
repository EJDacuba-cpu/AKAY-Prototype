const DEG = Math.PI / 180;

/**
 * Position (CSS left/top) of a control on a circle that hugs the left side of
 * the body figure. It resolves inside the figure frame, which is a size
 * container that defines --figure-s (the figure box's long side). The figure
 * box's half-width is --figure-s / 3, so offsetRem measures the gap from the
 * figure's edge: a larger offset sits further out, a smaller one tucks in.
 * angle is in degrees from the horizontal: negative above, positive below.
 */
export function arcPosition(angle, offsetRem, centerY = "44cqh") {
  const rad = angle * DEG;
  const radius = `(var(--figure-s) / 3 + ${offsetRem}rem)`;
  return {
    left: `calc(50cqw - ${radius} * ${Math.cos(rad).toFixed(3)})`,
    top: `calc(${centerY} + ${radius} * ${Math.sin(rad).toFixed(3)})`,
  };
}
