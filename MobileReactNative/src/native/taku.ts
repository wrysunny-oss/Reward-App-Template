import type {AdProvider, RewardLifecycle, RewardResult} from './ad-provider.types';

const unavailable = () => new Error('Taku 广告适配器尚未接入官方 Android SDK，请先完成原生桥配置');

/**
 * Taku 的稳定适配边界。取得官方 Maven 坐标、混淆规则和回调协议后，只在此实现内接入，
 * 页面、任务和内容模块无需感知 SDK 差异。
 */
export const takuAdProvider: AdProvider = {
  name: 'taku',
  available: false,
  state: 'idle',
  initialize: () => Promise.reject(unavailable()),
  showStartupSplash: () => Promise.resolve(),
  showFullScreen: () => Promise.resolve(false),
  loadReward: () => Promise.reject(unavailable()),
  showReward: (): Promise<RewardResult> => Promise.reject(unavailable()),
  setRewardLifecycle: (_lifecycle?: RewardLifecycle) => undefined,
  dispose: () => undefined,
};
