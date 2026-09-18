import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../api/client';
import {appApi} from '../api/app';
import {useAuthStore} from '../stores/auth';
import {dramaNative, type DramaLibrarySnapshot, type DramaPlaybackEvent} from './drama';
import {adProvider} from './ad-provider';
import {getAdRuntimeConfig} from './ad-runtime';
import {getShortDramaRuntimeConfig} from './short-drama-runtime';
import {rememberGoldenWatchReward} from './golden-watch-reward';
import {forgetPendingAdReward, rememberPendingAdReward} from './ad-reward-confirmation';
import type {GoldenWatchProgressResult, SdkLibrarySyncInput} from '../types/api';

const PLAY_COUNT_KEY = 'hly_interstitial_play_count_v1';
const LAST_SHOWN_AT_KEY = 'hly_interstitial_last_shown_at_v1';
const PENDING_LIBRARY_SYNCS_KEY = 'hly_pending_sdk_library_syncs_v1';

type PendingLibrarySync = {userId: string; payload: SdkLibrarySyncInput};
type ActiveLibrarySync = {userId: string; before: DramaLibrarySnapshot};

let openingPromise: Promise<void> | undefined;
let validationListenerInstalled = false;
let activeLibrarySync: ActiveLibrarySync | undefined;
let librarySyncClosing = false;
const activeUnlockRequests = new Set<string>();

const SNAPSHOT_RETRY_DELAYS_MS = [400, 800, 1200] as const;

function safeNumber(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function readPendingLibrarySyncs() {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(PENDING_LIBRARY_SYNCS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed as PendingLibrarySync[] : [];
  } catch {
    return [];
  }
}

async function enqueueLibrarySync(item: PendingLibrarySync) {
  const queue = await readPendingLibrarySyncs();
  const next = [item, ...queue.filter(value => value.payload.requestId !== item.payload.requestId)].slice(0, 20);
  await AsyncStorage.setItem(PENDING_LIBRARY_SYNCS_KEY, JSON.stringify(next));
}

async function flushLibrarySyncs(userId: string) {
  const queue = await readPendingLibrarySyncs();
  const remaining: PendingLibrarySync[] = [];
  for (const item of queue) {
    if (item.userId !== userId) { remaining.push(item); continue; }
    try { await appApi.syncSdkLibrary(item.payload); }
    catch { remaining.push(item); }
  }
  await AsyncStorage.setItem(PENDING_LIBRARY_SYNCS_KEY, JSON.stringify(remaining));
}

function buildLibraryDiff(before: DramaLibrarySnapshot, after: DramaLibrarySnapshot, requestId: string): SdkLibrarySyncInput {
  const beforeFavorites = new Set(before.favorites.map(item => item.externalId));
  const afterFavorites = new Set(after.favorites.map(item => item.externalId));
  const beforeHistory = new Map(before.histories.map(item => [item.externalId, item]));
  const favoritesAvailable = before.favoritesAvailable !== false && after.favoritesAvailable !== false;
  const historiesAvailable = before.historiesAvailable !== false && after.historiesAvailable !== false;
  return {
    requestId,
    favoritesAdded: favoritesAvailable ? [...afterFavorites].filter(id => !beforeFavorites.has(id)) : [],
    favoritesRemoved: favoritesAvailable ? [...beforeFavorites].filter(id => !afterFavorites.has(id)) : [],
    histories: historiesAvailable ? after.histories.filter(item => {
      const previous = beforeHistory.get(item.externalId);
      return !previous || previous.episodeIndex !== item.episodeIndex || previous.actionTime !== item.actionTime;
    }).map(item => ({externalId: item.externalId, episodeIndex: Math.max(1, item.episodeIndex)})) : [],
  };
}

function hasLibraryDiff(payload: SdkLibrarySyncInput) {
  return Boolean(payload.favoritesAdded.length || payload.favoritesRemoved.length || payload.histories.length);
}

async function handlePlayerClosed(event: DramaPlaybackEvent) {
  const active = activeLibrarySync;
  if (!active || !event.sessionId || librarySyncClosing) return;
  librarySyncClosing = true;
  try {
    let latestPayload: SdkLibrarySyncInput | undefined;
    for (const delayMs of SNAPSHOT_RETRY_DELAYS_MS) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      try {
        const after = await dramaNative.getLibrarySnapshot();
        latestPayload = buildLibraryDiff(active.before, after, event.sessionId);
      } catch {
        // SDK 在播放器退出后的短时间内可能仍在提交收藏状态，继续读取。
      }
    }
    if (!latestPayload || !hasLibraryDiff(latestPayload)) return;
    await enqueueLibrarySync({userId: active.userId, payload: latestPayload});
    if (String(useAuthStore.getState().user?.id ?? '') === active.userId) {
      await flushLibrarySyncs(active.userId);
    }
  } finally {
    activeLibrarySync = undefined;
    librarySyncClosing = false;
  }
}

async function handleUnlockAdRequest(event: DramaPlaybackEvent) {
  const requestId = event.requestId;
  const user = useAuthStore.getState().user;
  if (!requestId || !user || activeUnlockRequests.has(requestId)) {
    if (requestId) await dramaNative.resolveUnlockAd(requestId, false).catch(() => undefined);
    return;
  }
  activeUnlockRequests.add(requestId);
  const startedAt = Date.now();
  try {
    const [intent, center] = await Promise.all([
      appApi.dramaUnlockAdIntent({dramaId: event.externalId, episodeIndex: event.episodeIndex}),
      appApi.rewardCenter(),
    ]);
    await adProvider.initialize();
    let exposureCpm = '';
    await adProvider.loadReward(
      String(user.id),
      intent.mediaExtra,
      'CONTENT_UNLOCK',
      {
        onEcpm: value => {
          exposureCpm = value?.ecpm ?? '';
          dramaNative.notifyUnlockAdShown(requestId, exposureCpm).catch(error => {
            if (__DEV__) console.warn('[Drama unlock] exposure callback failed', error);
          });
        },
      },
    );
    const result = await adProvider.showReward();
    if (result.skipped && !result.completed && !result.rewardArrived) {
      await dramaNative.resolveUnlockAd(
        requestId,
        false,
        result.transactionId,
        exposureCpm,
      );
      return;
    }
    const pendingKey = await rememberPendingAdReward(String(user.id), result.transactionId, startedAt, 'CONTENT_UNLOCK');
    // 内容解锁允许采用 SDK 原生奖励到达回调兜底，避免 SSV 经临时隧道超时
    // 时让用户重复观看；金币仍只由服务端回调结算。
    let unlockResolved = false;
    if (result.completed || result.rewardArrived) {
      await dramaNative.resolveUnlockAd(requestId, true, result.transactionId, exposureCpm);
      unlockResolved = true;
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = result.transactionId
        ? await appApi.adRewardStatus(result.transactionId)
        : await appApi.latestAdReward(startedAt, 'CONTENT_UNLOCK');
      if (__DEV__) console.info('[Drama unlock] settlement poll', {attempt: attempt + 1, status});
      if (status.status === 'SETTLED' || status.status === 'VERIFIED') {
        await forgetPendingAdReward(pendingKey);
        if (!unlockResolved) {
          await dramaNative.resolveUnlockAd(
            requestId,
            true,
            status.transactionId ?? result.transactionId,
            exposureCpm,
          );
          unlockResolved = true;
        }
        if (status.status === 'VERIFIED' || !center.contentUnlockRewardEnabled) return;
        const profile = await appApi.me().catch(() => undefined);
        if (profile) useAuthStore.getState().setUser(profile);
        await dramaNative.showUnlockReward(status.awardedCoins, status.coinBalance).catch(() => undefined);
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, attempt < 10 ? 1500 : 3000));
    }
    // 服务端回调不可达时保留 SDK 已明确完成的原有兜底行为；客户端误报失败
    // 则不能自行解锁，待用户重试并由服务端确认。
    if (!unlockResolved) await dramaNative.resolveUnlockAd(requestId, false, result.transactionId, exposureCpm);
  } catch (error) {
    if (__DEV__) console.warn('[Drama unlock] failed', error);
    await dramaNative.resolveUnlockAd(requestId, false).catch(() => undefined);
  } finally {
    activeUnlockRequests.delete(requestId);
  }
}

function installValidationListener() {
  if (validationListenerInstalled) return;
  validationListenerInstalled = true;
  dramaNative.addPlaybackListener((event: DramaPlaybackEvent) => {
    if (event.eventType === 'UNLOCK_AD_REQUEST') {
      handleUnlockAdRequest(event).catch(() => undefined);
      return;
    }
    if (event.eventType === 'PLAYER_CLOSED') {
      handlePlayerClosed(event).catch(() => undefined);
      return;
    }
    if (event.eventType === 'WATCH_PROGRESS') {
      if (!event.sessionId || !event.elapsedSeconds) return;
      apiRequest<GoldenWatchProgressResult>('/rewards/golden-watch/progress', {
        method: 'POST',
        data: {externalId: event.externalId, episodeIndex: event.episodeIndex, sessionId: event.sessionId, elapsedSeconds: event.elapsedSeconds},
      }).then(rememberGoldenWatchReward).catch(() => undefined);
      return;
    }
    apiRequest('/content/playback-validations', {
      method: 'POST',
      data: event,
    }).catch(() => undefined);
  });
}

async function prepareLibrarySync(dramaId: string, episodeIndex: number) {
  const user = useAuthStore.getState().user;
  if (!user) { activeLibrarySync = undefined; return; }
  const userId = String(user.id);
  await dramaNative.initialize();
  // 某些 SDK 环境登录接口不可用，但收藏列表仍可正常读取，不能因此中断同步。
  await dramaNative.loginUser(userId).catch(() => undefined);
  await flushLibrarySyncs(userId).catch(() => undefined);
  const before = await dramaNative.getLibrarySnapshot();

  // 先保留快照。后续账号收藏查询或 SDK 状态修正失败时，退出播放器仍能做增量同步。
  activeLibrarySync = {userId, before};

  // 后端是主数据源；进入当前短剧前把该剧收藏状态修正到 SDK，切换账号不会串号。
  if (before.favoritesAvailable !== false) {
    try {
      const accountFavorites = await appApi.favorites();
      const shouldFavorite = accountFavorites.some(item => item.drama.externalId === dramaId);
      const sdkFavorite = before.favorites.some(item => item.externalId === dramaId);
      if (shouldFavorite !== sdkFavorite) {
        await dramaNative.setFavorite(dramaId, episodeIndex + 1, shouldFavorite);
        before.favorites = shouldFavorite
          ? [...before.favorites, {externalId: dramaId, episodeIndex: episodeIndex + 1, actionTime: Date.now()}]
          : before.favorites.filter(item => item.externalId !== dramaId);
      }
    } catch {
      // 后端仍是最终数据源；本次只跳过进入播放器前的状态校正。
    }
  }
}

/** APP 收藏按钮双写穿山甲；失败不回滚已经保存到账号的收藏。 */
export async function syncDramaFavoriteToSdk(dramaId: string, episodeIndex: number, state: boolean) {
  const user = useAuthStore.getState().user;
  if (!user) return;
  await dramaNative.initialize();
  await dramaNative.loginUser(String(user.id));
  await dramaNative.setFavorite(dramaId, episodeIndex + 1, state);
}

async function maybeShowFullScreenAd() {
  const runtime = getAdRuntimeConfig();
  if (!runtime.enabled || !runtime.fullScreen.enabled) return;
  const values = await AsyncStorage.multiGet([PLAY_COUNT_KEY, LAST_SHOWN_AT_KEY]);
  const playCount = safeNumber(values[0]?.[1] ?? null) + 1;
  const lastShownAt = safeNumber(values[1]?.[1] ?? null);
  const intervalReached = Date.now() - lastShownAt
    >= runtime.fullScreen.minimumIntervalMinutes * 60_000;

  if (playCount < runtime.fullScreen.playbackThreshold || !intervalReached) {
    await AsyncStorage.setItem(
      PLAY_COUNT_KEY,
      String(Math.min(playCount, runtime.fullScreen.playbackThreshold)),
    );
    return;
  }

  // 到达阈值后本轮即结束；加载失败不会在下一次点击时连续打扰用户。
  await AsyncStorage.setItem(PLAY_COUNT_KEY, '0');
  const shown = await adProvider.showFullScreen();
  if (shown) await AsyncStorage.setItem(LAST_SHOWN_AT_KEY, String(Date.now()));
}

/** 所有短剧入口统一经过这里，广告失败不会阻止原生播放器启动。 */
export function openDramaWithAd(dramaId: string, episodeIndex = 0) {
  if (openingPromise) return openingPromise;

  installValidationListener();
  openingPromise = Promise.all([
    maybeShowFullScreenAd().catch(() => undefined),
    prepareLibrarySync(dramaId, episodeIndex).catch(() => { activeLibrarySync = undefined; }),
  ])
    .then(() => {
      const runtime = getAdRuntimeConfig();
      const contentRuntime = getShortDramaRuntimeConfig();
      const dramaConfig = runtime.enabled && runtime.reward.enabled
        ? contentRuntime
        : {...contentRuntime, unlockMode: 'COMMON' as const};
      return dramaNative.open(dramaId, episodeIndex, dramaConfig);
    })
    .finally(() => {
      openingPromise = undefined;
    });
  return openingPromise;
}
