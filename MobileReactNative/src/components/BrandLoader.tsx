import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View, ViewStyle} from 'react-native';

import {colors, spacing, typography} from '../theme';
import {brandConfig} from '../config/brand';
import {BrandMark} from './BrandMark';

type BrandLoaderProps = {
  compact?: boolean;
  fullScreen?: boolean;
  label?: string;
  style?: ViewStyle;
};

/** 已有内容切换或刷新时使用，覆盖内容区但不遮挡整个应用导航。 */
export function ContentLoadingOverlay({
  label = '正在切换内容',
  visible,
}: {
  label?: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={styles.contentOverlay}>
      <View style={styles.contentOverlayPanel}>
        <BrandLoader compact label={label} />
      </View>
    </View>
  );
}

/** 当前迁移基线的统一加载动画：旋转品牌环、播放标识呼吸光晕和错峰跳动圆点。 */
export function BrandLoader({
  compact = false,
  fullScreen = false,
  label = '正在准备精彩内容',
  style,
}: BrandLoaderProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const rotateAnimation = Animated.loop(
      Animated.timing(rotation, {
        duration: 1350,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    const dotAnimation = Animated.loop(
      Animated.stagger(
        130,
        dots.map(dot =>
          Animated.sequence([
            Animated.timing(dot, {
              duration: 260,
              easing: Easing.out(Easing.quad),
              toValue: 1,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              duration: 380,
              easing: Easing.in(Easing.quad),
              toValue: 0,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );

    rotateAnimation.start();
    pulseAnimation.start();
    dotAnimation.start();
    return () => {
      rotateAnimation.stop();
      pulseAnimation.stop();
      dotAnimation.stop();
    };
  }, [dots, pulse, rotation]);

  const size = compact ? 52 : 72;
  const spin = rotation.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});

  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.container, fullScreen && styles.fullScreen, style]}>
      <View style={[styles.animation, {height: size + 24, width: size + 24}]}>
        <Animated.View
          style={[
            styles.halo,
            {height: size + 20, width: size + 20, borderRadius: (size + 20) / 2},
            {
              opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.18, 0.48]}),
              transform: [{scale: pulse.interpolate({inputRange: [0, 1], outputRange: [0.86, 1.08]})}],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            {height: size, width: size, borderRadius: size / 2, transform: [{rotate: spin}]},
          ]}
        />
        <BrandMark size={size - 14} style={styles.logo} />
      </View>

      {!compact ? <Text style={styles.brand}>{brandConfig.name}</Text> : null}
      <View style={styles.statusRow}>
        <Text style={[styles.label, compact && styles.compactLabel]}>{label}</Text>
        <View style={styles.dots}>
          {dots.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]}),
                  transform: [{translateY: dot.interpolate({inputRange: [0, 1], outputRange: [0, -3]})}],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  fullScreen: {flex: 1, backgroundColor: colors.background},
  animation: {alignItems: 'center', justifyContent: 'center'},
  halo: {position: 'absolute', backgroundColor: colors.primarySoft},
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.border,
    borderLeftColor: colors.primary,
    borderTopColor: colors.primary,
  },
  logo: {
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  brand: {marginTop: spacing.md, color: colors.text, ...typography.section, letterSpacing: 1},
  statusRow: {marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center'},
  label: {color: colors.muted, ...typography.caption},
  compactLabel: {fontSize: 11},
  dots: {marginLeft: 5, flexDirection: 'row', gap: 3, paddingTop: 3},
  dot: {width: 3, height: 3, borderRadius: 2, backgroundColor: colors.primary},
  contentOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 11, 18, 0.58)',
  },
  contentOverlayPanel: {
    minWidth: 156,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
});
