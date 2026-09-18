import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppCard, AppListRow} from '../../components/DesignSystem';
import {BrandMark} from '../../components/BrandMark';
import {Screen} from '../../components/Screen';
import {RichText} from '../../components/RichText';
import {appConfig, appVersionLabel} from '../../config/app-config';
import {colors, spacing, typography} from '../../theme';
import {useAppDialog} from '../../components/AppDialog';
import {brandConfig} from '../../config/brand';

const DEFAULT_ABOUT_CONTENT = `${brandConfig.name}是一款短剧与福利应用。当前移动端使用 React Native 重构，业务数据由 Express 后端统一提供。`;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const dialog = useAppDialog();
  const clearSearchHistory = async () => {
    try {
      await AsyncStorage.removeItem('search-history');
      await dialog.alert({title: '清理完成', message: '搜索历史已经清除', tone: 'success'});
    } catch {
      await dialog.alert({title: '清理失败', message: '请稍后重试', tone: 'danger'});
    }
  };
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.brand}><BrandMark size={68} style={styles.logo} /><Text style={styles.name}>{brandConfig.name}</Text><Text style={styles.version}>当前版本 {appVersionLabel} · {appConfig.environment === 'production' ? '正式版' : appConfig.environment === 'test' ? '测试版' : '开发版'}</Text></View>
        <Text style={styles.sectionTitle}>账户</Text><AppCard style={styles.listCard}><AppListRow icon="wallet" title="绑定收款账户" subtitle="管理支付宝实名收款信息" onPress={() => navigation.navigate('Security')} /></AppCard>
        <Text style={styles.sectionTitle}>通用</Text><AppCard style={styles.listCard}><AppListRow icon="refresh" title="清理搜索缓存" subtitle="不会删除收藏与观看记录" onPress={clearSearchHistory} /><View style={styles.divider} /><AppListRow icon="info" title="用户协议" onPress={() => navigation.navigate('Agreement', {type: 'user'})} /><View style={styles.divider} /><AppListRow icon="shield" title="隐私政策" onPress={() => navigation.navigate('Agreement', {type: 'privacy'})} /><View style={styles.divider} /><AppListRow icon="film" title={brandConfig.aboutTitle} onPress={() => navigation.navigate('About')} /></AppCard>
      </ScrollView>
    </Screen>
  );
}

export function AboutScreen() {
  const [content, setContent] = useState(DEFAULT_ABOUT_CONTENT);

  useEffect(() => {
    appApi.document('HELP_CENTER')
      .then(document => setContent(document.content || DEFAULT_ABOUT_CONTENT))
      .catch(() => undefined);
  }, []);

  return <Screen><ScrollView style={styles.aboutScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.about}><BrandMark size={88} style={styles.aboutLogo} /><Text style={styles.aboutTitle}>{brandConfig.name}</Text><Text style={styles.aboutVersion}>Android 版本 {appVersionLabel}</Text><AppCard style={styles.aboutCard}><RichText content={content} /></AppCard><Text style={styles.copyright}>© 2026 {brandConfig.name}</Text></ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, brand: {alignItems: 'center', paddingVertical: spacing.xxl}, logo: {shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3}, name: {color: colors.text, ...typography.title, marginTop: spacing.lg}, version: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, sectionTitle: {color: colors.text, ...typography.section, marginTop: spacing.md, marginBottom: spacing.md}, listCard: {paddingVertical: 0}, divider: {height: 1, backgroundColor: colors.divider}, aboutScroll: {flex: 1}, about: {alignItems: 'center', paddingTop: 80, paddingBottom: spacing.xxl}, aboutLogo: {shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4}, aboutTitle: {color: colors.text, ...typography.title, marginTop: spacing.xl}, aboutVersion: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, aboutCard: {marginTop: spacing.xxl, width: '100%'}, copyright: {color: colors.subtle, ...typography.caption, marginTop: spacing.xxl},
});
