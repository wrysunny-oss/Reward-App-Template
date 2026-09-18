import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, radii, spacing, typography} from '../theme';
import {AppIcon} from './AppIcon';
import {AppButton, AppCard} from './DesignSystem';

export function PlaybackErrorDialog({message, onClose}: {message: string; onClose: () => void}) {
  return <Modal visible={Boolean(message)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable onPress={event => event.stopPropagation()}>
        <AppCard style={styles.dialog} elevated>
          <View style={styles.icon}><AppIcon name="wifi-off" color={colors.danger} size={25} /></View>
          <Text style={styles.title}>暂时无法播放</Text>
          <Text style={styles.message}>{message || '播放器启动失败，请稍后重试'}</Text>
          <AppButton title="我知道了" onPress={onClose} />
        </AppCard>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.overlay},
  dialog: {padding: spacing.xl, borderRadius: radii.xl},
  icon: {width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft},
  title: {color: colors.text, ...typography.section, marginTop: spacing.lg},
  message: {color: colors.muted, ...typography.body, marginTop: spacing.sm, marginBottom: spacing.sm},
});
