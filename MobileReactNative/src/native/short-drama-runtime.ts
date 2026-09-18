import AsyncStorage from '@react-native-async-storage/async-storage';
import {appApi} from '../api/app';
import type {ShortDramaRuntimeConfig} from '../types/api';

const CACHE_KEY = 'reward_app_short_drama_runtime_config_v1';

const defaults: ShortDramaRuntimeConfig = {
  unlockMode: 'SPECIFIC',
  freeEpisodes: 10,
  unlockEpisodes: 10,
  continuousUnlock: false,
  hideRewardDialog: false,
  hideCellularToast: false,
  hideLikeButton: false,
  hideFavorButton: false,
  hideDoubleClick: false,
  hideLongClickSpeed: false,
  infiniteScrollEnabled: true,
};

let current = defaults;

export function getShortDramaRuntimeConfig() {
  return current;
}

function apply(value: ShortDramaRuntimeConfig | undefined) {
  if (!value) return;
  current = {...defaults, ...value};
}

/** Load cached content settings immediately and refresh them without blocking startup indefinitely. */
export async function refreshShortDramaRuntimeConfig() {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) apply(JSON.parse(cached) as ShortDramaRuntimeConfig);
  } catch {}

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const remote = await Promise.race([
      appApi.shortDramaConfig(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 2000); }),
    ]);
    if (remote) {
      apply(remote);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote)).catch(() => undefined);
    }
  } catch {
    // Cached or built-in content defaults remain available when the API is offline.
  } finally {
    if (timer) clearTimeout(timer);
  }
  return current;
}
