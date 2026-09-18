import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { appApi } from '../../api/app';
import { AppIcon, AppIconName } from '../../components/AppIcon';
import { AnimatedCoinValue } from '../../components/AnimatedCoinValue';
import { useAppToast } from '../../components/AppToast';
import {
  AppButton,
  AppCard,
  EmptyState,
  IconTile,
  SkeletonBlock,
} from '../../components/DesignSystem';
import { Screen } from '../../components/Screen';
import {
  RewardSuccessDialog,
  type RewardReceipt,
} from '../../components/RewardSuccessDialog';
import { adProvider } from '../../native/ad-provider';
import {
  forgetPendingAdReward,
  getPendingAdRewards,
  rememberPendingAdReward,
} from '../../native/ad-reward-confirmation';
import { ensureRiskAssessment } from '../../native/risk';
import { takeGoldenWatchReward } from '../../native/golden-watch-reward';
import { colors, radii, spacing, typography } from '../../theme';
import type {
  AdRewardStatus,
  AuthUser,
  RewardCenter,
  RewardMilestone,
} from '../../types/api';
import { useAuthStore } from '../../stores/auth';
import { isShortDramaEnabled, productModules } from '../../config/modules';

const FALLBACK_REWARDS = [10, 15, 20, 25, 30, 40, 60];
// 前 2.2 秒密集确认，随后逐步退避；数组表示相邻两次查询间隔。
const REWARD_CONFIRM_DELAYS_MS = [0, 150, 250, 400, 600, 800, 1300, 2200, 3500, 5000];
const INITIAL_CONFIRM_FEEDBACK_MS = 150;
const FOREGROUND_CONFIRM_WAIT_MS = 2200;
type AdState = 'checking' | 'confirming' | 'idle' | 'loading' | 'ready' | 'showing';

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/** 奖励信号到达后立即快速补查；失败状态仍可能被 GroMore 重试，因此不提前终止。 */
async function waitForAdRewardSettlement(
  startedAt: number,
  getTransactionId: () => string,
): Promise<Extract<AdRewardStatus, { status: 'SETTLED' }> | undefined> {
  for (let attempt = 0; attempt < REWARD_CONFIRM_DELAYS_MS.length; attempt += 1) {
    const delay = REWARD_CONFIRM_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) await wait(delay);
    try {
      const transactionId = getTransactionId();
      const status = transactionId
        ? await appApi.adRewardStatus(transactionId)
        : await appApi.latestAdReward(startedAt);
      if (__DEV__)
        console.info('[GroMore reward] settlement poll', {
          attempt: attempt + 1,
          status,
        });
      if (status.status === 'SETTLED') return status;
    } catch (error) {
      // 短暂断网不终止确认，后续轮次或重新进入页面仍能继续补查。
      if (__DEV__)
        console.info('[GroMore reward] settlement poll failed', error);
    }
  }
  return undefined;
}

function TaskCard({
  icon,
  title,
  description,
  reward,
  progress,
  completed,
  busy,
  action,
  onPress,
}: {
  icon: AppIconName;
  title: string;
  description: string;
  reward: string;
  progress?: string;
  completed?: boolean;
  busy?: boolean;
  action: string;
  onPress?: () => void;
}) {
  return (
    <AppCard style={[styles.taskCard, completed && styles.completedCard]}>
      <IconTile
        name={completed ? 'check' : icon}
        color={completed ? colors.success : colors.primary}
        size={46}
      />
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, completed && styles.muted]}>
          {title}
        </Text>
        <Text style={styles.taskDescription} numberOfLines={1}>
          {description}
        </Text>
        <View style={styles.rewardRow}>
          <Text style={styles.reward}>{reward}</Text>
          {progress ? (
            <Text style={styles.progressText}>{progress}</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        disabled={!onPress || completed || busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.action,
          busy && styles.busyAction,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.actionText, (completed || busy) && styles.muted]}>
          {completed ? '已完成' : action}
        </Text>
        {!completed && !busy ? (
          <AppIcon name="chevron-right" color={colors.primary} size={15} />
        ) : null}
      </Pressable>
    </AppCard>
  );
}

function MilestoneTasks({
  items,
  kind,
  busy,
  action,
  onPress,
}: {
  items?: RewardMilestone[];
  kind: 'ad' | 'invite';
  busy?: boolean;
  action: string;
  onPress?: () => void;
}) {
  if (!items?.length) return null;
  const isAd = kind === 'ad';
  return (
    <>
      {items.map(item => {
        const periodLabel = item.period === 'DAILY' ? '今日' : '累计';
        const targetLabel = isAd
          ? `观看广告 ${item.count} 次`
          : `邀请 ${item.count} 位好友`;
        return (
          <TaskCard
            key={`${kind}-${item.period}-${item.count}`}
            icon={isAd ? 'play' : 'user-plus'}
            title={`${periodLabel}${targetLabel}`}
            description={
              item.period === 'DAILY'
                ? '每日 00:00 重置任务进度'
                : '永久累计，每个档位只奖励一次'
            }
            reward={`额外奖励 ${item.rewardCoins} 金币`}
            progress={`${Math.min(item.progress, item.count)}/${item.count}`}
            completed={item.completed}
            busy={busy}
            action={action}
            onPress={onPress}
          />
        );
      })}
    </>
  );
}

function goldenProgressText(center?: RewardCenter) {
  const task = center?.goldenWatch;
  if (!task?.enabled) return '任务已暂停';
  if (task.completedToday) return '今日已完成';
  const watchedMinutes = Math.floor(task.watchedSeconds / 60);
  const watchedSeconds = task.watchedSeconds % 60;
  const requiredMinutes = Math.ceil(task.requiredSeconds / 60);
  const progress = `${watchedMinutes}分${watchedSeconds}秒 / ${requiredMinutes}分钟`;
  return task.active ? progress : `未到开放时段 · ${progress}`;
}

export function TasksScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const toast = useAppToast();
  const setUser = useAuthStore(state => state.setUser);
  const [center, setCenter] = useState<RewardCenter>();
  const [profile, setProfile] = useState<AuthUser>();
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [adState, setAdState] = useState<AdState>('idle');
  const [error, setError] = useState('');
  const [rewardReceipt, setRewardReceipt] = useState<RewardReceipt>();
  const [preloadRequest, setPreloadRequest] = useState(0);
  const adOperationActive = useRef(false);
  const preloadPromise = useRef<Promise<void> | undefined>(undefined);
  const preloadVersion = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rewardCenter, user] = await Promise.all([
        appApi.rewardCenter(),
        appApi.me(),
      ]);
      setCenter(rewardCenter);
      setProfile(user);
      setUser(user);

      const goldenReceipt = await takeGoldenWatchReward();
      if (goldenReceipt) {
        setRewardReceipt({
          ...goldenReceipt,
          completedCount: 1,
          dailyLimit: 1,
          description: '黄金时段有效观剧任务完成',
          progressLabel: '今日任务',
        });
      }

      // 平台回调可能晚于广告关闭。每次进入或刷新福利页时补查未确认交易，
      // 已到账则展示一次弹窗，并从本地待确认队列移除。
      const pending = goldenReceipt ? [] : await getPendingAdRewards(user.id);
      for (const item of pending) {
        const status = item.transactionId
          ? await appApi.adRewardStatus(item.transactionId)
          : await appApi.latestAdReward(item.startedAt, item.format);
        if (status.status !== 'SETTLED') continue;
        await forgetPendingAdReward(item.key);
        setRewardReceipt({
          awardedCoins: status.awardedCoins,
          coinBalance: status.coinBalance,
          completedCount: rewardCenter.rewardedAdCountToday,
          dailyLimit: rewardCenter.rewardedAdDailyLimit,
          description:
            item.format === 'CONTENT_UNLOCK' ? '内容解锁广告收益' : undefined,
          progressLabel:
            item.format === 'CONTENT_UNLOCK' ? '今日激励收益' : undefined,
        });
        break;
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '福利信息加载失败',
      );
    } finally {
      setLoading(false);
    }
  }, [setUser]);
  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const rewards = useMemo(() => {
    const byDay = new Map(
      center?.signInRules.map(rule => [
        Number(rule.code.replace('SIGNIN_DAY_', '')),
        rule,
      ]),
    );
    return FALLBACK_REWARDS.map((fallback, index) => {
      const rule = byDay.get(index + 1);
      return rule?.enabled === false ? 0 : Number(rule?.amount ?? fallback);
    });
  }, [center?.signInRules]);

  const sign = async () => {
    if (center?.checkedInToday || signing) return;
    setSigning(true);
    try {
      const result = await appApi.checkIn();
      setCenter(current =>
        current
          ? { ...current, checkedInToday: true, streak: result.record.streak }
          : current,
      );
      if (profile) {
        const updatedProfile = { ...profile, coinBalance: result.coinBalance };
        setProfile(updatedProfile);
        setUser(updatedProfile);
      }
      toast.show(
        result.duplicate
          ? '今日签到奖励已领取，无需重复操作'
          : `签到成功，+${result.awardedCoins} 金币`,
        'success',
      );
      load().catch(() => undefined);
    } catch (requestError) {
      toast.show(
        requestError instanceof Error
          ? requestError.message
          : '签到失败，请稍后重试',
        'error',
      );
    } finally {
      setSigning(false);
    }
  };

  const completedAds = center?.rewardedAdCountToday ?? 0;
  const dailyAdLimit = center?.rewardedAdDailyLimit ?? 0;
  const rewardedVideoEnabled = center?.rewardedVideoRewardEnabled !== false;
  const adProgress =
    dailyAdLimit > 0 ? Math.min(100, (completedAds / dailyAdLimit) * 100) : 0;
  const adAction =
    adState === 'checking'
      ? '安全检查中'
      : adState === 'loading'
      ? '准备中'
      : adState === 'showing'
      ? '播放中'
      : adState === 'confirming'
      ? '确认中'
      : adState === 'ready'
      ? '去完成'
      : '去完成';
  const cycleDay = center?.streak ? ((center.streak - 1) % 7) + 1 : 0;
  const goldenWatch = center?.goldenWatch;
  const goldenPeriods =
    goldenWatch?.periods
      .map(period => `${period.start}–${period.end}`)
      .join(' 或 ') ?? '12:00–14:00 或 18:00–22:00';

  /** 进入福利中心后只预加载任务广告，不提前触发风控采集或发奖。 */
  useEffect(() => {
    if (
      !isFocused ||
      !profile?.id ||
      !productModules.advertising ||
      !rewardedVideoEnabled ||
      (dailyAdLimit > 0 && completedAds >= dailyAdLimit) ||
      adOperationActive.current ||
      adProvider.state !== 'idle'
    ) return;

    const version = ++preloadVersion.current;
    const pending = adProvider.loadReward(
      profile.id,
      JSON.stringify({ source: 'benefits', userId: profile.id }),
      'REWARD',
    );
    preloadPromise.current = pending;
    pending.then(() => {
      if (version !== preloadVersion.current || !isFocused) {
        adProvider.dispose();
        return;
      }
      setAdState('ready');
    }).catch(preloadError => {
      if (__DEV__) console.info('[GroMore reward] preload failed', preloadError);
      if (version === preloadVersion.current) setAdState('idle');
    }).finally(() => {
      if (preloadPromise.current === pending) preloadPromise.current = undefined;
    });

    return () => {
      preloadVersion.current += 1;
      if (preloadPromise.current === pending) preloadPromise.current = undefined;
      if (!adOperationActive.current && adProvider.state !== 'showing') {
        adProvider.dispose();
        setAdState('idle');
      }
    };
  }, [completedAds, dailyAdLimit, isFocused, preloadRequest, profile?.id, rewardedVideoEnabled]);

  /** 客户端只展示过程，最终金币到账仍以 GroMore 服务端回调后的中心数据为准。 */
  const watchRewardAd = async () => {
    if (!profile?.id || adOperationActive.current) return;
    if (!rewardedVideoEnabled) return toast.show('激励视频收益暂未开放');
    if (dailyAdLimit > 0 && completedAds >= dailyAdLimit)
      return toast.show('今日广告任务已全部完成');
    let confirmationContinuesInBackground = false;
    try {
      adOperationActive.current = true;
      const adStartedAt = Date.now();
      let rewardTransactionId = '';
      let confirmationPromise:
        | Promise<Extract<AdRewardStatus, { status: 'SETTLED' }> | undefined>
        | undefined;
      const startConfirmation = () => {
        confirmationPromise ??= waitForAdRewardSettlement(
          adStartedAt,
          () => rewardTransactionId,
        );
        return confirmationPromise;
      };
      const lifecycle = {
        onRewardSignal: (value: {transactionId?: string}) => {
          if (value.transactionId) rewardTransactionId = value.transactionId;
          // 广告仍在展示时就开始查询，关闭后通常已可直接展示收益。
          startConfirmation().catch(() => undefined);
        },
      };
      if (adState !== 'ready' && adProvider.state !== 'ready') {
        setAdState('loading');
        const adPreparation = preloadPromise.current ?? adProvider.loadReward(
          profile.id,
          JSON.stringify({ source: 'benefits', userId: profile.id }),
          'REWARD',
          lifecycle,
        );
        await Promise.all([
          ensureRiskAssessment('reward'),
          adPreparation,
        ]);
        adProvider.setRewardLifecycle(lifecycle);
        setAdState('ready');
      } else {
        adProvider.setRewardLifecycle(lifecycle);
        setAdState('checking');
        await ensureRiskAssessment('reward');
      }
      setAdState('showing');
      const result = await adProvider.showReward();
      if (result.transactionId) rewardTransactionId = result.transactionId;
      const hasRewardSignal =
        result.completed ||
        result.rewardArrived ||
        Boolean(confirmationPromise);
      if (result.skipped && !hasRewardSignal) {
        toast.show('广告已跳过，本次不计入收益');
        return;
      }
      setAdState('confirming');
      const pendingKey = await rememberPendingAdReward(
        profile.id,
        rewardTransactionId,
        adStartedAt,
      );

      const applySettlement = async (
        status: Extract<AdRewardStatus, { status: 'SETTLED' }>,
      ) => {
        await forgetPendingAdReward(pendingKey);
        const taskIncrement = status.countedForTask === false ? 0 : 1;
        const nextCompletedCount = completedAds + taskIncrement;
        const updatedProfile = {
          ...profile,
          coinBalance: status.coinBalance,
        };
        setProfile(updatedProfile);
        setUser(updatedProfile);
        setCenter(current =>
          current
            ? {
                ...current,
                rewardedAdCountToday: nextCompletedCount,
                rewardedAdMilestones: current.rewardedAdMilestones.map(item => {
                  const progress = item.progress + taskIncrement;
                  return {
                    ...item,
                    progress,
                    completed: progress >= item.count,
                  };
                }),
              }
            : current,
        );
        setRewardReceipt({
          awardedCoins: status.awardedCoins,
          coinBalance: status.coinBalance,
          completedCount: nextCompletedCount,
          dailyLimit: dailyAdLimit,
        });
      };

      const confirmation = startConfirmation();
      // 极快回调直接展示到账弹窗；否则尽快告知用户已完成观看、正在确认收益。
      const quickStatus = await Promise.race([
        confirmation,
        wait(INITIAL_CONFIRM_FEEDBACK_MS).then(() => undefined),
      ]);
      if (quickStatus) {
        await applySettlement(quickStatus);
        return;
      }
      toast.show('观看已完成，收益确认中，到账后自动提示');

      // 总前台等待时间仍限制在 2.2 秒，剩余确认转入后台，不阻塞页面。
      const immediateStatus = await Promise.race([
        confirmation,
        wait(FOREGROUND_CONFIRM_WAIT_MS - INITIAL_CONFIRM_FEEDBACK_MS).then(() => undefined),
      ]);
      if (immediateStatus) {
        await applySettlement(immediateStatus);
        return;
      }

      confirmationContinuesInBackground = true;
      confirmation
        .then(async status => {
          if (status) await applySettlement(status);
          else
            toast.show(
              result.completed || rewardTransactionId
                ? '奖励仍在确认，重新进入本页会自动补查'
                : '平台回调暂未到达，到账后会自动补查',
            );
        })
        .catch(confirmationError => {
          if (__DEV__)
            console.info(
              '[GroMore reward] background confirmation failed',
              confirmationError,
            );
        })
        .finally(() => {
          adOperationActive.current = false;
          setAdState('idle');
          setPreloadRequest(current => current + 1);
        });
    } catch (requestError) {
      toast.show(
        requestError instanceof Error
          ? requestError.message
          : '广告暂时不可用，请稍后重试',
        'error',
      );
    } finally {
      if (!confirmationContinuesInBackground) {
        adOperationActive.current = false;
        setAdState(adProvider.state === 'ready' ? 'ready' : 'idle');
        if (adProvider.state === 'idle') setPreloadRequest(current => current + 1);
      }
    }
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>福利中心</Text>
            <Text style={styles.subtitle}>完成任务，让每次观看都有收获</Text>
          </View>
          <AppIcon name="gift" color={colors.primary} size={29} />
        </View>
        {loading && !center ? (
          <SkeletonBlock style={styles.topSkeleton} />
        ) : error && !center ? (
          <EmptyState
            title="福利加载失败"
            description={error}
            action="重新加载"
            onAction={load}
            icon="gift"
          />
        ) : (
          <>
            <AppCard style={styles.balanceCard} elevated>
              <View>
                <Text style={styles.balanceLabel}>当前金币</Text>
                <AnimatedCoinValue
                  value={profile?.coinBalance ?? 0}
                  style={styles.balance}
                />
                <Text style={styles.balanceTip}>任务奖励将实时计入余额</Text>
              </View>
              {productModules.withdrawals ? <AppButton
                title="去提现"
                icon="wallet"
                onPress={() => navigation.navigate('Withdrawal')}
                style={styles.withdrawButton}
              /> : null}
            </AppCard>
            <AppCard style={styles.signCard}>
              <View style={styles.signHeader}>
                <View style={styles.signHeaderText}>
                  <Text style={styles.signTitle}>
                    连续签到 {center?.streak ?? 0} 天
                  </Text>
                  <Text style={styles.signSubtitle}>
                    奖励逐日递增，第 7 天奖励最高
                  </Text>
                </View>
                <AppIcon
                  name="calendar-check"
                  color={colors.primary}
                  size={28}
                />
              </View>
              <View style={styles.signTrack}>
                {rewards.map((reward, index) => {
                  const day = index + 1;
                  const done = day <= cycleDay;
                  return (
                    <View key={day} style={styles.signDay}>
                      <View
                        style={[styles.dayCircle, done && styles.dayCircleDone]}
                      >
                        {done ? (
                          <AppIcon
                            name="check"
                            color="#1B1609"
                            size={13}
                            strokeWidth={3}
                          />
                        ) : (
                          <Text style={styles.dayNumber}>{day}</Text>
                        )}
                      </View>
                      <Text
                        style={[styles.dayReward, done && styles.dayRewardDone]}
                      >
                        +{reward}
                      </Text>
                      <Text style={styles.dayLabel}>第{day}天</Text>
                    </View>
                  );
                })}
              </View>
              <AppButton
                title={center?.checkedInToday ? '今日已签到' : '立即签到'}
                icon="calendar-check"
                loading={signing}
                disabled={center?.checkedInToday}
                onPress={sign}
              />
            </AppCard>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>今日任务</Text>
              <Text style={styles.resetText}>每日任务 00:00 重置</Text>
            </View>
            <View style={styles.taskList}>
              {productModules.advertising ? <><TaskCard
                icon="play"
                title="观看激励广告"
                description={
                  rewardedVideoEnabled
                    ? `每日 ${dailyAdLimit} 次收益额度`
                    : '后台暂未开放收益'
                }
                reward="每日上限"
                progress={
                  rewardedVideoEnabled
                    ? `${completedAds}/${dailyAdLimit}`
                    : '--'
                }
                completed={
                  !rewardedVideoEnabled ||
                  (dailyAdLimit > 0 && completedAds >= dailyAdLimit)
                }
                busy={adState !== 'idle' && adState !== 'ready'}
                action={rewardedVideoEnabled ? adAction : '未开放'}
                onPress={rewardedVideoEnabled ? watchRewardAd : undefined}
              />
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${adProgress}%` }]}
                />
              </View>
              <MilestoneTasks
                items={center?.rewardedAdMilestones}
                kind="ad"
                busy={adState !== 'idle' && adState !== 'ready'}
                action={rewardedVideoEnabled ? adAction : '未开放'}
                onPress={rewardedVideoEnabled ? watchRewardAd : undefined}
              /></> : null}
              {isShortDramaEnabled ? <TaskCard
                icon="clock"
                title="黄金时段观剧"
                description={goldenPeriods}
                reward={`奖励 ${goldenWatch?.rewardCoins ?? 15} 金币`}
                progress={goldenProgressText(center)}
                completed={goldenWatch?.completedToday}
                action={goldenWatch?.active ? '去观剧' : '查看'}
                onPress={
                  goldenWatch?.enabled
                    ? () => navigation.navigate('首页')
                    : undefined
                }
              /> : null}
              {productModules.invitations ? <><TaskCard
                icon="user-plus"
                title="邀请好友"
                description={`已邀请 ${center?.invitedCount ?? 0} 位好友`}
                reward="邀请成功可得奖励"
                action="去邀请"
                onPress={() => navigation.navigate('Share')}
              />
              <MilestoneTasks
                items={center?.inviteMilestones}
                kind="invite"
                action="去邀请"
                onPress={() => navigation.navigate('Share')}
              /></> : null}
            </View>
          </>
        )}
      </ScrollView>
      <RewardSuccessDialog
        receipt={rewardReceipt}
        onClose={() => setRewardReceipt(undefined)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.text, ...typography.title },
  subtitle: {
    color: colors.muted,
    ...typography.caption,
    marginTop: spacing.xs,
  },
  topSkeleton: { height: 180 },
  balanceCard: {
    minHeight: 142,
    borderRadius: radii.xl,
    backgroundColor: colors.primarySoft,
    borderColor: '#4A3C1B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: { color: '#C8BA8C', ...typography.label },
  balance: {
    color: colors.primary,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  balanceTip: {
    color: colors.muted,
    ...typography.caption,
    marginTop: spacing.xs,
  },
  withdrawButton: { minWidth: 104 },
  signCard: { marginTop: spacing.md, borderRadius: radii.xl, gap: spacing.lg },
  signHeader: { flexDirection: 'row', alignItems: 'center' },
  signHeaderText: { flex: 1 },
  signTitle: { color: colors.text, ...typography.section },
  signSubtitle: {
    color: colors.muted,
    ...typography.caption,
    marginTop: spacing.xs,
  },
  signTrack: { flexDirection: 'row', justifyContent: 'space-between' },
  signDay: { alignItems: 'center', flex: 1 },
  dayCircle: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDone: { backgroundColor: colors.primary },
  dayNumber: { color: colors.muted, ...typography.caption, fontWeight: '600' },
  dayReward: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  dayRewardDone: { color: colors.primary },
  dayLabel: { color: colors.subtle, fontSize: 9, lineHeight: 13, marginTop: 1 },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  sectionTitle: { color: colors.text, ...typography.section, flex: 1 },
  resetText: { color: colors.muted, ...typography.caption },
  taskList: { gap: spacing.md },
  taskCard: { padding: spacing.md, flexDirection: 'row', alignItems: 'center' },
  completedCard: { opacity: 0.72 },
  taskBody: { flex: 1, marginLeft: spacing.md },
  taskTitle: { color: colors.text, ...typography.body, fontWeight: '600' },
  taskDescription: { color: colors.muted, ...typography.caption, marginTop: 2 },
  rewardRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  reward: { color: colors.primary, ...typography.caption, fontWeight: '600' },
  progressText: { color: colors.subtle, ...typography.caption },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
  busyAction: { opacity: 0.7 },
  actionText: { color: colors.primary, ...typography.label },
  muted: { color: colors.muted },
  progressTrack: {
    height: 4,
    marginTop: -spacing.sm,
    marginHorizontal: spacing.lg,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
});
