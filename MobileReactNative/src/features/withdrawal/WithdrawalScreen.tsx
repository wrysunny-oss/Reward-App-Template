import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useIsFocused, useNavigation} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {useAppToast} from '../../components/AppToast';
import {AppButton, AppCard, EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {colors, radii, spacing, typography} from '../../theme';
import type {AuthUser, PayoutAccount, WithdrawalConfig, WithdrawalRecord} from '../../types/api';
import {ensureRiskAssessment} from '../../native/risk';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_REQUEST_KEY = 'hly_pending_withdrawal_request_v2';
const statusMeta: Record<WithdrawalRecord['status'], {label: string; color: string}> = {
  PENDING: {label: '待审核', color: colors.primary}, REJECTED: {label: '已拒绝', color: colors.danger}, PAYING: {label: '打款中', color: colors.primary}, COMPLETED: {label: '已到账', color: colors.success}, FAILED: {label: '打款失败', color: colors.danger},
};
const channelText = {ALIPAY: '支付宝', BANK: '银行卡', WECHAT: '微信'} as const;

function WithdrawalRecordItem({item}: {item: WithdrawalRecord}) {
  const meta = statusMeta[item.status] ?? {label: item.status, color: colors.muted};
  return (
    <AppCard style={styles.recordItem}>
      <View style={styles.recordHeader}>
        <View style={styles.recordAccount}>
          <View style={styles.recordIcon}>
            <AppIcon name="wallet" color={meta.color} size={19} />
          </View>
          <View style={styles.recordAccountBody}>
            <Text style={styles.recordTitle}>{channelText[item.channel]}提现</Text>
            <Text style={styles.recordAccountText}>{item.accountMasked}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, {borderColor: meta.color}]}>
          <Text style={[styles.status, {color: meta.color}]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.recordAmountRow}>
        <View>
          <Text style={styles.recordAmountLabel}>实际到账</Text>
          <Text style={styles.recordAmount}>¥{(item.actualCents / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.recordCoinsBlock}>
          <Text style={styles.recordAmountLabel}>扣除金币</Text>
          <Text style={styles.recordCoins}>{Number(item.coins).toLocaleString('zh-CN')}</Text>
        </View>
      </View>

      <View style={styles.recordMetaRow}>
        <AppIcon name="clock" color={colors.subtle} size={13} />
        <Text style={styles.recordTime}>{new Date(item.createdAt).toLocaleString('zh-CN', {hour12: false})}</Text>
      </View>

      {item.reviewRemark ? (
        <View style={styles.recordMessage}>
          <Text style={styles.recordMessageLabel}>处理说明</Text>
          <Text style={[styles.remark, (item.status === 'COMPLETED' || item.status === 'PAYING') && styles.normalRemark]}>{item.reviewRemark}</Text>
        </View>
      ) : null}
      {item.paymentReference ? (
        <View style={styles.referenceRow}>
          <Text style={styles.referenceLabel}>支付流水号</Text>
          <Text selectable style={styles.reference}>{item.paymentReference}</Text>
        </View>
      ) : null}
    </AppCard>
  );
}

export function WithdrawalScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const toast = useAppToast();
  const [account, setAccount] = useState<PayoutAccount>();
  const [profile, setProfile] = useState<AuthUser>();
  const [config, setConfig] = useState<WithdrawalConfig>();
  const [records, setRecords] = useState<WithdrawalRecord[]>([]);
  const [coins, setCoins] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [payout, user, withdrawalConfig, history] = await Promise.all([appApi.payoutAccount(), appApi.me(), appApi.withdrawalConfig(), appApi.withdrawals()]);
      setAccount(payout); setProfile(user); setConfig(withdrawalConfig); setRecords(history.list ?? []);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '提现信息加载失败'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const activeRecord = records.find(item => item.status === 'PENDING' || item.status === 'PAYING');
  useEffect(() => {
    if (!isFocused || !activeRecord) return;
    const interval = setInterval(() => load().catch(() => undefined), 15_000);
    return () => clearInterval(interval);
  }, [activeRecord, isFocused, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); }
    finally { setRefreshing(false); }
  }, [load]);

  const value = Number(coins || 0);
  const min = Number(config?.minCoins ?? 0); const available = Number(profile?.coinBalance ?? 0);
  const tiers = useMemo(() => (config?.tiers ?? []).map(Number).filter(item => Number.isSafeInteger(item) && item > 0), [config?.tiers]);
  const amounts = useMemo(() => {
    const gross = config?.coinsPerCent ? Math.floor(value / config.coinsPerCent) : 0;
    const fee = Math.floor(gross * Number(config?.feeRateBps ?? 0) / 10000);
    return {gross, fee, actual: Math.max(0, gross - fee)};
  }, [config?.coinsPerCent, config?.feeRateBps, value]);
  const exchangeUnit = config?.coinsPerCent ?? 1;
  const validation = value > available
    ? '提现金币不能超过可用余额'
    : value && !tiers.includes(value)
      ? '请选择后台开放的提现档位'
      : value && value % exchangeUnit !== 0
        ? '该提现档位与当前兑换比例不匹配'
        : '';

  const submit = async () => {
    if (!account?.bound) return navigation.navigate('Security');
    if (!profile?.id) return toast.show('用户信息尚未加载完成，请稍后重试');
    if (!value || validation) return;
    setSubmitting(true);
    try {
      await ensureRiskAssessment('withdrawal');
      const coinValue = String(value);
      const stored = await AsyncStorage.getItem(PENDING_REQUEST_KEY);
      let pending: {coins: string; requestId: string; userId: string} | undefined;
      try { pending = stored ? JSON.parse(stored) : undefined; }
      catch { await AsyncStorage.removeItem(PENDING_REQUEST_KEY); }
      const requestId = pending && pending.userId === profile.id && pending.coins === coinValue
        ? pending.requestId
        : `rn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify({coins: coinValue, requestId, userId: profile.id}));
      const result = await appApi.createWithdrawal(coinValue, requestId);
      await AsyncStorage.removeItem(PENDING_REQUEST_KEY);
      setCoins(''); await load(); toast.show(result.duplicate ? '该提现申请已提交，无需重复操作' : '提现申请已提交审核', 'success');
    }
    catch (requestError) { toast.show(requestError instanceof Error ? requestError.message : '提交失败，请稍后重试', 'error'); }
    finally { setSubmitting(false); }
  };

  const frozen = Number(profile?.frozenCoinBalance ?? 0);
  const accountLabel = account?.channel ? channelText[account.channel] : '收款账户';
  return <Screen><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
    <View style={styles.header}><Text style={styles.title}>金币提现</Text><Text style={styles.subtitle}>提现规则、到账金额和处理进度清晰可查</Text></View>
    {loading ? <SkeletonBlock style={styles.skeleton} /> : error && !profile && !config ? <EmptyState title="提现信息加载失败" description={error} action="重新加载" onAction={load} icon="wallet" /> : <>
      {error ? <AppCard style={styles.refreshWarning}><AppIcon name="wifi-off" color={colors.primary} size={18} /><Text style={styles.refreshWarningText}>状态刷新失败，当前显示上次成功加载的数据，下拉可重试。</Text></AppCard> : null}
      <AppCard style={styles.balanceCard} elevated><View><Text style={styles.balanceLabel}>可提现金币</Text><Text style={styles.balance}>{available.toLocaleString('zh-CN')}</Text><Text style={styles.rate}>冻结中 {frozen.toLocaleString('zh-CN')} · 最低 {min.toLocaleString('zh-CN')} 金币起提</Text></View><View style={styles.walletIcon}><AppIcon name="wallet" color={colors.primary} size={28} /></View></AppCard>
      {!config?.enabled ? <AppCard style={styles.serviceClosed}><AppIcon name="info" color={colors.danger} size={20} /><View style={styles.closedBody}><Text style={styles.closedTitle}>提现服务暂未开放</Text><Text style={styles.closedText}>已有申请仍会继续处理，恢复开放后可提交新申请。</Text></View></AppCard> : null}
      {activeRecord ? <AppCard style={styles.progressCard}><View style={styles.progressHeader}><View><Text style={styles.progressTitle}>最近一笔提现正在处理</Text><Text style={styles.progressAmount}>¥{(activeRecord.actualCents / 100).toFixed(2)} · {statusMeta[activeRecord.status].label}</Text></View><AppIcon name="clock" color={colors.primary} size={22} /></View><View style={styles.steps}>{['申请提交', '审核通过', '确认到账'].map((label, index) => { const currentStep = activeRecord.status === 'PAYING' ? 1 : 0; const reached = index <= currentStep; return <React.Fragment key={label}>{index > 0 ? <View style={[styles.stepLine, reached && styles.stepLineActive]} /> : null}<View style={styles.step}><View style={[styles.stepDot, reached && styles.stepDotActive]}>{reached ? <AppIcon name="check" color="#1B1609" size={11} strokeWidth={3} /> : <Text style={styles.stepNumber}>{index + 1}</Text>}</View><Text style={[styles.stepLabel, reached && styles.stepLabelActive]}>{label}</Text></View></React.Fragment>; })}</View><Text style={styles.progressTip}>最后更新 {new Date(activeRecord.updatedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})} · 页面每 15 秒自动刷新，也可以下拉查询。</Text></AppCard> : null}
      <Text style={styles.sectionTitle}>选择提现档位</Text><AppCard style={styles.amountCard}>{tiers.length ? <View style={styles.presets}>{tiers.map(item => { const selected = value === item; const disabled = item > available; return <Pressable key={item} disabled={disabled} onPress={() => setCoins(String(item))} style={[styles.preset, selected && styles.presetActive, disabled && styles.presetDisabled]}><Text style={[styles.presetAmount, selected && styles.presetTextActive]}>¥{(item / exchangeUnit / 100).toFixed(2)}</Text><Text style={[styles.presetText, selected && styles.presetTextActive]}>{item.toLocaleString('zh-CN')} 金币</Text></Pressable>; })}</View> : <Text style={styles.error}>后台尚未配置提现档位</Text>}<Text style={[styles.estimate, validation ? styles.error : undefined]}>{validation || (value ? `手续费 ¥${(amounts.fee / 100).toFixed(2)} · 实际到账 ¥${(amounts.actual / 100).toFixed(2)}` : '请选择一个可用档位')}</Text></AppCard>
      <Text style={styles.sectionTitle}>收款账户</Text><AppCard style={styles.accountCard}><View style={styles.accountIcon}><AppIcon name="wallet" color={account?.bound ? colors.primary : colors.muted} size={21} /></View><View style={styles.accountBody}><Text style={styles.accountTitle}>{account?.bound ? `${accountLabel} ${account.accountMasked || ''}` : '尚未绑定收款账户'}</Text><Text style={styles.accountTip}>{account?.bound ? '提现款项将打入此账户' : '请先完成实名收款账户绑定'}</Text></View><Pressable onPress={() => navigation.navigate('Security')}><Text style={styles.bindText}>{account?.bound ? '更换' : '去绑定'}</Text></Pressable></AppCard>
      <AppButton title={!config?.enabled ? '提现服务暂未开放' : account?.bound ? '提交提现申请' : '先绑定收款账户'} icon={account?.bound ? 'wallet' : 'shield'} loading={submitting} disabled={!config?.enabled || !tiers.length || (account?.bound && (Boolean(validation) || !value))} onPress={submit} style={styles.submit} />
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>提现记录</Text><Text style={styles.recordCount}>共 {records.length} 笔</Text></View>{records.length ? <View style={styles.recordList}>{records.map(item => <WithdrawalRecordItem key={item.id} item={item} />)}</View> : <EmptyState title="暂无提现记录" description="提交提现申请后，处理进度会显示在这里" icon="wallet" />}
    </>}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, header: {paddingTop: spacing.lg, paddingBottom: spacing.xl}, title: {color: colors.text, ...typography.title}, subtitle: {color: colors.muted, ...typography.body, marginTop: spacing.xs}, skeleton: {height: 180}, balanceCard: {borderRadius: radii.xl, backgroundColor: colors.primarySoft, borderColor: '#4A3C1B', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, balanceLabel: {color: '#C8BA8C', ...typography.label}, balance: {color: colors.primary, fontSize: 36, lineHeight: 46, fontWeight: '800', marginTop: spacing.xs}, rate: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, walletIcon: {width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(231,184,74,0.12)', alignItems: 'center', justifyContent: 'center'}, sectionTitle: {color: colors.text, ...typography.section, marginTop: spacing.xl, marginBottom: spacing.md}, amountCard: {gap: spacing.md}, estimate: {color: colors.muted, ...typography.caption}, error: {color: colors.danger}, presets: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm}, preset: {width: '48%', minHeight: 62, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm}, presetActive: {backgroundColor: colors.primarySoft, borderColor: colors.primary}, presetDisabled: {opacity: 0.38}, presetAmount: {color: colors.text, ...typography.body, fontWeight: '700'}, presetText: {color: colors.muted, ...typography.caption, marginTop: 2}, presetTextActive: {color: colors.primary}, accountCard: {flexDirection: 'row', alignItems: 'center'}, accountIcon: {width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center'}, accountBody: {flex: 1, marginLeft: spacing.md}, accountTitle: {color: colors.text, ...typography.body, fontWeight: '600'}, accountTip: {color: colors.muted, ...typography.caption, marginTop: 2}, bindText: {color: colors.primary, ...typography.label}, submit: {marginTop: spacing.xl}, sectionRow: {flexDirection: 'row', alignItems: 'baseline'}, recordCount: {color: colors.muted, ...typography.caption, marginLeft: 'auto'}, recordList: {gap: spacing.md}, recordItem: {padding: spacing.md}, recordHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, recordAccount: {flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm}, recordIcon: {width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center'}, recordAccountBody: {flex: 1, marginLeft: spacing.sm}, recordTitle: {color: colors.text, ...typography.body, fontWeight: '600'}, recordAccountText: {color: colors.muted, ...typography.caption, marginTop: 2}, statusBadge: {minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center'}, status: {...typography.caption, fontWeight: '600'}, recordAmountRow: {marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'}, recordAmountLabel: {color: colors.subtle, ...typography.caption}, recordAmount: {color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: '700', marginTop: 2}, recordCoinsBlock: {alignItems: 'flex-end'}, recordCoins: {color: colors.muted, ...typography.label, marginTop: 3}, recordMetaRow: {marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs}, recordTime: {color: colors.subtle, ...typography.caption}, recordMessage: {marginTop: spacing.md, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surfaceAlt}, recordMessageLabel: {color: colors.subtle, ...typography.caption}, remark: {color: colors.danger, ...typography.caption, marginTop: 3, lineHeight: 18}, normalRemark: {color: colors.muted}, referenceRow: {marginTop: spacing.sm}, referenceLabel: {color: colors.subtle, ...typography.caption}, reference: {color: colors.muted, ...typography.caption, marginTop: 3, lineHeight: 18},
  refreshWarning: {marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', borderColor: '#4A3C1B', backgroundColor: colors.primarySoft}, refreshWarningText: {flex: 1, marginLeft: spacing.sm, color: colors.muted, ...typography.caption}, serviceClosed: {marginTop: spacing.md, flexDirection: 'row', borderColor: 'rgba(239,105,105,0.32)', backgroundColor: 'rgba(239,105,105,0.08)'}, closedBody: {flex: 1, marginLeft: spacing.sm}, closedTitle: {color: colors.text, ...typography.label}, closedText: {color: colors.muted, ...typography.caption, marginTop: 2}, progressCard: {marginTop: spacing.md}, progressHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, progressTitle: {color: colors.text, ...typography.body, fontWeight: '600'}, progressAmount: {color: colors.primary, ...typography.caption, marginTop: 3}, steps: {marginTop: spacing.lg, flexDirection: 'row', alignItems: 'flex-start'}, step: {width: 70, alignItems: 'center'}, stepLine: {height: 2, flex: 1, marginTop: 14, backgroundColor: colors.divider}, stepLineActive: {backgroundColor: colors.primary}, stepDot: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border}, stepDotActive: {backgroundColor: colors.primary, borderColor: colors.primary}, stepNumber: {color: colors.muted, ...typography.caption}, stepLabel: {color: colors.muted, fontSize: 11, marginTop: spacing.xs}, stepLabelActive: {color: colors.text}, progressTip: {color: colors.subtle, ...typography.caption, marginTop: spacing.md},
});
