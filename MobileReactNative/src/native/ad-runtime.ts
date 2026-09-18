import AsyncStorage from '@react-native-async-storage/async-storage';
import {appApi} from '../api/app';
import {adConfig} from '../config/ad-config';
import type {AdRuntimeConfig} from '../types/api';

const CACHE_KEY = 'hly_ad_runtime_config_v1';

const defaults: AdRuntimeConfig = {
  enabled: true,
  splash: {enabled: true, ...adConfig.splash},
  feed: {enabled: true, ...adConfig.feed},
  fullScreen: {
    enabled: true,
    placementId: adConfig.fullScreen.placementId,
    playbackThreshold: adConfig.fullScreen.playbackThreshold,
    minimumIntervalMinutes: adConfig.fullScreen.minimumIntervalMs / 60_000,
    loadTimeoutMs: adConfig.fullScreen.loadTimeoutMs,
    showTimeoutMs: adConfig.fullScreen.showTimeoutMs,
  },
  reward: {enabled: true, ...adConfig.reward},
};

let current: AdRuntimeConfig = defaults;

export function getAdRuntimeConfig() {
  return current;
}

function apply(value: AdRuntimeConfig | undefined) {
  if (!value?.splash?.placementId || !value.feed?.placementId || !value.fullScreen?.placementId || !value.reward?.placementId) return;
  current = value;
}

/** 使用缓存立即启动，远端配置最多等待 2 秒，接口异常时保持安全默认值。 */
export async function refreshAdRuntimeConfig() {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) apply(JSON.parse(cached) as AdRuntimeConfig);
  } catch {}

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const remote = await Promise.race([
      appApi.adConfig(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 2000); }),
    ]);
    if (remote) {
      apply(remote);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote)).catch(() => undefined);
    }
  } catch {
    // 缓存或默认配置已经可用，远端失败不阻塞启动。
  } finally {
    if (timer) clearTimeout(timer);
  }
  return current;
}
