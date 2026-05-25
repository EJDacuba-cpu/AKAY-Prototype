/**
 * Animation utilities
 * Stagger animations for list items
 */
export const stagger = (index) => ({
  animationDelay: `${index * 65}ms`,
});

/**
 * Fade up animation classes
 */
export const fadeUpClass = "anim-fade-up";

/**
 * Scale animation on hover
 */
export const scaleClass = "hover:scale-105 transition-transform";

export default {
  stagger,
  fadeUpClass,
  scaleClass,
};
