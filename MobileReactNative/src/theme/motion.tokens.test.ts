import {
  motionAnimationDefinitions,
  motionPressStyles,
  tabMotionStates,
} from './motion.tokens';

const safeMotionProperties = new Set(['opacity', 'scale', 'x', 'y']);

describe('motion tokens', () => {
  it('never changes component layout from press feedback', () => {
    Object.values(motionPressStyles).forEach(style => {
      expect(Object.keys(style).every(key => safeMotionProperties.has(key))).toBe(true);
    });
  });

  it('keeps tab state animation layout-safe', () => {
    Object.values(tabMotionStates).forEach(style => {
      expect(Object.keys(style).every(key => safeMotionProperties.has(key))).toBe(true);
    });
  });

  it('uses restrained interaction durations', () => {
    expect(motionAnimationDefinitions.breathe.duration).toBeGreaterThanOrEqual(600);
    expect(motionAnimationDefinitions.breathe.duration).toBeLessThanOrEqual(1200);
    expect(motionAnimationDefinitions.feedback.stiffness).toBeGreaterThan(0);
  });
});
