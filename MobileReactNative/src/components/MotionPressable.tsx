import React, {ComponentProps} from 'react';
import {View as TamaguiView} from '@tamagui/core';
import {
  motionAnimatedProperties,
  MotionFeedback,
  motionPressStyles,
} from '../theme/motion.tokens';

type TamaguiViewProps = ComponentProps<typeof TamaguiView>;
type MotionPressableProps = Omit<
  TamaguiViewProps,
  'animateOnly' | 'pressStyle' | 'transition'
> & {
  feedback?: MotionFeedback;
};

/**
 * The only Tamagui-backed interactive primitive used by business screens.
 * It intentionally owns no flex, spacing or sizing styles.
 */
export function MotionPressable({
  feedback = 'button',
  ...props
}: MotionPressableProps) {
  return (
    <TamaguiView
      {...props}
      transition="feedback"
      animateOnly={motionAnimatedProperties}
      pressStyle={motionPressStyles[feedback]}
    />
  );
}
