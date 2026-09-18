import React, {useCallback, useEffect, useRef} from 'react';
import {Animated, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, radii, spacing, typography} from '../theme';
import {AppIcon} from './AppIcon';
import {AnimatedCoinValue} from './AnimatedCoinValue';
import {AppButton, AppCard} from './DesignSystem';

export interface RewardReceipt {
  awardedCoins: string | number;
  coinBalance: string | number;
  completedCount: number;
  dailyLimit: number;
  description?: string;
  progressLabel?: string;
}

function formatCoins(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('zh-CN') : String(value);
}

/** 仅在服务端完成验奖和结算后展示，客户端广告回调不会直接触发奖励弹窗。 */
export function RewardSuccessDialog({
  receipt,
  onClose,
}: {
  receipt?: RewardReceipt;
  onClose: () => void;
}) {
  const entrance = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  const playEntrance = useCallback(() => {
    if (!receipt) return;
    entrance.stopAnimation();
    burst.stopAnimation();
    entrance.setValue(0);
    burst.setValue(0);
    Animated.parallel([
      Animated.spring(entrance, {
        toValue: 1,
        damping: 11,
        stiffness: 150,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(burst, {toValue: 1, duration: 2200, useNativeDriver: true}),
      ]),
    ]).start();
  }, [burst, entrance, receipt]);

  useEffect(() => () => {
    entrance.stopAnimation();
    burst.stopAnimation();
  }, [burst, entrance]);

  return (
    <Modal
      visible={Boolean(receipt)}
      transparent
      animationType="none"
      statusBarTranslucent
      // Android 的原生 Modal 窗口挂载完成后再启动动画，避免动画先执行完、
      // 内容随后以 opacity=0 挂载而看起来像“没有弹窗”。
      onShow={playEntrance}
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={event => event.stopPropagation()}>
          <Animated.View style={{
            opacity: entrance,
            transform: [
              {translateY: entrance.interpolate({inputRange: [0, 1], outputRange: [34, 0]})},
              {scale: entrance.interpolate({inputRange: [0, 0.7, 1], outputRange: [0.78, 1.04, 1]})},
            ],
          }}>
          <AppCard style={styles.dialog} elevated>
            <View style={styles.glow} />
            <Animated.View style={[styles.particle, styles.particleLeft, {
              opacity: burst.interpolate({inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0]}),
              transform: [{translateX: burst.interpolate({inputRange: [0, 1], outputRange: [0, -58]})}, {translateY: burst.interpolate({inputRange: [0, 1], outputRange: [0, -45]})}, {rotate: burst.interpolate({inputRange: [0, 1], outputRange: ['0deg', '-35deg']})}],
            }]}><AppIcon name="coins" color={colors.primary} size={22} /></Animated.View>
            <Animated.View style={[styles.particle, styles.particleRight, {
              opacity: burst.interpolate({inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0]}),
              transform: [{translateX: burst.interpolate({inputRange: [0, 1], outputRange: [0, 62]})}, {translateY: burst.interpolate({inputRange: [0, 1], outputRange: [0, -38]})}, {rotate: burst.interpolate({inputRange: [0, 1], outputRange: ['0deg', '40deg']})}],
            }]}><AppIcon name="coins" color="#F8D77E" size={19} /></Animated.View>
            <Animated.View style={[styles.iconWrap, {transform: [{rotate: burst.interpolate({inputRange: [0, 0.45, 1], outputRange: ['-8deg', '9deg', '0deg']})}]}]}>
              <AppIcon name="coins" color="#1B1609" size={34} strokeWidth={2.2} />
            </Animated.View>
            <View style={styles.titleRow}>
              <AppIcon name="sparkles" color={colors.primary} size={18} />
              <Text style={styles.title}>奖励已到账</Text>
              <AppIcon name="sparkles" color={colors.primary} size={18} />
            </View>
            <Text style={styles.description}>{receipt?.description ?? '完整观看激励广告获得'}</Text>
            <AnimatedCoinValue
              key={receipt ? `${receipt.awardedCoins}-${receipt.coinBalance}-${receipt.completedCount}` : 'empty'}
              value={receipt?.awardedCoins ?? 0}
              prefix="+"
              showDelta={false}
              animateOnMount={Boolean(receipt)}
              containerStyle={styles.amountWrap}
              style={styles.amount}
            />
            <Text style={styles.unit}>金币</Text>
            <View style={styles.summary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{formatCoins(receipt?.coinBalance ?? 0)}</Text>
                <Text style={styles.summaryLabel}>当前余额</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {receipt?.completedCount ?? 0}/{receipt?.dailyLimit ?? 0}
                </Text>
                <Text style={styles.summaryLabel}>{receipt?.progressLabel ?? '今日完成'}</Text>
              </View>
            </View>
            <AppButton title="开心收下" icon="check" onPress={onClose} style={styles.button} />
          </AppCard>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  dialog: {
    overflow: 'hidden',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderColor: '#51421E',
  },
  glow: {
    position: 'absolute',
    top: -100,
    width: 250,
    height: 190,
    borderRadius: 125,
    backgroundColor: colors.primarySoft,
  },
  particle: {position: 'absolute', zIndex: 3, top: 55, left: '50%'},
  particleLeft: {marginLeft: -12},
  particleRight: {marginLeft: -8},
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 6,
    borderColor: '#F8D77E',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  title: {color: colors.text, ...typography.section},
  description: {color: colors.muted, ...typography.caption, marginTop: spacing.sm},
  amount: {color: colors.primary, fontSize: 42, lineHeight: 50, fontWeight: '800', marginTop: spacing.md},
  amountWrap: {alignSelf: 'center'},
  unit: {color: colors.primary, ...typography.label},
  summary: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  summaryItem: {flex: 1, alignItems: 'center'},
  summaryValue: {color: colors.text, ...typography.section},
  summaryLabel: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  divider: {width: 1, height: 34, backgroundColor: colors.divider},
  button: {alignSelf: 'stretch', marginTop: spacing.xl},
});
