import React, {ReactNode, useEffect, useState} from 'react';
import {BackHandler, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppIcon} from './AppIcon';
import {AppButton, AppCard} from './DesignSystem';
import {BrandLoader} from './BrandLoader';
import {dramaNative} from '../native/drama';
import {adProvider} from '../native/ad-provider';
import {refreshAdRuntimeConfig} from '../native/ad-runtime';
import {refreshShortDramaRuntimeConfig} from '../native/short-drama-runtime';
import {contentType, isShortDramaEnabled} from '../config/modules';
import {colors, radii, spacing, typography} from '../theme';

const CONSENT_KEY = 'hly_privacy_consent_v1';
const nativeServiceDescription = contentType === 'shortDrama'
  ? '短剧播放、激励广告、账号安全和风险检测'
  : '内容服务、激励广告、账号安全和风险检测';

/** 隐私授权后初始化原生 SDK；开屏失败时也必须放行应用。 */
async function initializeNativeSdksAndSplash() {
  await Promise.all([
    refreshAdRuntimeConfig(),
    isShortDramaEnabled ? refreshShortDramaRuntimeConfig() : Promise.resolve(),
  ]);
  const [adResult] = await Promise.allSettled([
    adProvider.initialize(),
    dramaNative.initialize(),
  ]);
  if (adResult.status === 'fulfilled') {
    await adProvider.showStartupSplash();
  }
}

/** 用户同意隐私政策后再初始化广告和内容 SDK，确保原生采集时机合规。 */
export function PrivacyConsentGate({children}: {children: ReactNode}) {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then(value => {
      if (value) {
        initializeNativeSdksAndSplash().catch(() => undefined).finally(() => setReady(true));
      } else {
        setVisible(true); setReady(true);
      }
    }).catch(() => { setVisible(true); setReady(true); });
  }, []);
  const agree = async () => {
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({version: 1, agreedAt: new Date().toISOString()}));
    setVisible(false);
    setReady(false);
    await initializeNativeSdksAndSplash().catch(() => undefined);
    setReady(true);
  };
  if (!ready) return <BrandLoader fullScreen label="正在初始化安全服务" />;
  return <>{children}<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}><View style={styles.backdrop}><AppCard style={styles.dialog} elevated><View style={styles.dialogIcon}><AppIcon name="shield" color={colors.primary} size={28} /></View><Text style={styles.title}>隐私保护说明</Text><Text style={styles.description}>为了提供{nativeServiceDescription}服务，我们需要在获得你的同意后初始化相关 SDK。你可以阅读《用户协议》和《隐私政策》了解详细规则。</Text><View style={styles.links}><Pressable><Text style={styles.link}>《用户协议》</Text></Pressable><Pressable><Text style={styles.link}>《隐私政策》</Text></Pressable></View><AppButton title="同意并继续" icon="check" onPress={() => agree().catch(() => undefined)} /><Pressable onPress={() => BackHandler.exitApp()} style={styles.decline}><Text style={styles.declineText}>不同意并退出</Text></Pressable></AppCard></View></Modal></>;
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl}, dialog: {width: '100%', borderRadius: radii.xl, padding: spacing.xl}, dialogIcon: {width: 56, height: 56, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center'}, title: {color: colors.text, ...typography.title, marginTop: spacing.lg}, description: {color: colors.muted, ...typography.body, lineHeight: 25, marginTop: spacing.md}, links: {flexDirection: 'row', marginVertical: spacing.xl}, link: {color: colors.primary, ...typography.label, marginRight: spacing.sm}, decline: {alignItems: 'center', paddingTop: spacing.lg}, declineText: {color: colors.muted, ...typography.label},
});
