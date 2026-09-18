import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {ReactNode, useEffect, useState} from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {appApi} from '../api/app';
import {getInstallationId} from '../api/client';
import {appConfig} from '../config/app-config';
import type {AppVersionCheck} from '../types/api';
import {colors, radii, spacing, typography} from '../theme';
import {AppIcon} from './AppIcon';
import {AppButton, AppCard} from './DesignSystem';

const DEFERRED_UPDATE_KEY = 'hly_deferred_update_v1';
const DEFER_DURATION_MS = 24 * 60 * 60 * 1000;

type DeferredUpdate = {until: number; versionCode: number};

async function isDeferred(versionCode: number) {
  try {
    const stored = await AsyncStorage.getItem(DEFERRED_UPDATE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as Partial<DeferredUpdate>;
    return parsed.versionCode === versionCode && Number(parsed.until) > Date.now();
  } catch {
    return false;
  }
}

/** 冷启动版本门禁：检查失败不阻塞使用，只有服务端明确要求时才强制升级。 */
export function AppUpdateGate({children}: {children: ReactNode}) {
  const [update, setUpdate] = useState<Extract<AppVersionCheck, {hasUpdate: true}>>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    let active = true;
    getInstallationId()
      .then(id => appApi.checkVersion(id))
      .then(async result => {
        if (!active || !result.hasUpdate) return;
        if (!result.force && await isDeferred(result.release.versionCode)) return;
        setUpdate(result);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const defer = async () => {
    if (!update || update.force) return;
    await AsyncStorage.setItem(DEFERRED_UPDATE_KEY, JSON.stringify({
      versionCode: update.release.versionCode,
      until: Date.now() + DEFER_DURATION_MS,
    } satisfies DeferredUpdate));
    setUpdate(undefined);
  };

  const download = async () => {
    if (!update || opening) return;
    const url = update.release.downloadUrl.trim();
    if (!/^https:\/\//i.test(url) && appConfig.environment === 'production') {
      setOpenError('下载地址配置异常，请联系官方客服');
      return;
    }
    setOpening(true);
    setOpenError('');
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      setOpenError('无法打开下载地址，请检查网络后重试');
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => { if (!update?.force) defer().catch(() => undefined); }}
        statusBarTranslucent
        transparent
        visible={Boolean(update)}>
        <View style={styles.backdrop}>
          <AppCard elevated style={styles.dialog}>
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <AppIcon name="refresh" color={colors.primary} size={28} />
              </View>
              {update?.force ? <View style={styles.requiredBadge}><Text style={styles.requiredText}>必须更新</Text></View> : null}
            </View>
            <Text style={styles.title}>{update?.force ? '需要更新后继续使用' : '发现新版本'}</Text>
            <Text style={styles.version}>当前 {appConfig.versionName} · 最新 {update?.release.versionName}</Text>
            <View style={styles.divider} />
            <Text style={styles.notesTitle}>本次更新</Text>
            <ScrollView style={styles.notesScroll} contentContainerStyle={styles.notesContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.notes}>{update?.release.releaseNotes}</Text>
            </ScrollView>
            {openError ? <Text accessibilityRole="alert" style={styles.error}>{openError}</Text> : null}
            <AppButton title="立即更新" icon="refresh" loading={opening} onPress={() => { download().catch(() => undefined); }} />
            {!update?.force ? <AppButton title="稍后再说" variant="ghost" onPress={() => { defer().catch(() => undefined); }} style={styles.laterButton} /> : null}
            {update?.force ? <Text style={styles.forceTip}>当前版本已停止支持，更新完成后请重新打开 APP</Text> : null}
          </AppCard>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,5,9,0.84)', padding: spacing.xl},
  dialog: {width: '100%', maxWidth: 420, borderRadius: radii.xl, padding: spacing.xl},
  header: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  iconWrap: {width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft},
  requiredBadge: {borderRadius: 999, backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.xs},
  requiredText: {color: colors.danger, ...typography.label},
  title: {color: colors.text, ...typography.title, marginTop: spacing.lg},
  version: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  divider: {height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg},
  notesTitle: {color: colors.text, ...typography.label, marginBottom: spacing.sm},
  notesScroll: {maxHeight: 180, marginBottom: spacing.lg},
  notesContent: {paddingBottom: spacing.xs},
  notes: {color: colors.muted, ...typography.body, lineHeight: 24},
  error: {color: colors.danger, ...typography.caption, marginBottom: spacing.md},
  laterButton: {marginTop: spacing.sm},
  forceTip: {color: colors.subtle, ...typography.caption, textAlign: 'center', marginTop: spacing.md},
});
