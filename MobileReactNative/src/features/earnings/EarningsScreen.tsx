import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Svg, {Circle, Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import {appApi} from '../../api/app';
import {AppCard, AppButton, EmptyState, IconTile, Metric, SectionHeader, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {colors, radii, spacing, typography} from '../../theme';
import type {AuthUser, RewardLedger, WithdrawalConfig} from '../../types/api';
import type {AppIconName} from '../../components/AppIcon';
import {productModules} from '../../config/modules';

const ledgerMeta: Record<string, {label: string; icon: AppIconName}> = {
  AD: {label: '广告收益', icon: 'play'},
  INVITE: {label: '邀请返佣', icon: 'users'},
  SIGNIN: {label: '签到奖励', icon: 'calendar-check'},
  TASK: {label: '任务奖励', icon: 'gift'},
  WITHDRAW: {label: '金币提现', icon: 'wallet'},
  ADJUSTMENT: {label: '余额调整', icon: 'coins'},
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function groupName(dateText: string) {
  const date = new Date(dateText);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return '今天';
  if (dayKey(date) === dayKey(yesterday)) return '昨天';
  return '更早';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function TrendChart({values}: {values: number[]}) {
  const width = 320;
  const height = 112;
  const top = 12;
  const bottom = 98;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({
    x: 8 + index * ((width - 16) / Math.max(values.length - 1, 1)),
    y: bottom - (value / max) * (bottom - top),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = `${line} L${points.at(-1)?.x ?? width},${height} L${points[0]?.x ?? 0},${height} Z`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.primary} stopOpacity="0.32" />
          <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#incomeArea)" />
      <Path d={line} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <Circle key={index} cx={point.x} cy={point.y} r={3} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
      ))}
    </Svg>
  );
}

export function EarningsScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<AuthUser>();
  const [ledgers, setLedgers] = useState<RewardLedger[]>([]);
  const [config, setConfig] = useState<WithdrawalConfig>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [user, ledgerResult, withdrawalConfig] = await Promise.all([
        appApi.me(),
        appApi.rewardLedgers(),
        productModules.withdrawals ? appApi.withdrawalConfig() : Promise.resolve(undefined),
      ]);
      setProfile(user);
      setLedgers(ledgerResult.list ?? []);
      setConfig(withdrawalConfig);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '收益信息加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const summary = useMemo(() => {
    const today = dayKey(new Date());
    const positive = ledgers.filter(item => Number(item.amount) > 0);
    const total = positive.reduce((sum, item) => sum + Number(item.amount), 0);
    const todayIncome = positive
      .filter(item => dayKey(new Date(item.createdAt)) === today)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const trend = Array.from({length: 7}, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - offset));
      const key = dayKey(date);
      return positive
        .filter(item => dayKey(new Date(item.createdAt)) === key)
        .reduce((sum, item) => sum + Number(item.amount), 0);
    });
    return {total, todayIncome, trend};
  }, [ledgers]);

  const groups = useMemo(
    () => ['今天', '昨天', '更早'].map(title => ({title, items: ledgers.filter(item => groupName(item.createdAt) === title)})).filter(group => group.items.length),
    [ledgers],
  );
  const balance = Number(profile?.coinBalance ?? 0);
  const estimatedYuan = config?.coinsPerCent ? balance / config.coinsPerCent / 100 : 0;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View style={styles.header}>
          <Text style={styles.title}>我的收益</Text>
          <Text style={styles.subtitle}>每一笔金币变动都清晰可查</Text>
        </View>

        {loading && !profile ? (
          <SkeletonBlock style={styles.balanceSkeleton} />
        ) : error && !profile ? (
          <EmptyState title="收益加载失败" description={error} action="重新加载" onAction={load} icon="wallet" />
        ) : (
          <AppCard style={styles.balanceCard} elevated>
            <View style={styles.balanceTop}>
              <View>
                <Text style={styles.balanceLabel}>可用金币</Text>
                <Text style={styles.balance}>{balance.toLocaleString('zh-CN')}</Text>
                {productModules.withdrawals ? <Text style={styles.estimate}>约 ¥{estimatedYuan.toFixed(2)} · 实际以提现结算为准</Text> : null}
              </View>
              <IconTile name="coins" size={54} />
            </View>
            {productModules.withdrawals ? <AppButton title="立即提现" icon="wallet" onPress={() => navigation.navigate('Withdrawal')} /> : null}
          </AppCard>
        )}

        <AppCard style={styles.metrics}>
          <Metric label="今日收益" value={`+${summary.todayIncome}`} accent />
          <View style={styles.metricDivider} />
          <Metric label="累计收益" value={summary.total.toLocaleString('zh-CN')} />
          <View style={styles.metricDivider} />
          <Metric label="冻结金币" value={Number(profile?.frozenCoinBalance ?? 0).toLocaleString('zh-CN')} />
        </AppCard>

        <View style={styles.section}>
          <SectionHeader title="收益趋势" description="最近 7 天金币收入" action="近 7 天" />
          <AppCard style={styles.chartCard}>
            <TrendChart values={summary.trend} />
            <View style={styles.chartLabels}>
              {['6天前', '', '', '3天前', '', '', '今天'].map((label, index) => <Text key={index} style={styles.chartLabel}>{label}</Text>)}
            </View>
          </AppCard>
        </View>

        <View style={styles.section}>
          <SectionHeader title="收益明细" description="收入为绿色，支出为红色" />
          {!loading && !ledgers.length ? (
            <EmptyState title="暂无收益明细" description="完成签到、观看广告或邀请好友后，记录会显示在这里" icon="trend" />
          ) : (
            groups.map(group => (
              <View key={group.title} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <AppCard style={styles.ledgerCard}>
                  {group.items.map((item, index) => {
                    const amount = Number(item.amount);
                    const meta = ledgerMeta[item.type] ?? {label: '金币变动', icon: 'coins' as const};
                    return (
                      <View key={item.id} style={[styles.ledgerRow, index > 0 && styles.ledgerBorder]}>
                        <IconTile name={meta.icon} color={amount >= 0 ? colors.success : colors.danger} size={40} />
                        <View style={styles.ledgerBody}>
                          <Text style={styles.ledgerTitle}>{item.title || meta.label}</Text>
                          <Text style={styles.ledgerMeta}>{meta.label} · {formatTime(item.createdAt)}</Text>
                        </View>
                        <Text style={[styles.amount, {color: amount >= 0 ? colors.success : colors.danger}]}>
                          {amount >= 0 ? '+' : ''}{amount}
                        </Text>
                      </View>
                    );
                  })}
                </AppCard>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl},
  header: {paddingTop: spacing.lg, paddingBottom: spacing.xl},
  title: {color: colors.text, ...typography.title},
  subtitle: {color: colors.muted, ...typography.body, marginTop: spacing.xs},
  balanceSkeleton: {height: 190},
  balanceCard: {backgroundColor: colors.primarySoft, borderColor: '#4A3C1B', borderRadius: radii.xl, gap: spacing.xl},
  balanceTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  balanceLabel: {color: '#C6B98F', ...typography.label},
  balance: {color: colors.primary, fontSize: 38, lineHeight: 48, fontWeight: '800', marginTop: spacing.xs},
  estimate: {color: colors.muted, ...typography.caption, marginTop: spacing.xs},
  metrics: {flexDirection: 'row', marginTop: spacing.md, paddingVertical: spacing.lg},
  metricDivider: {width: 1, height: 36, alignSelf: 'center', backgroundColor: colors.divider},
  section: {marginTop: spacing.xl, gap: spacing.md},
  chartCard: {paddingBottom: spacing.md},
  chartLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  chartLabel: {color: colors.subtle, ...typography.caption, flex: 1, textAlign: 'center'},
  group: {gap: spacing.sm},
  groupTitle: {color: colors.muted, ...typography.label, marginLeft: spacing.xs},
  ledgerCard: {paddingVertical: 0},
  ledgerRow: {minHeight: 72, flexDirection: 'row', alignItems: 'center'},
  ledgerBorder: {borderTopWidth: 1, borderTopColor: colors.divider},
  ledgerBody: {flex: 1, marginLeft: spacing.md},
  ledgerTitle: {color: colors.text, ...typography.body, fontWeight: '600'},
  ledgerMeta: {color: colors.muted, ...typography.caption, marginTop: 2},
  amount: {fontSize: 16, lineHeight: 22, fontWeight: '700'},
});
