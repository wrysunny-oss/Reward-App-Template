import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import type {ShortDramaRuntimeConfig} from '../types/api';
import productConfig from '../../product.generated.json';

const shortDramaSdkSettingId = productConfig.content.providers.shortDrama?.sdkSettingId ?? '';

export type DramaPlaybackEvent = {
  eventType: 'PLAYBACK_STARTED' | 'PLAYER_CLOSED' | 'REQUEST_SUCCEEDED' | 'WATCH_PROGRESS' | 'UNLOCK_AD_REQUEST';
  externalId: string;
  episodeIndex: number;
  deviceModel?: string;
  abi?: string;
  sdkVersion?: string;
  sessionId?: string;
  elapsedSeconds?: number;
  requestId?: string;
};

export type DramaLibrarySnapshotItem = {externalId: string; episodeIndex: number; actionTime: number};
export type DramaLibrarySnapshot = {
  favorites: DramaLibrarySnapshotItem[];
  histories: DramaLibrarySnapshotItem[];
  favoritesAvailable?: boolean;
  historiesAvailable?: boolean;
};

interface DramaContentNativeModule {
  initialize(configName: string, debug: boolean): Promise<void>;
  isReady(): Promise<boolean>;
  openDramaDetail(dramaId: string, episodeIndex: number, config: ShortDramaRuntimeConfig): Promise<void>;
  notifyUnlockAdShown(requestId: string, cpm: string): Promise<void>;
  resolveUnlockAd(requestId: string, success: boolean, transactionId: string, cpm: string): Promise<void>;
  showUnlockReward(awardedCoins: string, coinBalance: string): Promise<void>;
  loginUser(userId: string): Promise<void>;
  setFavorite(dramaId: string, episodeIndex: number, state: boolean): Promise<void>;
  getLibrarySnapshot(): Promise<DramaLibrarySnapshot>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const PLAYBACK_EVENT_NAME = 'hlyDramaPlayback';
const nativeModule = NativeModules.DramaContent as DramaContentNativeModule | undefined;
const eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule) : undefined;
let initializing: Promise<void> | undefined;

/** Pangrowth 唯一 TS 入口；业务页面不直接依赖 NativeModules。 */
export const dramaNative = {
  available: Platform.OS === 'android' && Boolean(nativeModule),
  initialize: (configName = `SDK_Setting_${shortDramaSdkSettingId}.json`, debug = __DEV__) => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    if (!initializing) {
      initializing = nativeModule.initialize(configName, debug).catch(error => {
        initializing = undefined;
        throw error;
      });
    }
    return initializing;
  },
  open: async (dramaId: string, episodeIndex = 0, config: ShortDramaRuntimeConfig) => {
    if (!nativeModule) throw new Error('短剧原生模块尚未安装');
    if (!(await nativeModule.isReady())) await dramaNative.initialize();
    return nativeModule.openDramaDetail(dramaId, episodeIndex, config);
  },
  notifyUnlockAdShown: (requestId: string, cpm = '') => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.notifyUnlockAdShown(requestId, cpm);
  },
  resolveUnlockAd: (requestId: string, success: boolean, transactionId = '', cpm = '') => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.resolveUnlockAd(requestId, success, transactionId, cpm);
  },
  showUnlockReward: (awardedCoins: string | number, coinBalance: string | number) => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.showUnlockReward(String(awardedCoins), String(coinBalance));
  },
  loginUser: (userId: string) => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.loginUser(userId);
  },
  setFavorite: (dramaId: string, episodeIndex: number, state: boolean) => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.setFavorite(dramaId, episodeIndex, state);
  },
  getLibrarySnapshot: () => {
    if (!nativeModule) return Promise.reject(new Error('短剧原生模块尚未安装'));
    return nativeModule.getLibrarySnapshot();
  },
  addPlaybackListener: (
    listener: (event: DramaPlaybackEvent) => void,
  ): EmitterSubscription | undefined => eventEmitter?.addListener(
    PLAYBACK_EVENT_NAME,
    listener,
  ),
};
