import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleProp, StyleSheet, TextStyle, View, ViewStyle} from 'react-native';
import {colors, radii, spacing, typography} from '../theme';

function numericValue(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatValue(value: number) {
  return Math.round(value).toLocaleString('zh-CN');
}

/** 金币数字平滑过渡；余额上涨时附带轻量浮动增量提示。 */
export function AnimatedCoinValue({
  value,
  prefix = '',
  showDelta = true,
  animateOnMount = false,
  containerStyle,
  style,
}: {
  value: string | number;
  prefix?: string;
  showDelta?: boolean;
  animateOnMount?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
}) {
  const target = numericValue(value);
  const previous = useRef(animateOnMount ? 0 : target);
  const initialized = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const deltaProgress = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(animateOnMount ? 0 : target);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (!animateOnMount) {
        previous.current = target;
        setDisplay(target);
        return;
      }
    }

    const from = previous.current;
    const difference = target - from;
    if (difference === 0) return;
    previous.current = target;
    setDelta(difference);
    progress.stopAnimation();
    deltaProgress.stopAnimation();
    progress.setValue(0);
    deltaProgress.setValue(0);

    const listener = progress.addListener(({value: ratio}) => {
      setDisplay(from + difference * ratio);
    });
    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: animateOnMount ? 1800 : 950,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(deltaProgress, {toValue: 1, duration: 180, useNativeDriver: true}),
        Animated.delay(620),
        Animated.timing(deltaProgress, {toValue: 0, duration: 220, useNativeDriver: true}),
      ]),
    ]).start(() => {
      progress.removeListener(listener);
      setDisplay(target);
    });

    return () => {
      progress.removeListener(listener);
      progress.stopAnimation();
      deltaProgress.stopAnimation();
    };
  }, [animateOnMount, deltaProgress, progress, target]);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Animated.Text style={style}>{prefix}{formatValue(display)}</Animated.Text>
      {showDelta && delta !== 0 ? (
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.delta,
            delta < 0 && styles.negative,
            {
              opacity: deltaProgress,
              transform: [{translateY: deltaProgress.interpolate({inputRange: [0, 1], outputRange: [8, -5]})}],
            },
          ]}>
          {delta > 0 ? '+' : ''}{formatValue(delta)}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'relative', alignSelf: 'flex-start'},
  delta: {
    position: 'absolute',
    left: '100%',
    top: spacing.xs,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
    color: colors.success,
    backgroundColor: colors.successSoft,
    ...typography.caption,
    fontWeight: '700',
  },
  negative: {color: colors.danger, backgroundColor: colors.dangerSoft},
});
