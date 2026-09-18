import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppCard, AppListRow, IconTile, Metric} from '../../components/DesignSystem';
import {AppIcon, AppIconName} from '../../components/AppIcon';
import {Screen} from '../../components/Screen';
import {useAuthStore} from '../../stores/auth';
import {colors, radii, spacing, typography} from '../../theme';
import {useAppDialog} from '../../components/AppDialog';
import {isShortDramaEnabled, productModules} from '../../config/modules';

const quickActions: Array<{label: string; route: string; icon: AppIconName}> = [
  ...(productModules.withdrawals ? [{label: '金币提现', route: 'Withdrawal', icon: 'wallet' as AppIconName}] : []),
  ...(productModules.invitations ? [{label: '邀请好友', route: 'Share', icon: 'user-plus' as AppIconName}] : []),
  ...(isShortDramaEnabled ? [
    {label: '我的收藏', route: 'Favorites', icon: 'heart' as AppIconName},
    {label: '观看历史', route: 'History', icon: 'history' as AppIconName},
  ] : []),
];

const accountRows: Array<{title: string; subtitle: string; route: string; icon: AppIconName}> = [
  {title: '个人资料', subtitle: '头像、昵称与个人简介', route: 'ProfileEdit', icon: 'edit'},
  {title: productModules.withdrawals ? '账户与收款安全' : '账户安全', subtitle: productModules.withdrawals ? '密码和支付宝收款账户' : '登录密码与账户保护', route: 'Security', icon: 'shield'},
  {title: '通知中心', subtitle: '系统消息和奖励提醒', route: 'Notifications', icon: 'bell'},
];

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const dialog = useAppDialog();
  const setUser = useAuthStore(state => state.setUser);
  const logout = useAuthStore(state => state.logout);
  const [inviteCode, setInviteCode] = useState('--');
  const [invitedCount, setInvitedCount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profile, center, ledgerResult] = await Promise.all([
        appApi.me(),
        productModules.invitations ? appApi.inviteInfo() : Promise.resolve(undefined),
        productModules.rewards ? appApi.rewardLedgers() : Promise.resolve(undefined),
      ]);
      setUser(profile);
      setAvatarFailed(false);
      setInviteCode(center?.inviteCode || '--');
      setInvitedCount(center?.invitedCount ?? 0);
      setTotalIncome(
        (ledgerResult?.list ?? [])
          .filter(item => Number(item.amount) > 0)
          .reduce((sum, item) => sum + Number(item.amount), 0),
      );
    } finally {
      setRefreshing(false);
    }
  }, [setUser]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const user = useAuthStore(state => state.user);
  const maskedPhone = useMemo(() => {
    const phone = user?.phone ?? '';
    return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
  }, [user?.phone]);

  const confirmLogout = async () => {
    const confirmed = await dialog.confirm({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmText: '退出',
      tone: 'danger',
    });
    if (confirmed) await logout().catch(() => undefined);
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); load().catch(() => undefined);}} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>我的</Text>
          <Pressable onPress={() => navigation.navigate('Settings')} style={({pressed}) => [styles.settingsButton, pressed && styles.pressed]}>
            <AppIcon name="settings" color={colors.text} size={21} />
          </Pressable>
        </View>

        <AppCard style={styles.profileCard} elevated>
          <View style={styles.profileRow}>
            <Pressable onPress={() => navigation.navigate('ProfileEdit')} style={({pressed}) => pressed && styles.pressed}>
              {user?.avatarUrl && !avatarFailed ? (
                <Image source={{uri: user.avatarUrl}} style={styles.avatar} onError={() => setAvatarFailed(true)} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{user?.nickname?.slice(0, 1) || '幻'}</Text>
                </View>
              )}
              <View style={styles.editBadge}><AppIcon name="edit" color="#1B1609" size={11} /></View>
            </Pressable>
            <View style={styles.profileBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{user?.nickname || '幻乐用户'}</Text>
                <View style={styles.roleBadge}><Text style={styles.roleText}>普通用户</Text></View>
              </View>
              <Text style={styles.phone}>{maskedPhone || '未设置手机号'}</Text>
              {productModules.invitations ? <Pressable onPress={() => navigation.navigate('Share')} style={styles.inviteRow}>
                <Text style={styles.inviteLabel}>邀请码</Text>
                <Text style={styles.inviteCode}>{inviteCode}</Text>
                <AppIcon name="chevron-right" color={colors.subtle} size={14} />
              </Pressable> : null}
            </View>
          </View>
          <View style={styles.metricBar}>
            <Metric label="可用金币" value={Number(user?.coinBalance ?? 0).toLocaleString('zh-CN')} accent />
            {productModules.rewards ? <><View style={styles.divider} /><Metric label="累计收益" value={totalIncome.toLocaleString('zh-CN')} /></> : null}
            {productModules.invitations ? <><View style={styles.divider} /><Metric label="直属好友" value={invitedCount} /></> : null}
          </View>
        </AppCard>

        <Text style={styles.sectionTitle}>常用功能</Text>
        <AppCard style={styles.quickCard}>
          {quickActions.map(action => (
            <Pressable key={action.route} onPress={() => navigation.navigate(action.route)} style={({pressed}) => [styles.quickItem, pressed && styles.pressed]}>
              <IconTile name={action.icon} size={48} />
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </AppCard>

        <Text style={styles.sectionTitle}>账户与服务</Text>
        <AppCard style={styles.listCard}>
          {accountRows.map((row, index) => (
            <View key={row.route} style={index ? styles.rowBorder : undefined}>
              <AppListRow {...row} onPress={() => navigation.navigate(row.route)} />
            </View>
          ))}
          <View style={styles.rowBorder}>
            <AppListRow icon="info" title="帮助与反馈" subtitle="常见问题与问题反馈" onPress={() => navigation.navigate('Help')} />
          </View>
          <View style={styles.rowBorder}>
            <AppListRow icon="settings" title="设置" subtitle="协议、隐私与应用信息" onPress={() => navigation.navigate('Settings')} />
          </View>
        </AppCard>

        <Pressable onPress={confirmLogout} style={({pressed}) => [styles.logout, pressed && styles.pressed]}>
          <Text style={styles.logoutText}>退出当前账号</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl},
  headingRow: {paddingTop: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center'},
  heading: {color: colors.text, ...typography.title, flex: 1},
  settingsButton: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'},
  pressed: {opacity: 0.68, transform: [{scale: 0.98}]},
  profileCard: {borderRadius: radii.xl, padding: spacing.lg},
  profileRow: {flexDirection: 'row', alignItems: 'center'},
  avatar: {width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceAlt},
  avatarFallback: {width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: '#1B1609', fontSize: 27, fontWeight: '800'},
  editBadge: {position: 'absolute', right: -2, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center'},
  profileBody: {flex: 1, marginLeft: spacing.lg},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  name: {color: colors.text, fontSize: 21, lineHeight: 28, fontWeight: '700', maxWidth: '62%'},
  roleBadge: {backgroundColor: colors.primarySoft, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 3},
  roleText: {color: colors.primary, ...typography.caption, fontWeight: '600'},
  phone: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  inviteRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs},
  inviteLabel: {color: colors.subtle, ...typography.caption},
  inviteCode: {color: colors.text, ...typography.label},
  metricBar: {flexDirection: 'row', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider},
  divider: {width: 1, height: 34, backgroundColor: colors.divider, alignSelf: 'center'},
  sectionTitle: {color: colors.text, ...typography.section, marginTop: spacing.xl, marginBottom: spacing.md},
  quickCard: {padding: spacing.md, flexDirection: 'row'},
  quickItem: {flex: 1, alignItems: 'center', paddingVertical: spacing.sm},
  quickLabel: {color: colors.text, ...typography.caption, fontWeight: '600', marginTop: spacing.sm},
  listCard: {paddingVertical: 0},
  rowBorder: {borderTopWidth: 1, borderTopColor: colors.divider},
  logout: {alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.xl},
  logoutText: {color: colors.muted, ...typography.label},
});
