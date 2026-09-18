import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

import {colors} from '../theme';

/**
 * APP 内统一品牌标识。
 * 与启动图标保持一致：白色外圈、香槟金圆环和深蓝播放键。
 */
export function BrandMark({
  size = 44,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{width: size, height: size}, style]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="31" fill="#FFFFFF" />
        <Circle cx="32" cy="32" r="24.5" fill="#FFFFFF" stroke={colors.primary} strokeWidth="5" />
        <Rect x="19" y="23.5" width="26" height="17" rx="5.5" fill={colors.primary} />
        <Path d="M29 27.5 38.5 32 29 36.5Z" fill="#11182A" />
      </Svg>
    </View>
  );
}
