import {createAnimations} from '@tamagui/animations-react-native';
import {motionAnimationDefinitions} from './motion.tokens';

/** React Native 0.84 requires one driver per animated node; keep Tamagui on JS. */
export const animations = createAnimations(
  motionAnimationDefinitions,
  {useNativeDriver: false},
);
