import {
  loadFullScreenVideoAd,
  loadRewardVideoAd,
  register,
  showFullScreenVideoAd,
  showSplashAd,
  showRewardVideoAd,
  UnionadOrientation,
  type EcpmInfo,
  type RewardVerify,
} from 'react-native-playnest-unionad';
import {adConfig} from '../config/ad-config';
import {getAdRuntimeConfig} from './ad-runtime';
import {reportAdEcpm, reportAdEvent} from './ad-telemetry';

export interface RewardResult {
  completed: boolean;
  /** 原生 SDK 已进入奖励到达回调；SSV 网络失败时 rewardVerify 仍可能为 false。 */
  rewardArrived: boolean;
  /** 用户或广告素材在奖励到达前触发了跳过事件。 */
  skipped: boolean;
  transactionId: string;
  placementId: string;
  rewardAmount: number;
  rewardName: string;
  rewardType?: number;
  ecpm?: EcpmInfo | null;
}

type AdState = 'idle' | 'loading' | 'ready' | 'showing';
type RewardLifecycle = {
  onEcpm?: (value: EcpmInfo | null) => void;
  /** 奖励信号通常早于广告关闭，用它提前等待服务端 SSV 结算。 */
  onRewardSignal?: (value: RewardVerify) => void;
};

const APP_ID = adConfig.appId;
const SHOW_TIMEOUT_MS = 10 * 60 * 1000;

let initialization: Promise<void> | undefined;
let state: AdState = 'idle';
let unsubscribe: (() => void) | undefined;
let pendingShow:
  | {
      resolve: (result: RewardResult) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  | undefined;
let reward: RewardVerify | undefined;
let rewardArrived = false;
let rewardSkipped = false;
let ecpm: EcpmInfo | null | undefined;
let rewardFormat: 'REWARD' | 'DRAMA_UNLOCK' = 'REWARD';
let rewardLifecycle: RewardLifecycle | undefined;
let startupSplashPromise: Promise<void> | undefined;
let fullScreenPromise: Promise<boolean> | undefined;

function debugRewardCallback(name: string, payload?: unknown) {
  if (!__DEV__) return;
  if (payload === undefined) {
    console.info(`[GroMore reward] ${name}`);
    return;
  }
  console.info(`[GroMore reward] ${name}`, payload);
}

function reportEcpm(format: 'SPLASH' | 'FEED' | 'FULL_SCREEN' | 'REWARD' | 'DRAMA_UNLOCK', placementId: string, value: EcpmInfo | null) {
  reportAdEcpm(format, placementId, value);
}

function resetSession() {
  unsubscribe?.();
  unsubscribe = undefined;
  state = 'idle';
  reward = undefined;
  rewardArrived = false;
  rewardSkipped = false;
  ecpm = undefined;
  rewardFormat = 'REWARD';
  rewardLifecycle = undefined;
}

function finishShow(error?: Error) {
  if (!pendingShow) {
    resetSession();
    return;
  }
  const current = pendingShow;
  pendingShow = undefined;
  clearTimeout(current.timeout);
  if (error) {
    current.reject(error);
  } else {
    current.resolve({
      completed: reward?.rewardVerify === true,
      rewardArrived,
      skipped: rewardSkipped,
      transactionId: reward?.transactionId ?? '',
      placementId: getAdRuntimeConfig().reward.placementId,
      rewardAmount: reward?.rewardAmount ?? 0,
      rewardName: reward?.rewardName ?? '金币',
      rewardType: reward?.rewardType,
      ecpm,
    });
  }
  resetSession();
}

/**
 * 富商剧场唯一广告入口。
 *
 * SDK 只在用户同意隐私协议后初始化；激励结果只作为客户端展示依据，
 * 最终金币发放仍必须以穿山甲服务端回调和后端幂等记录为准。
 */
export const groMoreNative = {
  available: true,
  get state() {
    return state;
  },
  initialize: () => {
    if (!initialization) {
      initialization = register({
        androidAppId: APP_ID,
        iosAppId: APP_ID,
        appName: adConfig.sdkAppName,
        useMediation: true,
        debug: __DEV__,
        supportMultiProcess: false,
        androidPrivacy: {
          isCanUseLocation: false,
          isCanUsePhoneState: false,
          isCanUseWifiState: false,
          isCanUseWriteExternal: false,
          alist: false,
          isCanUseAndroidId: false,
          isCanUsePermissionRecordAudio: false,
          isLimitPersonalAds: false,
          isProgrammaticRecommend: true,
        },
      }).then(success => {
        if (!success) throw new Error('GroMore SDK 初始化失败');
      }).catch(error => {
        initialization = undefined;
        throw error;
      });
    }
    return initialization;
  },
  /**
   * 每次 JS 进程只尝试一次冷启动开屏。任何失败或超时都会放行应用，
   * 避免广告网络异常阻塞首页。
   */
  showStartupSplash: () => {
    const runtime = getAdRuntimeConfig();
    if (!runtime.enabled || !runtime.splash.enabled) return Promise.resolve();
    if (startupSplashPromise) return startupSplashPromise;

    startupSplashPromise = groMoreNative.initialize().then(() => new Promise<void>(resolve => {
      let settled = false;
      let splashUnsubscribe: (() => void) | undefined;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        splashUnsubscribe?.();
        resolve();
      };

      const placementId = runtime.splash.placementId;
      reportAdEvent({format: 'SPLASH', eventType: 'REQUEST', placementId});
      const safetyTimer = setTimeout(finish, runtime.splash.safetyTimeoutMs);
      splashUnsubscribe = showSplashAd(
        {
          androidCodeId: placementId,
          iosCodeId: placementId,
          timeout: runtime.splash.timeoutMs,
          width: 0,
          height: 0,
          isShake: false,
          supportDeepLink: true,
        },
        {
          onShow: () => reportAdEvent({format: 'SPLASH', eventType: 'SHOW', placementId}),
          onClick: () => reportAdEvent({format: 'SPLASH', eventType: 'CLICK', placementId}),
          onSkip: () => {
            reportAdEvent({format: 'SPLASH', eventType: 'CLOSE', placementId});
            finish();
          },
          onFinish: () => {
            reportAdEvent({format: 'SPLASH', eventType: 'CLOSE', placementId});
            finish();
          },
          onFail: event => {
            if (__DEV__) console.warn('[GroMore] 开屏广告失败:', event.error);
            reportAdEvent({format: 'SPLASH', eventType: 'FAIL', placementId, errorMessage: event.error});
            finish();
          },
          onEcpm: value => reportEcpm('SPLASH', placementId, value),
        },
      );
    })).catch(error => {
      if (__DEV__) console.warn('[GroMore] 开屏流程失败:', error);
    });

    return startupSplashPromise;
  },
  /** 加载并展示一次插全屏广告；false 表示未展示，调用方应继续原业务。 */
  showFullScreen: () => {
    const runtime = getAdRuntimeConfig();
    if (!runtime.enabled || !runtime.fullScreen.enabled) return Promise.resolve(false);
    if (fullScreenPromise) return fullScreenPromise;
    if (state !== 'idle') return Promise.resolve(false);

    fullScreenPromise = groMoreNative.initialize().then(() => new Promise<boolean>(resolve => {
      let settled = false;
      let shown = false;
      let showRequested = false;
      let fullScreenUnsubscribe: (() => void) | undefined;
      let showTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (didShow: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(loadTimer);
        if (showTimer) clearTimeout(showTimer);
        fullScreenUnsubscribe?.();
        resolve(didShow);
      };

      const placementId = runtime.fullScreen.placementId;
      reportAdEvent({format: 'FULL_SCREEN', eventType: 'REQUEST', placementId});
      const loadTimer = setTimeout(() => finish(false), runtime.fullScreen.loadTimeoutMs);
      try {
        fullScreenUnsubscribe = loadFullScreenVideoAd(
          {
            androidCodeId: placementId,
            iosCodeId: placementId,
            orientation: UnionadOrientation.VERTICAL,
          },
          {
            onReady: () => {
              if (showRequested || settled) return;
              showRequested = true;
              reportAdEvent({format: 'FULL_SCREEN', eventType: 'LOADED', placementId});
              clearTimeout(loadTimer);
              showTimer = setTimeout(() => finish(shown), runtime.fullScreen.showTimeoutMs);
              showFullScreenVideoAd().then(success => {
                if (!success) finish(false);
              }).catch(() => finish(false));
            },
            onShow: () => {
              shown = true;
              reportAdEvent({format: 'FULL_SCREEN', eventType: 'SHOW', placementId});
            },
            onClick: () => reportAdEvent({format: 'FULL_SCREEN', eventType: 'CLICK', placementId}),
            onClose: () => {
              reportAdEvent({format: 'FULL_SCREEN', eventType: 'CLOSE', placementId});
              finish(shown);
            },
            onFail: event => {
              if (__DEV__) console.warn('[GroMore] 插全屏广告失败:', event.error);
              reportAdEvent({format: 'FULL_SCREEN', eventType: 'FAIL', placementId, errorMessage: event.error});
              finish(shown);
            },
            onUnReady: event => {
              if (__DEV__) console.warn('[GroMore] 插全屏广告未就绪:', event.error);
              reportAdEvent({format: 'FULL_SCREEN', eventType: 'FAIL', placementId, errorMessage: event.error});
              finish(false);
            },
            onEcpm: value => reportEcpm('FULL_SCREEN', placementId, value),
          },
        );
      } catch (error) {
        if (__DEV__) console.warn('[GroMore] 插全屏广告调用失败:', error);
        finish(false);
      }
    })).catch(error => {
      if (__DEV__) console.warn('[GroMore] 插全屏流程失败:', error);
      return false;
    }).finally(() => {
      fullScreenPromise = undefined;
    });

    return fullScreenPromise;
  },
  loadReward: async (
    userId: string,
    extra = '',
    format: 'REWARD' | 'DRAMA_UNLOCK' = 'REWARD',
    lifecycle?: RewardLifecycle,
  ) => {
    const runtime = getAdRuntimeConfig();
    if (!runtime.enabled || !runtime.reward.enabled) throw new Error('激励广告暂未开放');
    if (state !== 'idle' || fullScreenPromise) throw new Error('已有广告正在加载或展示');
    await groMoreNative.initialize();
    state = 'loading';
    rewardFormat = format;
    rewardLifecycle = lifecycle;
    reward = undefined;
    rewardArrived = false;
    rewardSkipped = false;
    ecpm = undefined;
    debugRewardCallback('load:start', {
      placementId: runtime.reward.placementId,
      userId,
      mediaExtra: extra,
    });
    reportAdEvent({format, eventType: 'REQUEST', placementId: runtime.reward.placementId});

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const loadTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        debugRewardCallback('load:timeout');
        resetSession();
        reject(new Error('激励视频加载超时，请稍后重试'));
      }, 30_000);

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        debugRewardCallback('load:fail', {message});
        clearTimeout(loadTimeout);
        resetSession();
        reject(new Error(message || '激励视频加载失败'));
      };

      unsubscribe = loadRewardVideoAd(
        {
          androidCodeId: runtime.reward.placementId,
          iosCodeId: runtime.reward.placementId,
          rewardName: '金币',
          rewardAmount: 30,
          userID: userId,
          mediaExtra: extra,
          orientation: UnionadOrientation.VERTICAL,
          mutedIfCan: false,
        },
        {
          onReady: () => {
            if (settled) return;
            settled = true;
            clearTimeout(loadTimeout);
            state = 'ready';
            debugRewardCallback('onReady');
            reportAdEvent({format: rewardFormat, eventType: 'LOADED', placementId: runtime.reward.placementId});
            resolve();
          },
          onShow: () => {
            debugRewardCallback('onShow');
            reportAdEvent({format: rewardFormat, eventType: 'SHOW', placementId: runtime.reward.placementId});
          },
          onClick: () => {
            debugRewardCallback('onClick');
            reportAdEvent({format: rewardFormat, eventType: 'CLICK', placementId: runtime.reward.placementId});
          },
          onFail: event => {
            // The native module uses the same event for load and playback
            // errors. Reject an active show immediately instead of waiting for
            // the ten-minute safety timeout.
            debugRewardCallback('onFail', event);
            reportAdEvent({format: rewardFormat, eventType: 'FAIL', placementId: runtime.reward.placementId, errorMessage: event.error});
            if (state === 'showing') finishShow(new Error(event.error));
            else fail(event.error);
          },
          onUnReady: event => {
            debugRewardCallback('onUnReady', event);
            if (state === 'showing') finishShow(new Error(event.error));
            else fail(event.error);
          },
          onVerify: value => {
            debugRewardCallback('onVerify', value);
            // 部分 GroMore/ADN 组合只把有效奖励透传到旧版校验回调。
            // 客户端仅用它进入等待状态，金币仍必须由服务端 SSV 回调结算。
            if (value.rewardVerify && !reward?.rewardVerify) reward = value;
            if (value.rewardVerify) rewardLifecycle?.onRewardSignal?.(value);
          },
          onRewardArrived: value => {
            debugRewardCallback('onRewardArrived', value);
            rewardArrived = true;
            reward = value;
            rewardLifecycle?.onRewardSignal?.(value);
            reportAdEvent({
              format: rewardFormat,
              eventType: 'REWARD_ARRIVED',
              placementId: runtime.reward.placementId,
              requestId: value.transactionId,
              errorMessage: value.rewardVerify ? undefined : value.error,
            });
          },
          onEcpm: value => {
            debugRewardCallback('onEcpm', value);
            ecpm = value;
            rewardLifecycle?.onEcpm?.(value);
            reportEcpm(rewardFormat, runtime.reward.placementId, value);
          },
          onClose: () => {
            debugRewardCallback('onClose', reward);
            reportAdEvent({format: rewardFormat, eventType: 'CLOSE', placementId: runtime.reward.placementId});
            finishShow();
          },
          onSkip: () => {
            debugRewardCallback('onSkip');
            rewardSkipped = true;
            // 某些广告在奖励到达后仍会补发 onSkip。保留奖励到达事实与交易号；
            // 金币是否到账继续以服务端 SSV 为准。
          },
          onFinish: () => {
            debugRewardCallback('onFinish');
          },
        },
      );
    });
  },
  showReward: async (): Promise<RewardResult> => {
    if (state !== 'ready') throw new Error('激励视频尚未加载完成');
    state = 'showing';
    debugRewardCallback('show:start');
    return new Promise<RewardResult>((resolve, reject) => {
      pendingShow = {
        resolve,
        reject,
        timeout: setTimeout(
          () => finishShow(new Error('激励视频展示超时')),
          SHOW_TIMEOUT_MS,
        ),
      };
      showRewardVideoAd().then(success => {
        debugRewardCallback('show:result', {success});
        if (!success) finishShow(new Error('激励视频展示失败'));
      }).catch(error => {
        debugRewardCallback('show:error', error);
        finishShow(error instanceof Error ? error : new Error(String(error)));
      });
    });
  },
  /** 允许预加载完成后、展示前绑定本次业务的回调处理器。 */
  setRewardLifecycle: (lifecycle?: RewardLifecycle) => {
    if (state === 'idle') throw new Error('激励视频尚未加载');
    rewardLifecycle = lifecycle;
  },
  dispose: () => {
    if (pendingShow) finishShow(new Error('激励视频已取消'));
    else resetSession();
  },
};
