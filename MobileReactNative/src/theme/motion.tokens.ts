/**
 * Motion tokens must contain visual feedback properties only. Layout-affecting
 * values belong to the consuming component so animation cannot reshape cards.
 */
export const motionDurations = {
  breathe: 850,
} as const;

export const motionPressStyles = {
  button: {opacity: 0.86, scale: 0.965},
  listRow: {opacity: 0.72, scale: 0.985, x: 3},
  dramaCard: {opacity: 0.8, scale: 0.965, y: 2},
} as const;

export type MotionFeedback = keyof typeof motionPressStyles;

export const motionAnimatedProperties = ['opacity', 'transform'];
export const opacityAnimatedProperty = ['opacity'];

export const tabMotionStates = {
  active: {opacity: 1, scale: 1.08, y: -1},
  inactive: {opacity: 0.82, scale: 1, y: 0},
} as const;

export const motionAnimationDefinitions = {
  feedback: {
    type: 'spring' as const,
    damping: 22,
    mass: 0.7,
    stiffness: 420,
  },
  breathe: {
    type: 'timing' as const,
    duration: motionDurations.breathe,
  },
};
