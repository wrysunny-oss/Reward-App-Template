import React, {useCallback, useState} from 'react';
import {Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFocusEffect} from '@react-navigation/native';
import {appApi} from '../../api/app';
import type {AppIconName} from '../../components/AppIcon';
import {useAppToast} from '../../components/AppToast';
import {AppCard, EmptyState, IconTile, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {colors, spacing, typography} from '../../theme';
import type {AppNotification} from '../../types/api';

type Notice = {
  id: string;
  source: 'ANNOUNCEMENT' | 'PERSONAL';
  type: string;
  title: string;
  content: string;
  read: boolean;
  createdAt?: string;
};

const readStorageKey = 'hly_read_announcement_ids_v1';
const iconByType: Record<string, AppIconName> = {
  ANNOUNCEMENT: 'megaphone',
  PROMOTION: 'sparkles',
  REWARD: 'coins',
  SYSTEM: 'bell',
  WITHDRAWAL: 'wallet',
};

function parseReadIds(stored: string | null) {
  try {
    const value = stored ? JSON.parse(stored) : [];
    return new Set<string>(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

export function NotificationsScreen() {
  const toast = useAppToast();
  const [list, setList] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [bootstrap, personal, stored] = await Promise.all([
        appApi.bootstrap(),
        appApi.notifications(),
        AsyncStorage.getItem(readStorageKey),
      ]);
      const readAnnouncementIds = parseReadIds(stored);
      const announcements: Notice[] = bootstrap.announcements.map(item => ({
        ...item,
        source: 'ANNOUNCEMENT',
        type: 'ANNOUNCEMENT',
        read: readAnnouncementIds.has(item.id),
      }));
      const messages: Notice[] = personal.list.map((item: AppNotification) => ({
        ...item,
        source: 'PERSONAL',
        read: Boolean(item.readAt),
      }));
      setList([...messages, ...announcements].sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '通知加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); }
    finally { setRefreshing(false); }
  }, [load]);

  const markRead = async (notice: Notice) => {
    if (notice.read) return;
    setList(current => current.map(item => item.id === notice.id && item.source === notice.source ? {...item, read: true} : item));
    try {
      if (notice.source === 'PERSONAL') {
        await appApi.markNotificationRead(notice.id);
      } else {
        const readIds = parseReadIds(await AsyncStorage.getItem(readStorageKey));
        readIds.add(notice.id);
        await AsyncStorage.setItem(readStorageKey, JSON.stringify([...readIds]));
      }
    } catch (requestError) {
      toast.show(requestError instanceof Error ? requestError.message : '已读状态保存失败', 'error');
      load().catch(() => undefined);
    }
  };

  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const readIds = parseReadIds(await AsyncStorage.getItem(readStorageKey));
      const announcementIds = list.filter(item => item.source === 'ANNOUNCEMENT').map(item => item.id);
      announcementIds.forEach(id => readIds.add(id));
      await Promise.all([
        appApi.markAllNotificationsRead(),
        AsyncStorage.setItem(readStorageKey, JSON.stringify([...readIds])),
      ]);
      setList(current => current.map(item => ({...item, read: true})));
      toast.show('全部通知已标记为已读', 'success');
    } catch (requestError) {
      toast.show(requestError instanceof Error ? requestError.message : '操作失败，请稍后重试', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const unread = list.filter(item => !item.read).length;
  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View style={styles.header}><View><Text style={styles.title}>通知中心</Text><Text style={styles.subtitle}>{unread ? `${unread} 条未读消息` : '消息已全部阅读'}</Text></View>{unread ? <Pressable disabled={markingAll} onPress={() => markAllRead().catch(() => undefined)}><Text style={styles.readAll}>{markingAll ? '处理中…' : '全部已读'}</Text></Pressable> : null}</View>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>全部消息</Text><Text style={styles.count}>共 {list.length} 条</Text></View>
        {error && list.length ? <AppCard style={styles.warning}><Text style={styles.warningText}>刷新失败，当前显示上次成功加载的数据。</Text></AppCard> : null}
        {loading && !list.length ? <View style={styles.list}><SkeletonBlock style={styles.skeleton} /><SkeletonBlock style={styles.skeleton} /></View> : error && !list.length ? <EmptyState title="通知加载失败" description={error} action="重新加载" onAction={load} icon="bell" /> : !list.length ? <EmptyState title="暂无消息" description="奖励到账、提现进度和平台公告会显示在这里" icon="bell" /> : <View style={styles.list}>{list.map(item => <Pressable key={`${item.source}-${item.id}`} onPress={() => markRead(item).catch(() => undefined)} style={({pressed}) => pressed && styles.pressed}><AppCard style={[styles.card, !item.read && styles.unreadCard]}><IconTile name={iconByType[item.type] ?? 'bell'} size={44} color={item.read ? colors.muted : colors.primary} /><View style={styles.body}><View style={styles.titleRow}><Text style={styles.noticeTitle}>{item.title}</Text>{!item.read ? <View style={styles.dot} /> : null}</View><Text style={styles.noticeContent}>{item.content}</Text>{item.createdAt ? <Text style={styles.time}>{new Date(item.createdAt).toLocaleString('zh-CN', {hour12: false})}</Text> : null}</View></AppCard></Pressable>)}</View>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, header: {paddingTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, title: {color: colors.text, ...typography.title}, subtitle: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, readAll: {color: colors.primary, ...typography.label}, sectionRow: {flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xl}, sectionTitle: {color: colors.text, ...typography.section}, count: {color: colors.muted, ...typography.caption, marginLeft: 'auto'}, list: {gap: spacing.md}, skeleton: {height: 112}, warning: {marginBottom: spacing.md, backgroundColor: colors.primarySoft, borderColor: '#4A3C1B'}, warningText: {color: colors.muted, ...typography.caption}, card: {flexDirection: 'row', padding: spacing.md}, unreadCard: {borderColor: '#4A3C1B', backgroundColor: colors.primarySoft}, body: {flex: 1, marginLeft: spacing.md}, titleRow: {flexDirection: 'row', alignItems: 'center'}, noticeTitle: {flexShrink: 1, color: colors.text, ...typography.body, fontWeight: '600'}, dot: {width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger, marginLeft: spacing.sm}, noticeContent: {color: colors.muted, ...typography.body, marginTop: spacing.xs}, time: {color: colors.subtle, ...typography.caption, marginTop: spacing.sm}, pressed: {opacity: 0.68},
});
