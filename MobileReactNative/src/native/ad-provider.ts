import {adConfig} from '../config/ad-config';
import {groMoreNative} from './gromore';
import {takuAdProvider} from './taku';
import type {AdProvider} from './ad-provider.types';

const disabledAdProvider: AdProvider = {
  name: 'none',
  available: false,
  state: 'idle',
  initialize: () => Promise.resolve(),
  showStartupSplash: () => Promise.resolve(),
  showFullScreen: () => Promise.resolve(false),
  loadReward: () => Promise.reject(new Error('当前产品未启用广告能力')),
  showReward: () => Promise.reject(new Error('当前产品未启用广告能力')),
  setRewardLifecycle: () => undefined,
  dispose: () => undefined,
};

const providers: Record<string, AdProvider> = {
  none: disabledAdProvider,
  gromore: groMoreNative,
  taku: takuAdProvider,
};

/** APP 唯一广告入口。页面和内容插件只能依赖此接口。 */
export const adProvider = providers[adConfig.provider] ?? disabledAdProvider;
export type {AdFormat, AdProvider, RewardLifecycle, RewardResult} from './ad-provider.types';
